param(
  [int]$Port = 8000
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

Write-Host ""
Write-Host "English vocab tracker is being served from $PSScriptRoot" -ForegroundColor Cyan
Write-Host ""
Write-Host "Open from this PC:"
Write-Host "  http://localhost:$Port/"
Write-Host ""

if ($ips.Count -gt 0) {
  Write-Host "Open from iPad or smartphone on the same Wi-Fi:"
  foreach ($ip in $ips) {
    Write-Host "  http://$($ip):$Port/"
  }
  Write-Host ""
}

Write-Host "If Windows Firewall asks, allow access on your private network." -ForegroundColor Yellow
Write-Host "Stop the server with Ctrl+C." -ForegroundColor Yellow
Write-Host ""

python -m http.server $Port --bind 0.0.0.0
