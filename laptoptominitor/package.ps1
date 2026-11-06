$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
New-Item -ItemType Directory -Force outputs | Out-Null
$files = @('receiver.py','simulator.py','protocol.py','requirements.txt','setup.ps1','run-demo.ps1','package.ps1','README.md','LICENSE','docs','switch','tests')
Compress-Archive -Path $files -DestinationPath outputs/LaptopLink-source.zip -Force
Write-Host 'Created outputs/LaptopLink-source.zip (Python required; no console binary)'
