# FASE 4 - Cobranza COR - Aditivas Frontend V002

Fecha: 2026-09-11
Dominio: CORELLIAN
Agrupacion: Cobranza
Modulo: Aditivas (`cobranza-aditivas`)
Repositorio base revisado: `ziSirrush/GestorMantto` / `main`

## Importante

Esta V002 sustituye completamente a `FASE_4_COBRANZA_COR_ADITIVAS_V001`.

**NO usar la V001.** La V001 incluia un `.patch` y no cumplia el formato de entrega establecido para Gestor Mantto. Esta V002 entrega archivos completos, unicamente los modificados/nuevos, conservando sus rutas reales dentro del repositorio.

## Objetivo

Integrar el frontend de **Cobranza COR > Aditivas** sin tocar United, Apps Script, carga de datos, base de datos ni backend.

La vista consume exclusivamente:

`GET /api/cobranza-cor/aditivas`

Al momento de preparar esta entrega, `main` mantiene esa lectura funcional en estado:

`PENDING_COBRANZA_COR_FUNCTIONAL_READ`

Por lo tanto, esta fase **no inventa registros ni importes**. Mientras FASE 3 no habilite la lectura funcional, la pantalla muestra el estado pendiente informado por el backend. Cuando el backend entregue `data`, la vista queda preparada para presentar la informacion autorizada.

## Archivos entregados

### Modificado

- `core/module-loader.js`
  - Archivo completo derivado del `main` vigente.
  - Agrega lazy-load exclusivamente para `cobranza-aditivas`.
  - No modifica las rutas de United.
  - No altera `PERSISTENT_DATA_ROUTES`, porque esta integracion reutiliza `view-placeholder` y debe reconstruir su DOM al volver a la ruta.

### Nuevos

- `modules/cobranza-cor/cobranza-cor-aditivas.js`
- `modules/cobranza-cor/cobranza-cor-aditivas.css`

No se modifica `index.html`: el acceso lateral `cobranza_aditivas` / `cobranza-aditivas` ya existe en `main`.

No se modifica `core/router.js`: el router vigente ya registra el nombre de la ruta y emite `mantto:navigation` despues de renderizar. El modulo lazy-loaded escucha ese evento y sustituye solamente el `view-placeholder` cuando el destino solicitado es `cobranza-aditivas`.

## Funcionalidad preparada

- Encabezado Cobranza Corellian > Aditivas.
- Estado explicito cuando FASE 3 aun no habilita la lectura funcional.
- Busqueda por proyecto, PP, cotizacion, OV, factura y datos relacionados.
- Filtros por Ano de cotizacion, Departamento, Estatus de cobranza y Moneda.
- Paginacion de 30 registros.
- Detalle de cada Aditiva.
- Manejo de respuestas 401, 403 y 404.
- Recarga al cambiar de usuario en el Visor.
- Comportamiento responsive para escritorio, tablet y movil.
- Aditivas separadas de Suministro e Instalacion.
- Los totales financieros globales **no se calculan en frontend**; solo se muestran si el backend entrega un resumen autoritativo por moneda.

## Alcance excluido

Esta fase NO modifica:

- Backend Cobranza COR.
- FASE 1 de carga.
- FASE 2 Apps Script.
- Aiven/MySQL.
- United / Cobranza United.
- tabla `pc`.
- Azure.
- Netlify.
- GitHub remoto.

## Instalacion manual

Extraer el ZIP sobre la raiz local del repositorio respetando la estructura de carpetas. Los archivos dentro de `core/` y `modules/cobranza-cor/` deben quedar en esas mismas rutas.

Antes de copiar, se recomienda conservar respaldo local de `core/module-loader.js` para rollback inmediato.

## Rollback

1. Restaurar el `core/module-loader.js` anterior.
2. Eliminar:
   - `modules/cobranza-cor/cobranza-cor-aditivas.js`
   - `modules/cobranza-cor/cobranza-cor-aditivas.css`

No existe rollback de BD porque esta fase no modifica base de datos.

## Validacion realizada

- Fuente base `core/module-loader.js` reconstruida desde `main` y verificada contra su Git blob SHA original `58796b0cf5a89722bfb6c88b274cdb32f80b860e` antes de aplicar el cambio: **OK**.
- `node --check core/module-loader.js`: **OK**.
- `node --check modules/cobranza-cor/cobranza-cor-aditivas.js`: **OK**.
- Balance de llaves CSS: **OK**.
- Referencias a United / `cobranza-uni` / `pc` dentro del nuevo JS de Aditivas: **0**.
- Integracion lazy-load `cobranza-aditivas`: **OK por inspeccion estatica**.
- Backend real verificado en `main`: la ruta funcional de Aditivas continua pendiente; **no se simula como terminada**.

## Validaciones NO ejecutadas

- Prueba E2E en navegador: NO EJECUTADA.
- Consulta real a Aiven: NO EJECUTADA.
- Deploy Azure: NO EJECUTADO.
- Deploy Netlify: NO EJECUTADO.
- Escritura/commit a GitHub: NO EJECUTADO.

Esta distincion es intencional: la entrega esta validada estaticamente, no se declara desplegada ni probada E2E.
