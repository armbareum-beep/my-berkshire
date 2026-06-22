$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$logDirectory = Join-Path $projectRoot "logs"
$logFile = Join-Path $logDirectory "krx-ter-sync.log"
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source

New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
Set-Location $projectRoot

"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Starting KRX ETF TER sync" | Add-Content $logFile
try {
  & $npm run sync:krx-ter *>> $logFile
  if ($LASTEXITCODE -ne 0) {
    throw "npm exited with code $LASTEXITCODE"
  }
  "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Sync completed" | Add-Content $logFile
} catch {
  "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Sync failed: $_" | Add-Content $logFile
  exit 1
}
