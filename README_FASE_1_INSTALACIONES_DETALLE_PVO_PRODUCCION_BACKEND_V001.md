# FASE 1 — Instalaciones · Detalle Proyecto · PVO y Producción · Backend V001

Base verificada de GitHub `main`:

`2539e83401afa97db9d23c15dfad7448e6edad5d` — Version 092526.2

## Cambio

Se agrega una lectura de solo consulta para que la Fase 2 pueda mostrar en Detalle de Proyecto:

- una fila por registro logístico relacionado al mismo PPNS;
- Fecha PVO;
- Fecha de Visita;
- Fecha entrega cubos;
- Fecha envío Docs a Fábrica;
- Fecha envío Pago a Fábrica;
- documentos CPVO/GM asociados al registro.

El nombre visible del registro proviene de `log_ops.proyecto` y el identificador real es `id_log_ops`.

## Endpoint nuevo

`GET /api/logistica/produccion/proyecto/:idProyecto/resumen`

- Requiere sesión autenticada mediante la protección existente del módulo.
- La relación con el proyecto es exacta por PPNS.
- No agrega POST, PATCH ni DELETE.
- Los documentos devueltos incluyen URL de lectura para preview/apertura, no URL de descarga específica.

## Base de datos

No crea ni altera tablas, columnas o índices.

Reutiliza exclusivamente las estructuras existentes:

- `log_ops`
- `logistica_produccion`
- `logistica_produccion_archivos`
- `ins_fl`

## Archivos modificados

- `backend/src/modules/logistica-produccion/logistica-produccion.routes.js`
- `backend/src/modules/logistica-produccion/logistica-produccion.controller.js`
- `backend/src/modules/logistica-produccion/logistica-produccion.service.js`
- `backend/src/modules/logistica-produccion/logistica-produccion.repository.js`

## Pruebas incluidas

- `tests/instalaciones_detalle_pvo_produccion_backend_v001.test.js`

Validaciones realizadas al paquete:

- `node --check` de los cuatro archivos backend.
- prueba estática del endpoint, relación exacta, solo lectura y ausencia de SQL estructural.

## No ejecutado

- No se modificó GitHub.
- No se modificó Aiven.
- No se modificó Azure.
- No se modificó Netlify.
- No se realizó prueba contra BD productiva.
- No se realizó E2E.

La Fase 2 será la integración visual en el Detalle de Proyecto.
