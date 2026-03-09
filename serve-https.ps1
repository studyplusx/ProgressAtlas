param(
  [int]$Port = 8443
)

Set-Location $PSScriptRoot

function Get-LocalIPv4Addresses {
  try {
    $addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
      Where-Object {
        $_.IPAddress -ne "127.0.0.1" -and
        $_.IPAddress -notlike "169.254*" -and
        $_.PrefixOrigin -ne "WellKnown"
      } |
      Select-Object -ExpandProperty IPAddress -Unique

    if ($addresses) {
      return $addresses
    }
  } catch {
  }

  return [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) |
    Where-Object {
      $_.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and
      $_.IPAddressToString -ne "127.0.0.1"
    } |
    ForEach-Object { $_.IPAddressToString } |
    Select-Object -Unique
}

$ips = Get-LocalIPv4Addresses
$certDir = Join-Path $PSScriptRoot "certs"
$generator = Join-Path $PSScriptRoot "generate_local_https_cert.py"
$server = Join-Path $PSScriptRoot "https_server.py"

$generateArgs = @($generator, "--cert-dir", $certDir)
foreach ($ip in $ips) {
  $generateArgs += @("--ip", $ip)
}

$generatorOutput = & python @generateArgs
if ($LASTEXITCODE -ne 0) {
  throw "Certificate generation failed."
}

$paths = @{}
foreach ($line in $generatorOutput) {
  if ($line -match "^([A-Z_]+)=(.+)$") {
    $paths[$matches[1]] = $matches[2]
  }
}

Write-Host ""
Write-Host "Progress Atlas HTTPS server is ready from $PSScriptRoot" -ForegroundColor Cyan
Write-Host ""
Write-Host "Trusted CA certificate for smartphone installation:"
Write-Host "  $($paths['CA_CERT_DER'])"
Write-Host ""
Write-Host "Open from this PC:"
Write-Host "  https://localhost:$Port/"
Write-Host ""

if ($ips.Count -gt 0) {
  Write-Host "Open from iPad or smartphone on the same Wi-Fi:"
  foreach ($ip in $ips) {
    Write-Host "  https://$($ip):$Port/"
  }
  Write-Host ""
}

Write-Host "Important:"
Write-Host "  Install and trust the CA certificate on the smartphone first, or the browser will show a certificate warning." -ForegroundColor Yellow
Write-Host "  On iPhone/iPad, after installing the certificate, open Settings > General > About > Certificate Trust Settings and enable full trust." -ForegroundColor Yellow
Write-Host "Stop the server with Ctrl+C." -ForegroundColor Yellow
Write-Host ""

python $server --port $Port --directory $PSScriptRoot --certfile $paths["SERVER_CERT"] --keyfile $paths["SERVER_KEY"]
