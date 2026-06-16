$ErrorActionPreference = "SilentlyContinue"
$root   = Split-Path -Parent $PSScriptRoot
$runDir = Join-Path $root ".run"

foreach ($name in @("tunnel", "server")) {
  $pidFile = Join-Path $runDir "$name.pid"
  if (Test-Path $pidFile) {
    $procId = (Get-Content $pidFile | Select-Object -First 1).Trim()
    if ($procId) {
      try {
        Stop-Process -Id ([int]$procId) -Force -ErrorAction Stop
        Write-Host "Stopped $name (PID $procId)"
      }
      catch {
        Write-Host "$name (PID $procId) was not running"
      }
    }
    Remove-Item $pidFile -Force
  }
}

Remove-Item (Join-Path $runDir "url.txt") -Force -ErrorAction SilentlyContinue
Write-Host "Down."
