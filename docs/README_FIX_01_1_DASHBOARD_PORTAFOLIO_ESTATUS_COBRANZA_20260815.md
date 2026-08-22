# FIX 01.1 - Dashboard Portafolio / Estatus Cobranza

**Proyecto:** Mantto Gestor  
**Fecha:** 15/08/2026  
**Repositorio base:** `ziSirrush/GestorMantto`  
**Commit base auditado:** `cf6b876e08e88fa19c0ba2befffbe461d2ba3485`  
**Base funcional acumulada:** FIX 01 Dashboard Portafolio

## Causa confirmada

El FIX 01 clasificaba el estado comercial usando `mes_termino_gratuitos`. Después de completar la sincronización de Portafolio se confirmó que la fuente oficial ya existe en Aiven como `portafolio.estatus_cobranza`.

Valores confirmados de `estatus_cobranza`:

- `En Cobranza`
- `Gratuito`
- `NULL`

## Regla oficial aplicada

La clasificación comercial queda centralizada con esta prioridad:

1. Si `estatus_servicio` indica `No en Servicio` -> **No en Servicio**.
2. Si no es No en Servicio y `estatus_cobranza = 'En Cobranza'` -> **En Cobranza**.
3. Si no es No en Servicio y `estatus_cobranza = 'Gratuito'` -> **Gratuito / Garantía**.
4. Si no es No en Servicio y `estatus_cobranza` es `NULL`, vacío o diferente -> **no se contabiliza en ninguno de esos KPI comerciales**.

`mes_termino_gratuitos` y `termino_garantia` dejan de participar por completo en la decisión comercial. Se conservan únicamente como datos informativos.

## Total Portafolio

`Total Portafolio` continúa representando el universo activo del portafolio. Por definición, un registro activo con `estatus_cobranza = NULL` y que no sea `No en Servicio` permanece dentro del Total Portafolio, pero no incrementa En Cobranza, Gratuito / Garantía ni No en Servicio.

Por esta razón, con la regla actual **no es obligatorio** que:

`Total Portafolio = En Cobranza + Gratuito/Garantía + No en Servicio`.

## Alcance acumulado conservado de FIX 01

- KPIs comerciales de equipos.
- KPIs equivalentes por proyecto.
- Views de En Cobranza, Gratuito / Garantía y No en Servicio.
- Distribución comercial.
- Navegación y paginación existentes.
- Conversiones permanece En desarrollo.

## Archivos incluidos

- `backend/src/modules/portafolio/portafolio.repository.js`
- `backend/src/modules/portafolio/portafolio-comercial_uni.js`
- `modules/portafolio/portafolio.js`
- `modules/portafolio/portafolio.css`

El ZIP es acumulativo respecto de FIX 01 para evitar aplicar una versión anterior de la clasificación.

## No se modificó

- Esquema Aiven.
- Sincronización Apps Script.
- Endpoint `/api/portafolio/sync`.
- Rutas públicas.
- Conversiones.
- Movimientos Portafolio.
- Proyectos de Mantenimiento.
- Dashboard Operativo.
- Dashboard Call Center.
- Permisos.
- Otros módulos en Nevera.

## Validaciones realizadas

- `node --check backend/src/modules/portafolio/portafolio-comercial_uni.js` -> OK.
- `node --check backend/src/modules/portafolio/portafolio.repository.js` -> OK.
- `node --check modules/portafolio/portafolio.js` -> OK.
- La clasificación utiliza `estatus_cobranza` como fuente comercial.
- `mes_termino_gratuitos` y `termino_garantia` no participan en `commercialClassificationSql_uni()`.
- `NULL` no cae por defecto en En Cobranza.
- `No en Servicio` mantiene prioridad sobre `estatus_cobranza`.

## Prueba posterior al deploy

1. Desplegar backend y frontend del FIX 01.1.
2. Consultar un equipo con `estatus_cobranza = 'En Cobranza'`: debe aparecer en En Cobranza.
3. Consultar un equipo con `estatus_cobranza = 'Gratuito'`: debe aparecer en Gratuito / Garantía.
4. Consultar un equipo con `estatus_cobranza IS NULL` y `estatus_servicio = 'No en Servicio'`: debe aparecer en No en Servicio.
5. Consultar un equipo con `estatus_cobranza IS NULL` y que no sea No en Servicio: debe permanecer fuera de los tres KPI comerciales.
6. Validar `/api/health` después del deploy del backend.
