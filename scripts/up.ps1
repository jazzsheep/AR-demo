param([int]$Port = 8080)

$ErrorActionPreference = "Stop"
$root   = Split-Path -Parent $PSScriptRoot
$runDir = Join-Path $root ".run"
$srcDir = Join-Path $root "docs"
New-Item -ItemType Directory -Force -Path $runDir | Out-Null

# --- 1) Static web server ---------------------------------------------------
# Use -WorkingDirectory (handles spaces in the path) instead of --directory,
# and bind to 127.0.0.1 so it matches the tunnel's IPv4 origin.
$srvOut = Join-Path $runDir "server.log"
$srvErr = Join-Path $runDir "server.err"
Remove-Item $srvOut, $srvErr -ErrorAction SilentlyContinue

$server = Start-Process -FilePath "python" `
  -ArgumentList "-m http.server $Port --bind 127.0.0.1" `
  -WorkingDirectory $srcDir `
  -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput $srvOut -RedirectStandardError $srvErr
$server.Id | Out-File -Encoding ascii (Join-Path $runDir "server.pid")
Write-Host "Web server started (PID $($server.Id)) : http://127.0.0.1:$Port"

# Give it a moment and confirm it is actually listening.
Start-Sleep -Milliseconds 800
$listening = $false
for ($i = 0; $i -lt 10; $i++) {
  if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
    $listening = $true; break
  }
  Start-Sleep -Milliseconds 400
}
if (-not $listening) {
  Write-Host "ERROR: web server did not start. See .run/server.err"
  if (Test-Path $srvErr) { Get-Content $srvErr | Select-Object -Last 10 | ForEach-Object { Write-Host "  $_" } }
  exit 1
}

# --- 2) Cloudflare quick tunnel (force IPv4 origin) -------------------------
$tunOut = Join-Path $runDir "tunnel.log"
$tunErr = Join-Path $runDir "tunnel.err"
Remove-Item $tunOut, $tunErr -ErrorAction SilentlyContinue

$tunnel = Start-Process -FilePath "cloudflared" `
  -ArgumentList "tunnel --url http://127.0.0.1:$Port" `
  -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput $tunOut -RedirectStandardError $tunErr
$tunnel.Id | Out-File -Encoding ascii (Join-Path $runDir "tunnel.pid")
Write-Host "Cloudflare tunnel starting (PID $($tunnel.Id)) ..."

# --- 3) Parse the public URL out of cloudflared's output --------------------
$url = $null
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 600
  $content = ""
  if (Test-Path $tunOut) { $content += (Get-Content $tunOut -Raw -ErrorAction SilentlyContinue) }
  if (Test-Path $tunErr) { $content += (Get-Content $tunErr -Raw -ErrorAction SilentlyContinue) }
  $m = [regex]::Match($content, "https://[a-z0-9-]+\.trycloudflare\.com")
  if ($m.Success) { $url = $m.Value; break }
}

if ($url) {
  $url | Out-File -Encoding ascii (Join-Path $runDir "url.txt")
  Write-Host ""
  Write-Host "==================================================================="
  Write-Host "  Public URL : $url"
  Write-Host "  Open this URL on your phone/PC browser (HTTPS), then tap Start."
  Write-Host "==================================================================="
}
else {
  Write-Host "Tunnel URL not detected yet. Check .run/tunnel.err"
}
