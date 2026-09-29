# FIX CI · SEGUIMIENTO ESPECIAL + EQUIPO SALE DE CRÍTICO · V001

## Objetivo
Corregir el fallo del workflow de backend de Mantto Gestor sin modificar lógica de producción.

## Base verificada
- Repositorio: `ziSirrush/GestorMantto`
- Rama: `main`
- Commit revisado: `b3bc6ca6aa5f2b3fb9871e5a3a07e234337eeffc`
- Mensaje: `Version 092926.1`
- Workflow fallido: `Build and deploy Node.js app to Azure Web App - mantto-gestor-api`
- Run: `36601357046` / Run #405
- Resultado observado: 132 tests, 131 PASS, 1 FAIL; deploy omitido.

## Causa confirmada
`validation/seguimiento-especial-notificaciones.test.js` conservaba dos aserciones de cache-bust de una versión anterior de Seguimiento Especial:

- `20260909-seguimiento-especial-control-unico-v006`
- `20260914-human-time-v001`

El `core/module-loader.js` vigente en `Version 092926.1` usa la versión final de Fase 4:

- `20260929-seguimiento-especial-ticket-listado-fase4-v001`

Por ello falló el subtest `cache bust de cierre apunta a los archivos frontend corregidos` antes del despliegue a Azure.

## Corrección
### 1. `validation/seguimiento-especial-notificaciones.test.js`
- Se actualizan exclusivamente las dos expectativas de cache-bust al valor real de Fase 4.
- Se amplía el subtest de integración de `npm test` para exigir también las validaciones:
  - `../validation/equipo-sale-critico-fase1.test.js`
  - `../validation/equipo-sale-critico-fase2.test.js`

### 2. `backend/package.json`
Se agregan a `scripts.test`:

- `../validation/equipo-sale-critico-fase1.test.js`
- `../validation/equipo-sale-critico-fase2.test.js`

No se elimina ninguna prueba existente.

## Alcance
Este FIX NO modifica:
- código de negocio;
- `EQUIPO_SALE_DE_CRITICO`;
- job U35;
- notificaciones;
- Seguimiento Especial funcional;
- SQL/Aiven;
- frontend;
- Azure/App Service.

Solo corrige la suite CI para que valide el estado real ya integrado del repositorio.

## Orden de aplicación
1. Copiar el contenido del ZIP sobre la raíz de `GestorMantto` conservando rutas.
2. Revisar `git diff`.
3. Desde `/backend`, ejecutar:
   - `npm run check`
   - `npm test`
4. Si todo pasa, commit/push normal a `main`.
5. Confirmar que el workflow de backend complete `build` y luego `deploy`.

## Validación de esta entrega
- `node --check validation/seguimiento-especial-notificaciones.test.js`: PASS.
- parseo JSON de `backend/package.json`: PASS.
- cache-bust vigente Fase 4 presente: PASS.
- cache-bust histórico que causó el fallo ausente: PASS.
- Fase 1 críticos registrada en `npm test`: PASS.
- Fase 2 críticos registrada en `npm test`: PASS.
- estructura incremental del ZIP: PASS.

## No ejecutado
No se ejecutó la suite completa `npm test` dentro de este entorno porque no existe una copia materializada completa del repositorio; el diagnóstico del fallo se verificó directamente contra el log real de GitHub Actions Run #405 y los archivos del `main` actual.
