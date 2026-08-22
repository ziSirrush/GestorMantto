# FIX 4 — Integración final / Cache-bust V001

**Fecha:** 17/08/2026  
**Proyecto:** Mantto Gestor  
**Base:** Predeploy Cobranza Uni + FIX 1 + FIX 2 + FIX 3  
**Alcance:** preparación final del lote antes de construir el predeploy definitivo.

## Objetivo

Evitar que el navegador reutilice versiones anteriores de archivos frontend que sí cambiaron dentro del lote completo de Cobranza/Notificaciones/MP/Panel de Control.

Este FIX **no cambia lógica funcional**. Solo actualiza los identificadores de versión de recursos ya modificados.

## Archivo modificado

- `index.html`

## Cache-bust actualizados

- `core/project-name.js`
- `modules/portafolio/portafolio.css`
- `modules/portafolio/portafolio.js`
- `modules/cobranza-uni/cobranza-uni.css`
- `modules/cobranza-uni/cobranza-uni.js`
- `modules/panel-control/panel-control.css`
- `modules/panel-control/panel-control.js`

Nueva versión común:

`20260817-lote-cobranza-uni-v001`

## Cache-bust conservados

No se tocaron porque ya identifican correctamente los cambios de sus FIX correspondientes:

- `modules/home/home.js?v=20260817-home-snapshot-v001`
- `core/app.js?v=20260817-notif-sync30-v001`
- `core/details.js?v=20260817-fase5-fotos-mapa-carrusel-v001`

## Limpieza LF / CRLF

Se detectaron archivos cuyo contenido lógico coincide con `HEAD` y cuya diferencia local es únicamente de fin de línea. No se incluyen en este FIX para no regenerar archivos sin cambios funcionales ni forzar una política de EOL que el repositorio actualmente no define mediante `.gitattributes`.

Esto no constituye un error funcional. La revisión final del predeploy debe confirmar qué muestra `git status` en el equipo Windows donde se realizará el commit.

## Validaciones realizadas sobre el lote acumulado

- `node --check` sobre JavaScript de `backend/`, `core/` y `modules/`: PASS.
- `npm run check` en backend: PASS.
- Referencias locales `<script>` / `<link>` de `index.html`: todas existen.
- FIX 1 superpuesto antes de validar.
- FIX 2 superpuesto antes de validar.
- FIX 3 superpuesto antes de validar.
- Sin cambios SQL.
- Sin cambios de rutas, controladores o servicios en este FIX.
- Sin cambios de reglas de negocio en este FIX.

## Próximo paso

Aplicar este FIX sobre el lote ya corregido con FIX 1–3 y generar el ZIP completo de predeploy. Ese ZIP completo deberá revisarse antes del `git add .`, commit y push.
