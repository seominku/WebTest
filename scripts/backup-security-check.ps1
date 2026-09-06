param([switch]$SelfTest)

$ErrorActionPreference = 'Stop'

function Test-BackupChildPath {
  param([string]$Root, [string]$Candidate)
  $prefix = [IO.Path]::GetFullPath($Root).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  return [IO.Path]::GetFullPath($Candidate).StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)
}

function Get-AdditionalAccessCount {
  param($Rules, [string]$OwnerSid)
  $trusted = @($OwnerSid, 'S-1-5-18', 'S-1-5-32-544')
  $count = 0
  foreach ($rule in $Rules) {
    # Review grants, not effective access: group membership and deny rules may differ.
    if ([string]$rule.AccessControlType -eq 'Allow' -and
        [string]$rule.IdentityReference -notin $trusted -and
        (([int]$rule.FileSystemRights -band 3) -ne 0)) {
      $count++
    }
  }
  return $count
}

if ($SelfTest) {
  $owner = 'S-1-5-21-111-222-333-1001'
  $tests = 0
  foreach ($sid in @($owner, 'S-1-5-18', 'S-1-5-32-544')) {
    $rule = [pscustomobject]@{AccessControlType='Allow';IdentityReference=$sid;FileSystemRights=3}
    if ((Get-AdditionalAccessCount @($rule) $owner) -ne 0) { throw 'Trusted principal check failed' }
    $tests++
  }
  foreach ($rights in @(1, 2, 3)) {
    $rule = [pscustomobject]@{AccessControlType='Allow';IdentityReference='S-1-1-0';FileSystemRights=$rights}
    if ((Get-AdditionalAccessCount @($rule) $owner) -ne 1) { throw 'Additional grant check failed' }
    $tests++
  }
  $deny = [pscustomobject]@{AccessControlType='Deny';IdentityReference='S-1-1-0';FileSystemRights=3}
  if ((Get-AdditionalAccessCount @($deny) $owner) -ne 0) { throw 'Deny rule check failed' }
  $tests++
  $root = 'C:\backup-security-test\backups'
  if (-not (Test-BackupChildPath $root (Join-Path $root 'bundle\file.dump'))) { throw 'Child path check failed' }
  $tests++
  foreach ($candidate in @($root, 'C:\backup-security-test\backups-other\file', 'C:\backup-security-test\backups\..\outside')) {
    if (Test-BackupChildPath $root $candidate) { throw 'Escaping path check failed' }
    $tests++
  }
  [pscustomobject]@{status='ok';testsPassed=$tests;filesModified=0} | ConvertTo-Json
  exit 0
}

try {
  $repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
  $backups = Join-Path $repository 'backups'
  if (-not (Test-Path -LiteralPath $backups)) {
    [pscustomobject]@{status='no_backups';automaticDeletionEnabled=$false;filesModified=0} | ConvertTo-Json
    exit 0
  }
  $rootItem = Get-Item -LiteralPath $backups -Force
  if (-not $rootItem.PSIsContainer -or ($rootItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Unsafe backup root' }
  $rootAcl = Get-Acl -LiteralPath $backups
  $ownerSid = $rootAcl.GetOwner([Security.Principal.SecurityIdentifier]).Value
  $queue = [Collections.Generic.Queue[string]]::new()
  $queue.Enqueue($backups)
  $items = 0
  $fileCount = 0
  $readableFormatFiles = 0
  $encryptedCandidates = 0
  $grantReviewItems = 0
  $inheritedItems = 0
  $skippedLinks = 0
  $bytes = [long]0
  $oldest = $null
  while ($queue.Count -gt 0) {
    $directory = $queue.Dequeue()
    $item = Get-Item -LiteralPath $directory -Force
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { $skippedLinks++; continue }
    $acl = Get-Acl -LiteralPath $directory
    $rules = $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])
    if ((Get-AdditionalAccessCount $rules $ownerSid) -gt 0) { $grantReviewItems++ }
    if (@($rules | Where-Object IsInherited).Count -gt 0) { $inheritedItems++ }
    $items++
    if ($items -gt 10000) { throw 'Backup inventory limit exceeded' }
    foreach ($child in Get-ChildItem -LiteralPath $directory -Force) {
      if (-not (Test-BackupChildPath $backups $child.FullName)) { throw 'Path outside backup root' }
      if ($child.Attributes -band [IO.FileAttributes]::ReparsePoint) { $skippedLinks++; continue }
      if ($child.PSIsContainer) {
        $queue.Enqueue($child.FullName)
        if ($items + $queue.Count -gt 10000) { throw 'Backup inventory limit exceeded' }
        continue
      }
      $items++
      if ($items -gt 10000) { throw 'Backup inventory limit exceeded' }
      $fileCount++
      $bytes += $child.Length
      if ($null -eq $oldest -or $child.LastWriteTimeUtc -lt $oldest) { $oldest = $child.LastWriteTimeUtc }
      if ($child.Extension -in @('.dump', '.webp', '.json', '.tar', '.zip')) { $readableFormatFiles++ }
      if ($child.Extension -in @('.age', '.gpg', '.pgp')) { $encryptedCandidates++ }
      $fileAcl = Get-Acl -LiteralPath $child.FullName
      $fileRules = $fileAcl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])
      if ((Get-AdditionalAccessCount $fileRules $ownerSid) -gt 0) { $grantReviewItems++ }
      if (@($fileRules | Where-Object IsInherited).Count -gt 0) { $inheritedItems++ }
    }
  }
  $attention = $grantReviewItems -gt 0 -or $readableFormatFiles -gt 0 -or $encryptedCandidates -gt 0 -or $skippedLinks -gt 0
  [pscustomobject]@{
    status= $(if ($attention) { 'needs_attention' } else { 'metadata_check_only' })
    scope='local_read_only_backup_metadata_and_acl'
    checkedAt=[DateTime]::UtcNow.ToString('o')
    files=$fileCount
    bytes=$bytes
    readableFormatFiles=$readableFormatFiles
    encryptedExtensionCandidates=$encryptedCandidates
    encryptionVerified=$false
    itemsWithAdditionalReadOrWriteGrants=$grantReviewItems
    itemsWithInheritedRules=$inheritedItems
    effectiveAccessEvaluated=$false
    skippedReparsePoints=$skippedLinks
    oldestFileWriteUtc= $(if ($oldest) { $oldest.ToString('o') } else { $null })
    automaticDeletionEnabled=$false
    aclModified=$false
    filesModified=0
  } | ConvertTo-Json
  if ($attention) { exit 1 }
} catch {
  Write-Output '{"status":"check_failed","filesModified":0,"detail":"Unable to inspect backup paths or ACLs; no permissions were changed."}'
  exit 1
}
