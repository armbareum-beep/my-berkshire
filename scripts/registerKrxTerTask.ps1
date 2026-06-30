$ErrorActionPreference = "Stop"

$taskName = "ENUF KRX ETF TER Sync"
$runner = Join-Path $PSScriptRoot "runKrxTerSync.ps1"
$taskCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$runner`""

$runAs = "$env:USERDOMAIN\$env:USERNAME"
# DAILY 09:00 — 세션 쿠키 유효기간이 ~24시간이라 매일 실행해야 세션이 유지됨.
# TER 데이터가 바뀐 경우만 업서트, 부하 없음.
& schtasks.exe /Create /F /TN $taskName /TR $taskCommand /SC DAILY /ST 09:00 /RU $runAs /IT /RL LIMITED
if ($LASTEXITCODE -ne 0) {
  throw "Failed to register scheduled task (exit code $LASTEXITCODE)"
}

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable
Set-ScheduledTask -TaskName $taskName -Settings $settings | Out-Null

Write-Host "Registered '$taskName' for 09:00 daily."
