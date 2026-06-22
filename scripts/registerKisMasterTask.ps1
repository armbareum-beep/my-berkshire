$ErrorActionPreference = "Stop"

# 종목마스터는 신규상장 반영 위해 매일 갱신(장 시작 전 08:30).
$taskName = "ENUF KIS Security Master Sync"
$runner = Join-Path $PSScriptRoot "runKisMasterSync.ps1"
$taskCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$runner`""

$runAs = "$env:USERDOMAIN\$env:USERNAME"
& schtasks.exe /Create /F /TN $taskName /TR $taskCommand /SC DAILY /ST 08:30 /RU $runAs /IT /RL LIMITED
if ($LASTEXITCODE -ne 0) {
  throw "Failed to register scheduled task (exit code $LASTEXITCODE)"
}

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable
Set-ScheduledTask -TaskName $taskName -Settings $settings | Out-Null

Write-Host "Registered '$taskName' for 08:30 daily."
