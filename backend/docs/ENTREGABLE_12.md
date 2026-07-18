# Entregable 12 - Limpieza y consolidación segura

## Objetivo

Reducir el acoplamiento visible con el controlador monolítico sin eliminar lógica
que todavía es necesaria para Pendientes, Portafolio, Tickets y la compatibilidad
temporal de `/usuarios` y `/users`.

## Cambios realizados

1. El controlador histórico completo se aisló en:

   `src/controllers/data.controller.legacy.js`

2. `src/controllers/data.controller.js` ahora es una fachada pequeña y explícita.
   Solo exporta los handlers que aún tienen consumidores comprobados.

3. Los repositorios transicionales documentan correctamente el límite legacy.

4. Se agregó:

   `scripts/validate-architecture.js`

   Este script detecta nuevas dependencias no autorizadas hacia la fachada,
   valida sus exports y comprueba que el agregador de rutas pueda cargarse.

## Importante

Este entregable no elimina la lógica histórica de Pendientes, Portafolio o
Tickets. Las versiones de esos módulos entregadas previamente todavía delegan
sus handlers al controlador legacy. Eliminarlo ahora rompería endpoints que ya
fueron validados por el frontend.

La limpieza realizada es deliberadamente conservadora: aísla la deuda técnica,
impide que crezca y deja identificada la extracción restante.

## Validación local

Desde `backend/` ejecutar:

```bash
node scripts/validate-architecture.js
node --check src/controllers/data.controller.js
node --check src/controllers/data.controller.legacy.js
npm start
```

Después validar:

- `GET /api/health`
- Login
- Home
- Pendientes
- Notificaciones
- Portafolio
- Tickets
- Usuarios (`/api/usuarios` y `/api/users`)

## No borrar todavía

- `src/controllers/data.controller.legacy.js`
- `src/controllers/data.controller.js`

La eliminación definitiva requiere extraer a repositories reales el SQL y las
reglas que aún usan Pendientes, Portafolio y Tickets, además de mover las rutas
de compatibilidad de usuarios a su dominio correspondiente.
