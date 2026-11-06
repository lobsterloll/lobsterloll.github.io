$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (!(Test-Path '.venv/Scripts/python.exe')) { throw 'Run setup.ps1 first.' }
Start-Process 'http://127.0.0.1:6971'
& ./.venv/Scripts/python.exe receiver.py --demo
