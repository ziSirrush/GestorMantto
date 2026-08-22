# FIX FASE 4 — Estado → Zona en Cotizaciones Corellian

**Versión:** V001  
**Fecha:** 17/08/2026  
**Alcance:** Ventas Corellian (`_cor`)  
**Base frontend:** FASE 3 — Filtro Asesor Cotizaciones V001  
**Base backend/HTML:** `main` vigente de `ziSirrush/GestorMantto`

## Problema confirmado

La tabla de Cotizaciones mostraba un filtro **Zona**, pero no un filtro **Estado**. El endpoint de listado ya soporta ambos campos (`estado` y `zona`) como filtros, mientras `/api/ventas/cotizaciones/catalogos` entregaba `estados` y `zonas` como listas independientes, sin la relación Estado → Zona.

## Solución aplicada

### Backend

Se conserva el endpoint existente de catálogos. Al cargarlo se agregan los pares reales:

- `estado`
- `zona`

obtenidos directamente de los registros activos de `ventas_cotizaciones_cor`.

La respuesta incorpora:

`catalogos.estado_zonas`

No se crea una tabla, ruta ni endpoint nuevo.

La relación no se hardcodea: se obtiene de los datos reales ya almacenados en Aiven.

### Frontend

Se agregó el selector **Estado** antes de **Zona**.

Comportamiento:

1. Sin Estado seleccionado, Zona conserva todas las opciones disponibles.
2. Al seleccionar Estado, Zona se reconstruye únicamente con las zonas relacionadas con ese Estado.
3. Al cambiar Estado, se limpia cualquier Zona previamente seleccionada para evitar combinaciones incompatibles.
4. La consulta envía `estado` y `zona` cuando corresponda.
5. **Limpiar** restablece Estado y Zona.
6. Se actualizó el cache-buster del HTML del módulo para asegurar la carga de la nueva barra de filtros.

## Compatibilidad con FASE 3

`ventas-cotizaciones.js` parte directamente del archivo entregado en FASE 3.

Se conserva:

- filtro Asesor visible para Gerentes/Administrativos cuando tienen alcance;
- uso de `ids_asesores_visibles`;
- restricciones del filtro Asesor;
- comportamiento previo de Acceso Total.

La prueba de alcance utilizada en FASE 3 fue ejecutada nuevamente contra el archivo de FASE 4: **PASS**.

## Archivos modificados

- `modules/ventas-cotizaciones/ventas-cotizaciones.js`
- `modules/ventas-cotizaciones/ventas-cotizaciones.html`
- `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.controller.js`

## SQL / Aiven

**No hay cambios de estructura.**

La estructura proporcionada confirma que `ventas_cotizaciones_cor` ya contiene:

- `estado varchar(100)`
- `zona varchar(100)`

También se confirmó que `catalogo_general` contiene el catálogo de Estados, pero no existe en la estructura entregada una tabla independiente de relación Estado → Zona. Por eso el FIX utiliza los pares reales existentes en Cotizaciones en lugar de inventar una relación nueva.

## Validaciones realizadas

- `node --check modules/ventas-cotizaciones/ventas-cotizaciones.js` → PASS
- `node --check backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.controller.js` → PASS
- prueba frontend Estado → Zona → PASS
- Estado limita opciones de Zona → PASS
- cambio de Estado limpia Zona incompatible → PASS
- query combina `estado` + `zona` → PASS
- Limpiar restaura ambos filtros → PASS
- prueba de alcance FASE 3 sobre JS FASE 4 → PASS
- prueba backend de `catalogos.estado_zonas` → PASS

### Validación contra `main`

Se reconstruyó la base de los archivos compartidos antes del cambio:

- HTML base: blob `864d89f88cc896c8458d87f020b0426f89197514` → coincide exactamente con `main` revisado.
- Controller base: blob `c0342aec7eb0d31cff8cedd9c4e2f23523bf4b9b` → coincide exactamente con `main` revisado.

Esto confirma que no se utilizó una copia antigua para reemplazar esos archivos.

## No modificado

- United (`_uni`)
- Instalaciones
- permisos
- rutas API
- tablas MySQL
- columnas MySQL
- timers
- jobs
- módulos en Nevera ajenos al alcance

## Deploy

Este FIX contiene cambio frontend **y backend**. Después de aplicarlo se requiere desplegar nuevamente la API para que `/api/ventas/cotizaciones/catalogos` entregue `estado_zonas`.
