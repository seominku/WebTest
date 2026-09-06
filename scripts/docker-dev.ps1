param(
    [ValidateSet('up', 'infra', 'build', 'down', 'ps', 'logs', 'config')]
    [string]$Action = 'up'
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$asciiAlias = Join-Path ([System.IO.Path]::GetTempPath()) 'real-estate-platform-src'
$dockerExecutable = (Get-Command docker.exe -ErrorAction SilentlyContinue).Source

if (-not $dockerExecutable) {
    $desktopDocker = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe'
    if (Test-Path -LiteralPath $desktopDocker) {
        $dockerExecutable = $desktopDocker
    } else {
        throw 'docker.exe를 찾을 수 없습니다. Docker Desktop을 시작한 뒤 다시 실행하세요.'
    }
}

$dockerDirectory = Split-Path -Parent $dockerExecutable
if (($env:Path -split ';') -notcontains $dockerDirectory) {
    $env:Path = "$dockerDirectory;$env:Path"
}

if (Test-Path -LiteralPath $asciiAlias) {
    $existingAlias = Get-Item -LiteralPath $asciiAlias
    if ($existingAlias.LinkType -ne 'Junction' -or $existingAlias.Target -notcontains $repositoryRoot) {
        throw "Docker 빌드용 경로가 이미 다른 대상으로 사용 중입니다: $asciiAlias"
    }
} else {
    New-Item -ItemType Junction -Path $asciiAlias -Target $repositoryRoot | Out-Null
}

Push-Location $asciiAlias
try {
    switch ($Action) {
        'up' {
            & $dockerExecutable compose --env-file .env up -d --build
        }
        'infra' {
            & $dockerExecutable compose --env-file .env up -d postgres redis minio minio-init clamav
        }
        'build' {
            & $dockerExecutable compose --env-file .env build
        }
        'down' {
            & $dockerExecutable compose --env-file .env down
        }
        'ps' {
            & $dockerExecutable compose --env-file .env ps -a
        }
        'logs' {
            & $dockerExecutable compose --env-file .env logs --tail 200
        }
        'config' {
            & $dockerExecutable compose --env-file .env config --quiet
        }
    }

    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
} finally {
    Pop-Location
}
