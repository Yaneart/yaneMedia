[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$secretDirectory = Join-Path $PSScriptRoot '..\storage\torrent-engine\secrets'
$usernamePath = Join-Path $secretDirectory 'username'
$passwordPath = Join-Path $secretDirectory 'password'
$idempotencyPath = Join-Path $secretDirectory 'idempotency'

New-Item -ItemType Directory -Path $secretDirectory -Force | Out-Null

if (-not (Test-Path -LiteralPath $usernamePath)) {
    [System.IO.File]::WriteAllText($usernamePath, 'yanemedia-torrent')
}

if (-not (Test-Path -LiteralPath $passwordPath)) {
    $passwordBytes = New-Object byte[] 32
    $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $random.GetBytes($passwordBytes)
    }
    finally {
        $random.Dispose()
    }
    $password = [Convert]::ToBase64String($passwordBytes)
    [System.IO.File]::WriteAllText($passwordPath, $password)
}

if (-not (Test-Path -LiteralPath $idempotencyPath)) {
    $bytes = New-Object byte[] 32
    $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $random.GetBytes($bytes)
    }
    finally {
        $random.Dispose()
    }
    [System.IO.File]::WriteAllText($idempotencyPath, [Convert]::ToBase64String($bytes))
}

Write-Output "TorrServer secrets are ready in the ignored storage directory."
