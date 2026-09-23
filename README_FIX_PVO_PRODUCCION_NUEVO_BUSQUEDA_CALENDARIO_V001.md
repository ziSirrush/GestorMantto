# FIX PVO-Producción · Crear nuevo · búsqueda de proyecto + calendario V001

Fecha: 2026-09-23
Módulo: Logística → PVO-Producción → Agregar nuevo

## Objetivo

1. Sustituir el `select` nativo de Proyecto por un buscador con lista desplegable, equivalente al patrón utilizado en formularios del Gestor: el usuario escribe y la lista se filtra.
2. Permitir buscar por **Proyecto o PPNS**.
3. Mantener visibles, pero no seleccionables, los proyectos que ya tienen un seguimiento activo de PVO-Producción.
4. Hacer que las fechas que el usuario captura en el alta se seleccionen desde calendario.

## Comportamiento implementado

### Proyecto

`Crear nuevo` ahora usa:

- input `type="search"`;
- lista desplegable propia del módulo;
- búsqueda contra `GET /api/logistica/produccion/manual/proyectos?q=...`;
- búsqueda backend por `log_ops.proyecto` **o** `log_ops.id_ppns`;
- cada resultado muestra Proyecto y, como contexto, PPNS / estatus;
- registros con `ya_registrado=1` aparecen deshabilitados y no pueden seleccionarse.

La selección sigue guardando la relación mediante `id_log_ops`; no se duplica Proyecto/PPNS en `logistica_produccion`.

### Fechas capturables

Se agregan al alta los dos campos editables que ya forman parte de PVO-Producción:

- `Fecha envío Docs a Fábrica` → `fecha_envio_docs_fabrica`
- `Fecha envío Pago a Fábrica` → `fecha_envio_pago_fabrica`

Ambos usan `<input type="date">`, por lo que el navegador presenta selector de calendario. Son opcionales y el backend valida el formato antes de guardar.

**No se convierten en editables** `Fecha PVO`, `Fecha de Visita` ni `Fecha entrega cubos`: continúan en solo lectura porque sus fuentes operativas son `log_ops.pvo`, `ins_fl.fecha_visita` e `ins_fl.fecha_posible_recepcion_cubo` respectivamente.

En `Detalle`, los campos editables `Fecha envío Docs a Fábrica` y `Fecha envío Pago a Fábrica` ya utilizaban `type="date"`; se conserva ese comportamiento.

## Archivos incluidos

- `modules/logistica-produccion/logistica-produccion.js`
- `modules/logistica-produccion/logistica-produccion.css`
- `backend/src/modules/logistica-produccion/logistica-produccion.repository.js`
- `backend/src/modules/logistica-produccion/logistica-produccion.service.js`
- `core/module-loader.js`
- tests específicos y de regresión del bloque PVO-Producción.

No crea tablas, no agrega columnas y no requiere SQL.

## Base verificada en GitHub main

Repositorio: `ziSirrush/GestorMantto`

- `modules/logistica-produccion/logistica-produccion.js`: `a733413c70d4e5f45822088fa013f1920184de3a`
- `modules/logistica-produccion/logistica-produccion.css`: `f178f8bd49e69c3cc15dc91bc1526b33adfca619`
- `backend/src/modules/logistica-produccion/logistica-produccion.repository.js`: `debd589c8e31757db2539b38185663f2e10c4394`
- `backend/src/modules/logistica-produccion/logistica-produccion.service.js`: `c388c6253d8c74646a49fe4a944d9eea924a3895`
- `core/module-loader.js`: `b68954cb81f5cbb2fc5f67513a3e5dcdfb7ba269`

El paquete conserva acumulados los FIX locales previos del bloque PVO-Producción: orden/filtros/emojis y Detalle Resumen + preview PDF.

## Validaciones realizadas

- `node --check` frontend JS: OK.
- `node --check` repository: OK.
- `node --check` service: OK.
- `node --check` module-loader: OK.
- Tests PVO-Producción incluidos: **17/17 OK**.
- `backend npm run check` sobre copia completa del repo con los archivos sobrepuestos: **OK**.
- Integridad ZIP: verificada con `unzip -t`.

No se ejecutó prueba E2E contra Azure/Aiven ni despliegue remoto.

## Cache bust

Las rutas de PVO-Producción usan:

`20260923-pvo-nuevo-busqueda-calendario-v001`

## Despliegue

Reemplazar los archivos conservando sus rutas y desplegar frontend + backend según el flujo normal del proyecto. Reiniciar backend cuando corresponda para que la lógica de creación acepte las dos fechas opcionales.

No se modificó GitHub, Aiven, Azure ni Netlify durante la generación de este FIX.
