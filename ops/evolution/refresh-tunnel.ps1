param(
  [string]$ProjectRef = 'cnwnecyodyxoszvmfxuc'
)

$ErrorActionPreference = 'Stop'
$containerName = 'dental-cloudflared'
$networkName = 'evolution_evolution-net'
$remoteEnvPath = Join-Path $PSScriptRoot '.env.supabase'

docker rm -f $containerName *> $null
docker run -d --name $containerName --restart unless-stopped `
  --network $networkName `
  cloudflare/cloudflared:latest tunnel --no-autoupdate --url http://evolution-api:8080 *> $null
if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar el túnel de Cloudflare.' }

$publicUrl = $null
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $logs = docker logs $containerName 2>&1 | Out-String
  $ErrorActionPreference = $previousPreference
  if ($logs -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
    $publicUrl = $Matches[0]
    break
  }
  Start-Sleep -Seconds 2
}
if (-not $publicUrl) { throw 'Cloudflare no generó una URL temporal.' }

$hostName = ([uri]$publicUrl).Host
$resolved = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  try {
    Resolve-DnsName $hostName -Server 1.1.1.1 -ErrorAction Stop *> $null
    $resolved = $true
    break
  } catch {
    Start-Sleep -Seconds 2
  }
}
if (-not $resolved) { throw "La URL temporal no apareció en DNS: $publicUrl" }

$envContent = if (Test-Path $remoteEnvPath) { Get-Content -Raw $remoteEnvPath } else { '' }
if ($envContent -match '(?m)^EVOLUTION_API_URL=') {
  $envContent = $envContent -replace '(?m)^EVOLUTION_API_URL=.*$', "EVOLUTION_API_URL=$publicUrl"
} else {
  $envContent = $envContent.TrimEnd() + "`r`nEVOLUTION_API_URL=$publicUrl`r`n"
}
[IO.File]::WriteAllText($remoteEnvPath, $envContent, (New-Object Text.UTF8Encoding($false)))

npx --yes supabase secrets set --project-ref $ProjectRef "EVOLUTION_API_URL=$publicUrl"
if ($LASTEXITCODE -ne 0) { throw 'No se pudo actualizar EVOLUTION_API_URL en Supabase.' }
npx --yes supabase functions deploy whatsapp-session --project-ref $ProjectRef --use-api
if ($LASTEXITCODE -ne 0) { throw 'No se pudo desplegar whatsapp-session.' }

Write-Output "Evolution disponible en $publicUrl"
Write-Output 'Abra WhatsApp > Automatizaciones > Ver conexión y genere un QR nuevo.'
