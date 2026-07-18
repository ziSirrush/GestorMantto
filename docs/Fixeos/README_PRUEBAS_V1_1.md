# Mantto Gestor - Pruebas V1.1

Base de pruebas para seguir integrando modulo por modulo con datos reales de Aiven.

## Cambios V1.1

- Login visual actualizado a estilo Proyecto Final/Netlify.
- Tarjeta de usuario del header ajustada:
  - avatar con iniciales,
  - nombre,
  - empresa/rol,
  - cerrar sesion separado.
- Resumen del Dia conserva datos reales desde backend/Aiven.
- Detalle de ticket dentro de Resumen del Dia corregido:
  - ventana flotante amplia,
  - scroll interno,
  - no corta informacion,
  - secciones de datos generales, reporte, diagnostico, tiempos y validacion,
  - panel derecho de chat / historico de comentarios.
- Chat del ticket:
  - muestra comentarios de validacion si existen en Aiven (`vobo_comentario`),
  - si no hay comentarios muestra "Sin mensajes aun",
  - la escritura queda preparada visualmente, pero no guarda hasta definir tabla/endpoint definitivo de comentarios de tickets.
- Modulos no integrados continuan mostrando En construccion / En desarrollo.

## Regla vigente

No se usan datos simulados ni precargados. Todo debe venir de Aiven por medio del backend.

## Ejecucion local

Terminal 1:

```powershell
cd "C:\Users\T14s\Desktop\Nueva-estructura-Modulos\backend"
node server.js
```

Terminal 2:

```powershell
cd "C:\Users\T14s\Desktop\Nueva-estructura-Modulos\pruebas"
npx http-server . -p 5500
```

Abrir:

```text
http://localhost:5500
```
