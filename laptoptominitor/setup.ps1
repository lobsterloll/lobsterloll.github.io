$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
python -m venv .venv
if ($LASTEXITCODE) { throw 'Python 3.11 or newer is required.' }
& ./.venv/Scripts/python.exe -m pip install --no-cache-dir -r requirements.txt
if ($LASTEXITCODE) { throw 'Dependency installation failed.' }
