# Nueva estructura Mantto Gestor - Pruebas con Backend

Este paquete corrige la omision del backend y deja la estructura asi:

```text
Nueva-estructura-Modulos/
├── backend/
└── pruebas/
```

## Importante

No se incluye `.env` real ni `node_modules` para no compartir credenciales ni peso innecesario.
Usa `backend/.env.example` como base y crea tu archivo `backend/.env` local.

## Ejecutar en PowerShell

Terminal 1 - Backend:

```powershell
cd "C:\Users\T14s\Desktop\Nueva-estructura-Modulos\backend"
npm install
npm start
```

Debe quedar activo en:

```text
http://localhost:3001
```

Prueba:

```text
http://localhost:3001/api/health
```

Terminal 2 - Frontend Pruebas:

```powershell
cd "C:\Users\T14s\Desktop\Nueva-estructura-Modulos\pruebas"
npx serve .
```

O usa Live Server en VS Code.

## Resumen del Dia

El modulo de Resumen del Dia consume:

```text
GET http://localhost:3001/api/tickets
GET http://localhost:3001/api/portafolio
```

La URL base esta en:

```text
pruebas/core/config.js
```

