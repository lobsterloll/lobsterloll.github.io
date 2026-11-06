param(
    [string]$EngineRoot = 'D:\Workplaces\UE_5.8'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$project = Get-Content -LiteralPath (Join-Path $projectRoot 'RacingMVP.uproject') -Raw | ConvertFrom-Json
$engineVersion = Get-Content -LiteralPath (Join-Path $EngineRoot 'Engine\Build\Build.version') -Raw | ConvertFrom-Json
if ($engineVersion.MajorVersion -ne 5 -or $engineVersion.MinorVersion -ne 8 -or $engineVersion.PatchVersion -ne 3) {
    throw "Expected UE 5.8.3; found $($engineVersion.MajorVersion).$($engineVersion.MinorVersion).$($engineVersion.PatchVersion)"
}
if ($project.EngineAssociation -ne '5.8' -or $project.Description -notmatch '5\.8\.3') {
    throw 'The project descriptor does not record the pinned UE 5.8.3 version.'
}
$pluginNames = @($project.Plugins | Where-Object Enabled | ForEach-Object Name)
foreach ($required in @('ChaosVehiclesPlugin', 'EnhancedInput')) {
    if ($required -notin $pluginNames) { throw "Required plugin is not enabled: $required" }
}
if ('ChaosModularVehicle' -in @($project.Plugins | ForEach-Object Name)) { throw 'ChaosModularVehicle appears in the project descriptor.' }
$moduleRules = Get-Content -LiteralPath (Join-Path $projectRoot 'Source\RacingMVP\RacingMVP.Build.cs') -Raw
if ($moduleRules -match 'ChaosModularVehicle') { throw 'Forbidden module dependency found.' }
if ($moduleRules -notmatch '"ChaosVehicles"') { throw 'ChaosVehicles module dependency missing.' }
$sourceFiles = Get-ChildItem -LiteralPath (Join-Path $projectRoot 'Source') -Recurse -File | Where-Object { $_.Extension -in '.h', '.cpp', '.cs' }
foreach ($file in $sourceFiles) {
    if ((Get-Content -LiteralPath $file.FullName -Raw) -match 'ChaosModularVehicle') {
        throw "Forbidden source reference: $($file.FullName)"
    }
}
$mapPath = Join-Path $projectRoot 'Content\RacingMVP\Maps\L_P0Test.umap'
if (-not (Test-Path -LiteralPath $mapPath)) { throw 'P0 test map is missing.' }
Write-Host 'P0 verification passed: UE 5.8.3, production Chaos Vehicles, Enhanced Input, no modular vehicle dependency.'
