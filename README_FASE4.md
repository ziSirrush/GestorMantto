# BLT NOW — Instalaciones > Programacion de Personal > Ajustadores — Fase 4

**Preparacion local, no desplegada.** Base consultada: repositorio oficial
`ziSirrush/GestorMantto`, `main`, commit `f0d1f0cfda20be5d1a00045d87b9dbaf349a822f`
(27/10/2026). Fases 1 a 3 no constaban aplicadas al codigo actual de INT9;
por ello esta entrega es **acumulativa F1+F2+F3+F4**.

## Problema y solucion

El calendario de Ajustadores consultaba asignaciones existentes, pero no exponia
una revision segura del vinculo entre `ins_fl.ajustador` y el catalogo de personal.
Las Fases 1/2/3 preparan coincidencias exactas, alta autorizada y reconciliacion
incremental al recibir cambios de `ins_fl` mediante integracion autenticada.

**Fase 4** agrega un panel plegable exclusivamente al calendario **Ajustadores**:
- **Consultar/Actualizar** visualiza vinculaciones en paginas de 50 registros
  (cursor por `id_ins_fl`), sin crear registros ni lanzar consultas solo por entrar.
- Presenta proyecto, equipo, referencia original, nombres del catalogo, fechas
  **DD/MM/AAAA** y situaciones que requieren revision.
- **Asignar** aparece con permiso `VER+CREAR`; **Sincronizar** aparece con
  `VER+CREAR+DESACTIVAR`. El Visor de Usuarios no puede mutar.
- Las escrituras verifican sesion, permiso, puerta CORELLIAN y alcance por
  registro en el backend; el panel no sustituye esas protecciones.
- Recarga inmediata del calendario y consulta actualizada tras operaciones;
  evita marcar conflictos como exitos. Cambios de sesion/usuario/permisos limpian
  datos. Texto de origen se escapa para impedir HTML inyectado.
- CSS adaptable a movil y cargado solo en este modulo, a traves del loader actual.
  Se incrementa la version del Service Worker para actualizar la PWA.

**Nota operativa:** El panel presenta/reintenta por equipo. La conciliacion
sin intervencion de usuario corresponde al gancho M2M de F3. Este requiere
identidad `INTEGRATION_INS_FL_ID` realmente validada y la configuracion
correspondiente de Azure. No se habilita autenticacion insegura por codigo.
La fase no incluye backfill masivo ni activadores adicionales.

## Archivos entregados — solo nuevos o modificados respecto de main

- `backend/src/modules/instalaciones-programacion-personal/instalaciones-programacion-personal.ajustadores.service.js` (F1+F2)
- `backend/src/modules/instalaciones-programacion-personal/instalaciones-programacion-personal.ajustadores-sync.service.js` (F3)
- `backend/src/modules/instalaciones-programacion-personal/instalaciones-programacion-personal.routes.js` (F1-F3)
- `backend/src/routes/ins-fl.routes.js` (F3)
- `core/module-loader.js` (F4: registro JS/CSS de carga diferida)
- `modules/instalaciones-programacion-personal/instalaciones-programacion-personal-ajustadores.js` (F4)
- `modules/instalaciones-programacion-personal/instalaciones-programacion-personal-ajustadores.css` (F4)
- `service-worker.js` (F4: version de cache)
- `tests/instalaciones-ajustadores-fase1.test.js`, `tests/instalaciones-ajustadores-fase2.test.js`, `tests/instalaciones-ajustadores-fase3.test.js`, `tests/instalaciones-ajustadores-fase4.test.js`
- `docs/ADR_20261027_INT9_AJUSTADORES_F3_SYNC_M2M.md`

## Verificacion realizada

- `node --check` en los archivos JavaScript suministrados: **sin errores**.
- `node --test` en las suites aisladas F1-F4: **78/78 pruebas aprobadas**
  (F1 16, F2 24, F3 24, F4 14), sin Azure/Aiven ni escrituras reales.
- F4 comprueba integracion del loader/PWA, permiso/visor, cambios de sesion,
  sanitizacion HTML, ausencia de consultas iniciales, paginacion, recuperacion
  ante errores, reintentos autorizados y recarga posterior a respuestas.

**No confirmado:** E2E con servidor real, integracion M2M en Azure, nulabilidad
`created_by/updated_by` de tablas Aiven, despliegue PWA desde cache antiguo,
CI completo y concurrencia/carga con MySQL de laboratorio. Se deben validar
**antes** de promover: Local -> GitHub Pages -> Netlify (produccion manual),
segun la Constitucion. Desplegar backend Azure solo con aprobacion explicita.

**Sin modificaciones externas:** GitHub, Aiven, Azure, GitHub Pages y Netlify.
**No hay instaladores, scripts PowerShell, ni archivos `.patch`.**
