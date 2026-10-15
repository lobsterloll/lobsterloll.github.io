$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$env:VGAMEPAD_SKIP_VIGEMBUS_INSTALL = 'true'
$env:PIP_CACHE_DIR = Join-Path $root '.cache'
$env:TEMP = Join-Path $root '.temp'
$env:TMP = $env:TEMP
New-Item -ItemType Directory -Force -Path $env:PIP_CACHE_DIR, $env:TEMP | Out-Null

if (-not (Get-Command py -ErrorAction SilentlyContinue)) {
    throw 'Python launcher not found. Install Python 3.11 or newer from python.org first.'
}
py -3 -m venv (Join-Path $root '.venv')
if ($LASTEXITCODE -ne 0) { throw 'Could not create the local Python environment.' }
$python = Join-Path $root '.venv\Scripts\python.exe'
& $python -m pip install --disable-pip-version-check -r (Join-Path $root 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Python dependency installation failed.' }
Write-Host 'Python setup complete. Install ViGEmBus 1.22.0 separately from the official Nefarius GitHub release.'
