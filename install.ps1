# pi SAIA Plugin Installer for Windows PowerShell

$ErrorActionPreference = "Stop"

if (-not (Get-Command pi -ErrorAction SilentlyContinue)) {
    Write-Error "The 'pi' CLI was not found in PATH. Install pi first, then re-run this script."
    exit 1
}

$repoDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Installing pi-saia-plugin from $repoDir ..."
& pi install $repoDir
if ($LASTEXITCODE -ne 0) {
    Write-Error "pi install failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Plugin installed."
Write-Host ""
Write-Host "Next steps:"
if (Test-Path env:SAIA_API_KEY) {
    Write-Host "  - SAIA_API_KEY is already set in this session; pi will use it."
} else {
    Write-Host "  - Provide your SAIA key (https://chat-ai.academiccloud.de/):"
    Write-Host "      [Environment]::SetEnvironmentVariable('SAIA_API_KEY', 'your_key_here', 'User')"
    Write-Host "    or store it once with:  pi auth"
}
Write-Host "  - Verify:  pi --list-models | Select-String '^saia'"
Write-Host "  - Use:     pi --model saia/best-for-coding '...'"
