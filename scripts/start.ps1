param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Home', 'Public')]
    [string]$Mode,
    [switch]$Build,
    [switch]$Check
)

$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$baseArguments = @('compose', '--project-directory', $projectRoot, '-f', (Join-Path $projectRoot 'compose.yaml'))
$composeArguments = $baseArguments
if ($Mode -eq 'Public') {
    $composeArguments += @('-f', (Join-Path $projectRoot 'compose.public.yaml'))
}

& docker @composeArguments config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Invalid Compose configuration.' }
if ($Mode -eq 'Public') {
    $resolvedText = & docker @composeArguments config --format json
    if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect public Compose configuration.' }
    $resolved = ($resolvedText -join "`n") | ConvertFrom-Json
    if ($resolved.services.torrserver -or $resolved.services.prowlarr) {
        throw 'Public mode must not enable home-torrent. Check COMPOSE_PROFILES.'
    }
    foreach ($key in @('TORRSERVER_BASE_URL', 'TORRSERVER_USERNAME_FILE', 'TORRSERVER_PASSWORD_FILE', 'TORRENT_IDEMPOTENCY_SECRET_FILE', 'PROWLARR_BASE_URL', 'PROWLARR_API_KEY_FILE', 'JACRED_BASE_URL')) {
        if ($resolved.services.backend.environment.$key) {
            throw "Public mode inherited $key from the host environment. Unset it before starting."
        }
    }
}
if ($Check) {
    Write-Output "$Mode configuration is valid. No services changed."
    return
}

if ($Mode -eq 'Public') {
    # Inactive profiles do not stop existing containers. Keep their volumes for Home.
    & docker @baseArguments stop torrserver prowlarr
    if ($LASTEXITCODE -ne 0) { throw 'Cannot stop the home torrent services.' }
}
$startArguments = @('up', '-d')
if ($Build) { $startArguments += '--build' }
& docker @composeArguments @startArguments
if ($LASTEXITCODE -ne 0) { throw "Cannot start $Mode mode." }
Write-Output "$Mode mode started. Existing database, assets and Docker volumes were preserved."
