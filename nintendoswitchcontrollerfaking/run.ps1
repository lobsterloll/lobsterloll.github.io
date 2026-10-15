$ErrorActionPreference = 'Stop'
$python = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) { throw 'Run .\setup.ps1 first.' }
Push-Location $PSScriptRoot
try { & $python -m joybridge @args }
finally { Pop-Location }
