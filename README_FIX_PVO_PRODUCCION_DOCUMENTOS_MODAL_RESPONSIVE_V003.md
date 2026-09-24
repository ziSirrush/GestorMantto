# FIX_PVO_PRODUCCION_DOCUMENTOS_MODAL_RESPONSIVE_V003

## Alcance
Logistica -> PVO-Produccion -> Detalle -> Zona de carga -> vista previa ampliada de documentos PDF.

## Base verificada
- Repositorio: `ziSirrush/GestorMantto`
- Rama: `main`
- Commit verificado antes de preparar este FIX: `4315589d690b8f65b03fb05e63a5704b6d9a2b37` (`Version 092426.1`).
- El `main` ya contiene el modal/responsive V002.
- Tambien se reviso el ZIP `FIX_COBRANZA_COR_ESTADOS_RESPONSIVE_MOVIL_V001.zip` aportado por el usuario.

## Problema confirmado
En V002 el `iframe` del modal tenia `pointer-events:none`, por lo que el visor PDF se mostraba pero no aceptaba rueda, touch ni interaccion. Ademas el modal usaba `view=Fit`, que en el visor nativo observado no estaba ajustando correctamente la hoja completa al alto disponible.

## Cambios V003
1. La miniatura de cada documento permanece fija y no interactiva.
2. El modal abre el PDF en `page=1` con `view=FitV` para priorizar que la primera hoja se ajuste al alto disponible.
3. El `iframe` ampliado queda interactivo (`pointer-events:auto`), permitiendo scroll/touch/zoom cuando el visor nativo del navegador lo requiera.
4. Se mantiene una insignia visible `Hoja 1` en la vista ampliada.
5. En movil el cuerpo del modal reduce padding y conserva el visor dentro de la pantalla.
6. Cache-bust PVO actualizado a `20260924-pvo-preview-hoja1-v003` en las cinco rutas del modulo.
7. `core/module-loader.js` esta fusionado con el FIX de Cobranza COR responsive aportado por el usuario; conserva:
   - `20260924-estados-responsive-v001`
   - `20260924-fondo-garantia-general-v002`

## Archivos completos incluidos
- `modules/logistica-produccion/logistica-produccion.js`
- `modules/logistica-produccion/logistica-produccion.css`
- `core/module-loader.js`
- `tests/logistica_produccion_documentos_modal_responsive_v003.test.js`

No contiene archivos `.patch`.

## Aplicacion
Copiar el contenido del ZIP sobre la raiz del repositorio respetando la estructura de carpetas y sobreescribir estos archivos completos.

Si tambien se va a aplicar `FIX_COBRANZA_COR_ESTADOS_RESPONSIVE_MOVIL_V001`, aplicar primero ese FIX y despues este V003, porque este `module-loader.js` ya contiene la fusion de ambos cambios.

## Validacion realizada
- `node --check modules/logistica-produccion/logistica-produccion.js`: OK
- `node --check core/module-loader.js`: OK
- `node tests/logistica_produccion_documentos_modal_responsive_v003.test.js`: 6/6 OK
- Integridad ZIP: se valida al generar el entregable.

## Limite tecnico importante
La vista se abre y se ajusta inicialmente en `page=1`, pero el PDF sigue siendo mostrado por el visor PDF nativo del navegador. Al habilitar scroll/zoom, algunos navegadores pueden permitir navegar a paginas posteriores. No se afirma que el iframe pueda aislar criptograficamente o recortar el PDF a una sola pagina. Para garantizar que solo exista visualmente la hoja 1 habria que renderizar esa pagina como imagen/canvas (por ejemplo con un motor PDF dedicado), lo cual seria otro cambio de arquitectura.

## No modificado
- SQL / Aiven
- tablas o columnas
- API de carga de archivos
- backend de Azure Storage
- GitHub remoto
- Azure / Netlify
