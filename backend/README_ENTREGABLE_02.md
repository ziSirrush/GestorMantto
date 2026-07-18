# Entregable 02 - Bootstrap Backend V2

## Alcance

Este paquete prepara el punto de entrada modular del backend sin modificar controladores, rutas funcionales ni contratos existentes.

## Archivos que deben conservarse desde la copia actual

La carpeta `src/` debe seguir conteniendo las rutas, controladores, middleware y jobs existentes, entre ellos:

- `src/routes/auth.routes.js`
- `src/routes/data.routes.js`
- `src/routes/support.routes.js`
- `src/routes/usuarios.routes.js`
- `src/routes/catalogos.routes.js`
- `src/routes/dev.routes.js`
- `src/routes/logistica.routes.js`
- `src/routes/usuarios-rel-admin.routes.js`
- `src/routes/ins-fl.routes.js`
- `src/jobs/portafolioCierreMensual.job.js`
- `src/jobs/portafolioCierreSemanal.job.js`

## Instalacion

1. Copiar este paquete sobre la copia de trabajo.
2. Crear `.env` a partir de `.env.example` y colocar las credenciales locales reales.
3. Ejecutar en PowerShell:

```powershell
.\start-local.ps1
```

## Validacion

- `npm run check`
- `npm run dev`
- Abrir `http://localhost:3001/api/health`
- Confirmar rutas ya existentes.

## Nota sobre fallback de API

La seleccion unica entre `localhost` y la API remota corresponde al cliente frontend, porque es el navegador quien decide a cual backend llamar. Este entregable prepara y estabiliza el backend local; no agrega reintentos de escritura ni cambia de base de datos automaticamente.
