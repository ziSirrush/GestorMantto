# FIX 02.1 - Detalle Proyecto / lectura Cobranza por FK

Fecha: 15/08/2026
Base funcional: `FIX_02_DETALLE_PROYECTO_ADEUDOS_20260815`.
Referencia usada: estructura real compartida de Aiven, donde `portafolio`, `gestion_credito`, `detalle_mp_2026` y `pc` comparten `id_proyecto_cobranza` como FK hacia `cobranza_proyectos`.

## Causa corregida
FIX 02 calculaba los adeudos comparando `proyecto` como texto. Si Portafolio y Cobranza representaban el mismo proyecto con formatos distintos, los KPI podían devolver 0 aun cuando existieran registros.

## Cambio aplicado
El Detalle Proyecto ahora recupera `portafolio.id_proyecto_cobranza` junto con el proyecto y usa ese mismo identificador para consultar:

- `gestion_credito.id_proyecto_cobranza`
- `detalle_mp_2026.id_proyecto_cobranza`
- `pc.id_proyecto_cobranza`

Se agregaron dos helpers generales dentro del servicio:

- `filtroProyectoCobranza_gnral(alias, idProyectoCobranza)`
- `valorProyectoCobranza_gnral(idProyectoCobranza, proyecto)`

Si el proyecto ya tiene `id_proyecto_cobranza`, la lectura se realiza por FK indexada. Si el ID todavía es NULL, se conserva como fallback la comparación textual anterior para no romper registros todavía no relacionados.

## Archivos modificados
- `backend/src/modules/proyectos/proyectos.service.js`

## No modifica
- Base de datos ni esquema.
- Frontend de Detalle Proyecto.
- FIX 01 / Dashboard Portafolio.
- Cobranza, MP o VA como módulos.
- Rutas, controladores, permisos o notificaciones.

## Validación técnica
- El FIX parte del archivo completo entregado en FIX 02.
- La consulta de Cobranza sigue ejecutándose una sola vez por apertura del Detalle Proyecto.
- Cuando existe FK, deja de depender del formato textual de `proyecto`.
- Se conserva fallback por texto solo para registros sin FK.
- Ejecutar `node --check backend/src/modules/proyectos/proyectos.service.js` antes del deploy.

## Prueba posterior al deploy
1. Reiniciar backend y comprobar `/api/health`.
2. Abrir un proyecto que tenga `id_proyecto_cobranza` relacionado y registros en MP o VA.
3. Confirmar que Adeudo MP y/o Adeudo VA ya no aparecen en 0 cuando existen registros.
4. Confirmar Adeudo Total = MP + VA.
5. Pulsar el KPI y confirmar que abre el Detalle estándar de Gestión de Crédito.
