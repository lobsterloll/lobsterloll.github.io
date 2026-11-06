$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$tempDir = Join-Path $PSScriptRoot 'work\temp'
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
$env:TEMP = $tempDir
$env:TMP = $tempDir
$venv = Join-Path $PSScriptRoot '.venv'
if (-not (Test-Path -LiteralPath $venv)) { python -m venv $venv }
$python = Join-Path $venv 'Scripts\python.exe'
& $python -m pip install --no-cache-dir -r requirements.txt
$env:PYINSTALLER_CONFIG_DIR = Join-Path $PSScriptRoot '.pyinstaller-cache'
& $python -m PyInstaller --noconfirm --clean --onedir --windowed --name DrivingEmpireExitClicker --distpath dist --workpath build --specpath build exit_clicker.py
if ($LASTEXITCODE -ne 0) { throw 'EXE build failed.' }
Compress-Archive -Path '.\dist\DrivingEmpireExitClicker' -DestinationPath '.\DrivingEmpireExitClicker.zip' -Force
Write-Output "Built $PSScriptRoot\dist\DrivingEmpireExitClicker\DrivingEmpireExitClicker.exe"
