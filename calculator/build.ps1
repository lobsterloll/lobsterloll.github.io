param([string]$OutputDirectory = (Join-Path $PSScriptRoot 'publish'))
$ErrorActionPreference = 'Stop'
$taskDotnet = (Get-Command dotnet -ErrorAction SilentlyContinue).Source
if (-not $taskDotnet) { $taskDotnet = Join-Path $PSScriptRoot '..\keyboardwarrior\.dotnet\dotnet.exe' }
if (-not (Test-Path -LiteralPath $taskDotnet)) { throw 'Install the .NET 8 SDK to build this app.' }
Push-Location $PSScriptRoot
try {
    & node server/setup.mjs
    if ($LASTEXITCODE -ne 0) { throw 'License key setup failed.' }
    & $taskDotnet run --project tests/CalculatorTests.csproj -c Release
    if ($LASTEXITCODE -ne 0) { throw 'Calculator tests failed.' }
    & node --test server/interac-server.test.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Payment tests failed.' }
    & $taskDotnet publish app/LobsterCalc.csproj -c Release -r win-x64 --self-contained true `
        -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true `
        -p:EnableCompressionInSingleFile=true -p:DebugType=None -p:DebugSymbols=false -o $OutputDirectory
    if ($LASTEXITCODE -ne 0) { throw 'Windows EXE build failed.' }
    Copy-Item -LiteralPath app/calculator-config.example.json -Destination (Join-Path $OutputDirectory 'calculator-config.json')
    Copy-Item -LiteralPath README.md -Destination (Join-Path $OutputDirectory 'README.txt')
    Write-Output "Built: $(Join-Path $OutputDirectory 'LobsterCalc.exe')"
} finally { Pop-Location }
