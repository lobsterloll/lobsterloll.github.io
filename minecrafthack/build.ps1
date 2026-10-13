param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $GradleArguments = @('build')
)

$ErrorActionPreference = 'Stop'
$env:GRADLE_USER_HOME = Join-Path $PSScriptRoot 'work\gradle-user-home'
$env:TEMP = Join-Path $PSScriptRoot 'work\tmp'
$env:TMP = $env:TEMP
New-Item -ItemType Directory -Force -Path $env:GRADLE_USER_HOME, $env:TEMP | Out-Null
$env:JAVA_TOOL_OPTIONS = "$env:JAVA_TOOL_OPTIONS `"-Djava.io.tmpdir=$env:TEMP`"".Trim()

if (-not $env:JAVA_HOME) {
    $env:JAVA_HOME = Join-Path $PSScriptRoot 'work\tools\jdk-25.0.4.1+1'
}

Push-Location $PSScriptRoot
try {
    & .\gradlew.bat @GradleArguments
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
