# FIX 1 — Restaurar Carrusel Global / Fotos Mapa V001

**Fecha:** 18/08/2026  
**Proyecto:** Mantto Gestor  
**Base de integración:** `Pre deploy Cobranza Uni(1).zip`  
**Repositorio de referencia:** `ziSirrush/GestorMantto`  
**Commit base validado:** `1fe9c7ca3ab05b9d5653cf9ec30ac98204220535`

## Hallazgo

El lote de Cobranza/Notificaciones sustituyó `core/details.js` por una versión anterior al FIX aprobado de Fotos Mapa.

La regresión eliminaba del componente global:

- `ManttoDetails.openProjectPhotos`;
- **Foto Principal Actual**;
- **Seleccionar Foto Principal**;
- **Agregar Foto**;
- **Ir a Proyecto** contextual;
- carga de fotografías con límite de siete;
- sincronización local de la portada/tarjeta de Fotos Mapa;
- portada vacía para agregar la primera fotografía.

Al mismo tiempo, `modules/ventas-fotos-mapa/ventas-fotos-mapa.js` permanecía en la versión nueva y continuaba llamando `ManttoDetails.openProjectPhotos`. Por eso ambos archivos habían quedado incompatibles.

## Corrección aplicada

Se restaura **únicamente**:

- `core/details.js`

El archivo entregado coincide exactamente con la implementación aprobada que ya existe en el commit base del repositorio.

No se modifica `modules/ventas-fotos-mapa/ventas-fotos-mapa.js`, porque el archivo incluido en el predeploy ya coincide con la versión aprobada.

No se modifica `index.html`, porque el predeploy ya conserva el cache-bust correcto:

`core/details.js?v=20260817-fase5-fotos-mapa-carrusel-v001`

## Comportamiento restaurado

### Desde Fotos Mapa

El clic en una tarjeta abre el carrusel global y muestra:

1. Foto Principal Actual.
2. Seleccionar Foto Principal.
3. Agregar Foto.
4. Ir a Proyecto.

Los cambios de fotografía se reflejan localmente en la tarjeta sin recargar el catálogo completo.

### Desde Detalle Proyecto

Se reutiliza el mismo carrusel, pero **Ir a Proyecto permanece oculto**, porque el usuario ya se encuentra dentro del proyecto.

### Permisos conservados

- Seleccionar Foto Principal: `Programador`.
- Agregar Foto: `Programador` o `Director General`.
- Máximo: siete fotografías por proyecto.

## Validaciones

- `node --check core/details.js`: PASS.
- `node --check modules/ventas-fotos-mapa/ventas-fotos-mapa.js`: PASS.
- Coincidencia exacta de `core/details.js` con el commit base aprobado: PASS.
- Compatibilidad con `ventas-fotos-mapa.js`: PASS.
- Pruebas estáticas de controles, permisos, endpoints, límite y contexto: **24/24 PASS**.
- Sin cambios en backend.
- Sin cambios SQL/Aiven.
- Sin cambios en módulos United `_uni`.
- Sin timers ni consultas adicionales.

## Archivos del entregable

- `core/details.js`
- `FIX_1_RESTAURAR_CARRUSEL_GLOBAL_FOTOS_MAPA_V001.md`

## Integración

Copiar el contenido del ZIP sobre la raíz del predeploy, conservando la estructura de carpetas. Este FIX debe aplicarse antes del FIX 2 de Panel de Control.

## Integridad

- SHA-256 `core/details.js`: `d6ab5a192f93f7e3707cbc69b1646afdcdc8c0b55bf02b11c4d4c85ded37c070`
- SHA-256 `ventas-fotos-mapa.js` validado en el predeploy: `6f51582d804806bf73495e97dbf25518b44bf8c59d1396f7dedfb8c67eb1655c`
