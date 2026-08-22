# FIX 01 - Dashboard Portafolio

**Proyecto:** Mantto Gestor  
**Fecha:** 15/08/2026  
**Repositorio base:** `ziSirrush/GestorMantto`  
**Commit base auditado:** `cf6b876e08e88fa19c0ba2befffbe461d2ba3485`

## Alcance aplicado

Este FIX implementa exclusivamente los acuerdos cerrados para Dashboard Portafolio:

1. `Gratuito` deja de incluir Garantía.
2. `Garantía` forma parte de `En Cobranza`.
3. `No en Servicio` conserva prioridad como categoría separada.
4. Todo equipo activo queda clasificado en una de estas tres categorías comerciales:
   - En Cobranza
   - Gratuito
   - No en Servicio
5. Se agregan los mismos cuatro indicadores a nivel proyecto:
   - Total Portafolio
   - En Cobranza
   - Gratuito
   - No en Servicio
6. Cada proyecto se deduplica mediante `COUNT(DISTINCT proyecto)` dentro de cada indicador, por lo que la cantidad de equipos asociados no multiplica el conteo del proyecto.
7. `Conversiones` permanece sin cambios y en desarrollo.

## Regla técnica centralizada

La clasificación comercial se concentra en `commercialClassificationSql_uni()`:

- `estatus_servicio = No en Servicio` -> `No en Servicio`.
- `mes_termino_gratuitos` informado -> `Gratuito`.
- Cualquier otro equipo activo -> `En Cobranza`.

`termino_garantia` se conserva como dato informativo, pero deja de participar en la condición de Gratuito. Con esto, Garantía cae en En Cobranza sin crear campos, tablas o reglas paralelas.

La misma función se reutiliza para:

- KPIs generales.
- KPIs por proyecto.
- Distribución comercial.
- Columna Contrato de la tabla.
- Views/filtros `En Cobranza`, `Gratuito` y `No en Servicio`.

## Archivos modificados / agregados

- `backend/src/modules/portafolio/portafolio.repository.js`
- `backend/src/modules/portafolio/portafolio-comercial_uni.js` (nuevo)
- `modules/portafolio/portafolio.js`
- `modules/portafolio/portafolio.css`

## No se modificó

- Base de datos / esquema Aiven.
- Rutas públicas existentes.
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
- Verificado que la nueva clasificación no utiliza `termino_garantia` para decidir Gratuito.
- Verificado que frontend ya no muestra `Gratuito / garantía` en el Dashboard Portafolio modificado.

## Validación posterior al deploy

1. Desplegar backend porque el FIX cambia lógica de consulta.
2. Publicar frontend.
3. Abrir Dashboard Portafolio y validar:
   - Total Portafolio = En Cobranza + Gratuito + No en Servicio a nivel equipo.
   - Un equipo con Garantía ya no aparece en Gratuito y sí en En Cobranza.
   - Al abrir los KPI En Cobranza / Gratuito / No en Servicio, la tabla coincide con el KPI.
   - Los nuevos KPI por proyecto no se multiplican por cantidad de equipos.
4. Revisar Network:
   - `GET /api/portafolio/dashboard` responde `kpis` y `kpis_proyectos`.
   - `GET /api/portafolio/equipos?contrato=gratuito` devuelve únicamente `contrato: "Gratuito"`.
   - `GET /api/portafolio/equipos?contrato=cobranza` incluye registros de Garantía que ya no corresponden a Gratuito.
5. Validar `/api/health` después del deploy del backend.

## Nota de precisión

El acuerdo funcional define que cada proyecto se contabiliza una sola vez sin importar cuántos equipos tenga. El FIX aplica `COUNT(DISTINCT proyecto)` por indicador. El documento de acuerdos no define una regla de precedencia adicional para el caso excepcional de que un mismo proyecto tenga equipos simultáneamente en categorías comerciales diferentes; por ello este FIX no inventa una regla nueva para ese escenario.
