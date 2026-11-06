$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$python = Join-Path $projectRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) { throw 'Run .\setup.ps1 first.' }

$env:PIP_CACHE_DIR = Join-Path $projectRoot '.cache'
$env:PYINSTALLER_CONFIG_DIR = Join-Path $projectRoot '.cache\pyinstaller'
$env:TEMP = Join-Path $projectRoot '.temp'
$env:TMP = $env:TEMP
New-Item -ItemType Directory -Force -Path $env:PIP_CACHE_DIR, $env:PYINSTALLER_CONFIG_DIR, $env:TEMP | Out-Null

& $python -m pip install --disable-pip-version-check pyinstaller==6.22.3
if ($LASTEXITCODE -ne 0) { throw 'Could not install the build tool.' }

& $python -m PyInstaller --noconfirm --clean --onedir --windowed `
    --name JoyConBridge `
    --distpath (Join-Path $projectRoot 'dist') `
    --workpath (Join-Path $projectRoot 'build') `
    --specpath (Join-Path $projectRoot 'build') `
    --hidden-import hid --collect-submodules vgamepad --collect-binaries vgamepad `
    (Join-Path $projectRoot 'desktop.py')
if ($LASTEXITCODE -ne 0) { throw 'Could not build JoyConBridge.exe.' }

Write-Host "Ready: $(Join-Path $projectRoot 'dist\JoyConBridge\JoyConBridge.exe')"
