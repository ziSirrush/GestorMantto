# Fix Panel Lateral — Almacén y Customer Experience

Fecha: 2026-07-18

## Archivos modificados

- `index.html`
- `core/app.js`
- `core/router.js`

## Cambios

Se agregaron dos agrupaciones futuras al panel lateral:

### Almacén
- Dashboard Almacén
- Inventarios
- Movimientos Almacén

### Customer Experience
- Dashboard CX
- Encuestas
- Visitas

Todos los accesos utilizan el enrutador existente y muestran la vista general **En construcción / En desarrollo**.

## Accesos generales

Los botones siguientes permanecen fuera de cualquier agrupación, igual que Inicio:

- Usuarios
- Panel de Control

## Alcance

- No se agregaron módulos funcionales.
- No se modificó el backend.
- No se crearon APIs ni tablas.
- No se cambió el comportamiento de los grupos existentes.
- Se mantiene un solo grupo expandido a la vez.
- Se agregaron permisos temporales para que Dirección pueda visualizar los nuevos accesos durante esta etapa.

## Validación técnica

- `node --check core/app.js`
- `node --check core/router.js`
- Verificación de rutas y permisos temporales.
