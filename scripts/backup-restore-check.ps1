param(
  [string]$OutputDirectory = "backups"
)

$ErrorActionPreference = "Stop"
$workspace = (Get-Location).Path
$backupDirectory = [System.IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
$workspacePrefix = $workspace.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar

if (-not $backupDirectory.StartsWith($workspacePrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Backup directory must stay inside the workspace"
}

$container = (& docker compose ps -q postgres).Trim()
if (-not $container) {
  throw "PostgreSQL container is not running"
}

$databaseUser = (& docker exec $container printenv POSTGRES_USER).Trim()
$databaseName = (& docker exec $container printenv POSTGRES_DB).Trim()
if (-not $databaseUser -or -not $databaseName) {
  throw "PostgreSQL container environment is incomplete"
}

$safeDatabaseName = $databaseName -replace '[^A-Za-z0-9_]', '_'
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupName = "$safeDatabaseName-$stamp.dump"
$backupPath = Join-Path $backupDirectory $backupName
$containerBackupPath = "/tmp/$backupName"
$restoreDatabase = "${safeDatabaseName}_restore_check_$($stamp -replace '-', '')"

if ($restoreDatabase -notmatch '^[A-Za-z0-9_]+_restore_check_[0-9]+$') {
  throw "Generated restore database name is unsafe"
}

New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
$restoreCreated = $false
$result = $null

try {
  & docker exec $container pg_dump --username $databaseUser --dbname $databaseName --format custom --file $containerBackupPath
  if ($LASTEXITCODE -ne 0) { throw "pg_dump failed" }

  & docker cp "${container}:$containerBackupPath" $backupPath
  if ($LASTEXITCODE -ne 0) { throw "docker cp failed" }

  & docker exec $container createdb --username $databaseUser $restoreDatabase
  if ($LASTEXITCODE -ne 0) { throw "Temporary restore database creation failed" }
  $restoreCreated = $true

  & docker exec $container pg_restore --username $databaseUser --dbname $restoreDatabase --no-owner --no-privileges $containerBackupPath
  if ($LASTEXITCODE -ne 0) { throw "pg_restore failed" }

  $tableCount = (& docker exec $container psql --username $databaseUser --dbname $restoreDatabase --tuples-only --no-align --command "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';").Trim()
  $userCount = (& docker exec $container psql --username $databaseUser --dbname $restoreDatabase --tuples-only --no-align --command "SELECT COUNT(*) FROM users;").Trim()
  $listingCount = (& docker exec $container psql --username $databaseUser --dbname $restoreDatabase --tuples-only --no-align --command "SELECT COUNT(*) FROM listings;").Trim()

  if ([int]$tableCount -lt 1) { throw "Restored database has no public tables" }

  $result = [PSCustomObject]@{
    status = "ok"
    backupPath = $backupPath
    backupBytes = (Get-Item -LiteralPath $backupPath).Length
    restoredTableCount = [int]$tableCount
    restoredUserCount = [int]$userCount
    restoredListingCount = [int]$listingCount
    temporaryDatabaseRemoved = $true
  }
}
finally {
  if ($restoreCreated) {
    & docker exec $container dropdb --username $databaseUser --if-exists $restoreDatabase
  }
  & docker exec $container rm -f -- $containerBackupPath
}

$result | ConvertTo-Json
