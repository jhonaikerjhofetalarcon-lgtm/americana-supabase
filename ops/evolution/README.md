# Evolution API local (pruebas gratuitas)

```powershell
Copy-Item .env.example .env
# Cambia AUTHENTICATION_API_KEY y EVOLUTION_DB_PASSWORD por claves aleatorias.
docker compose up -d
Invoke-RestMethod http://localhost:8080
```

Esta instalación usa el DNS actual de Docker y del equipo; no fije una IP de una red Wi-Fi anterior.
Es para pruebas: la computadora debe permanecer encendida. Para que Supabase pueda
llamar a Evolution API necesitaremos un túnel público temporal (Cloudflare Tunnel).

## Túnel Cloudflare temporal

Desde esta carpeta, con Evolution API ya levantado, ejecute en PowerShell:

```powershell
docker run -d --name dental-cloudflared --restart unless-stopped `
  --network evolution_evolution-net `
  cloudflare/cloudflared:latest tunnel --no-autoupdate --url http://evolution-api:8080
docker logs dental-cloudflared
```

Copie la URL `https://...trycloudflare.com` que aparece en los logs y actualice el secreto remoto:

```powershell
npx supabase secrets set EVOLUTION_API_URL=https://<URL_DEL_TUNEL>
```

La URL cambia cada vez que se crea un Quick Tunnel. Para producción use un túnel nombrado con dominio
propio; este túnel temporal solo sirve para pruebas y requiere mantener el equipo encendido.

Si aparece `Tunnel not found` o un error DNS, renueve la URL y sincronícela con Supabase ejecutando
desde la raíz del repositorio:

```powershell
powershell -ExecutionPolicy Bypass -File .\ops\evolution\refresh-tunnel.ps1
```

El script espera la propagación DNS, actualiza `EVOLUTION_API_URL` y vuelve a desplegar
`whatsapp-session`. Después genere un QR nuevo desde el sistema.
