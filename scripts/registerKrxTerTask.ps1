$ErrorActionPreference = "Stop"

$taskName = "ENUF KRX ETF TER Sync"
$runner = Join-Path $PSScriptRoot "runKrxTerSync.ps1"
$taskCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$runner`""

$runAs = "$env:USERDOMAIN\$env:USERNAME"
& schtasks.exe /Create /F /TN $taskName /TR $taskCommand /SC MONTHLY /D 2 /ST 09:00 /RU $runAs /IT /RL LIMITED
if ($LASTEXITCODE -ne 0) {
  throw "Failed to register scheduled task (exit code $LASTEXITCODE)"
}

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable
Set-ScheduledTask -TaskName $taskName -Settings $settings | Out-Null

Write-Host "Registered '$taskName' for 09:00 on day 2 of every month."
