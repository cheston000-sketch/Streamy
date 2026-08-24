param(
    [int]$Version = 0,
    [string]$OtaBaseUrl = "https://streamy-vez5.onrender.com",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$androidDir = Join-Path $repoRoot "android"
$buildFile = Join-Path $androidDir "app\build.gradle"
$apkPath = Join-Path $androidDir "app\build\outputs\apk\debug\app-debug.apk"
$wwwDir = Join-Path $repoRoot "www"

if ($Version -le 0) {
    $buildGradle = Get-Content -Path $buildFile -Raw
    $versionMatch = [regex]::Match($buildGradle, "versionCode\s+(\d+)")
    if (-not $versionMatch.Success) {
        throw "Unable to determine versionCode from android/app/build.gradle"
    }
    $Version = [int]$versionMatch.Groups[1].Value
}

Write-Host "Preparing StreamOS OTA v$Version..."

if (-not $SkipBuild) {
    Push-Location $androidDir
    try {
        & cmd /c gradlew.bat assembleDebug
        if ($LASTEXITCODE -ne 0) {
            throw "Gradle build failed with exit code $LASTEXITCODE"
        }
    } finally {
        Pop-Location
    }
}

if (-not (Test-Path $apkPath)) {
    throw "APK not found at $apkPath"
}

$stagedApk = Join-Path $wwwDir "StreamOS_v$Version.apk"
Copy-Item -LiteralPath $apkPath -Destination $stagedApk -Force

$stagedInfo = Get-Item -LiteralPath $stagedApk
if ($stagedInfo.Length -lt 1MB) {
    throw "Staged APK is unexpectedly small: $($stagedInfo.Length) bytes"
}

Write-Host "Staged OTA APK: $stagedApk"
Write-Host "Size: $([math]::Round($stagedInfo.Length / 1MB, 2)) MB"

try {
    $ota = Invoke-RestMethod -Uri "$OtaBaseUrl/api/ota" -Method Get -TimeoutSec 20
    Write-Host "Remote OTA currently reports version: $($ota.version)"
    if ([int]$ota.version -ne $Version) {
        Write-Warning "Remote OTA does not report v$Version yet. Deploy the updated www/server package or upload the staged APK before announcing the update."
    } else {
        Write-Host "Remote OTA version matches staged build."
    }
} catch {
    Write-Warning "Unable to verify remote OTA endpoint: $($_.Exception.Message)"
}

Write-Host "Guardrail complete. Local OTA artifact is ready."
