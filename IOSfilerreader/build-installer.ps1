$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$dotnet = if (Get-Command dotnet -ErrorAction SilentlyContinue) { 'dotnet' } else { Join-Path $PSScriptRoot 'work/dotnet/dotnet.exe' }
& $dotnet publish src/Launcher.App -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:DebugType=None -o outputs/win-x64
if ($LASTEXITCODE -ne 0) { throw 'Launcher publish failed.' }
& $dotnet test tests/Launcher.Tests -c Release
if ($LASTEXITCODE -ne 0) { throw 'Tests failed.' }
& $dotnet publish src/Launcher.Setup -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:DebugType=None -o outputs/setup
if ($LASTEXITCODE -ne 0) { throw 'Installer publish failed.' }
