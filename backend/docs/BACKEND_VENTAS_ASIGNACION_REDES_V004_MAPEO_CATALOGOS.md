# Backend Ventas - Asignacion a Redes V004

## Objetivo
Corregir la importacion historica de Hoja 7 para aceptar los valores visibles del respaldo en los campos de catalogo, resolverlos contra `catalogo_general` y guardar sus IDs oficiales.

## Campos corregidos
- `id_contacto_via` -> `catalogo_general / Ventas / Tipo Contacto`
- `id_estado` -> `catalogo_general / General / Estado`
- `id_solicitud` -> `catalogo_general / Ventas / Soli Red`
- `id_estatus` -> `catalogo_general / Ventas / Estatus Pros`

Cada celda puede contener:
- un `id_catalogo` entero positivo; o
- el texto visible de `catalogo_general.articulo`.

La comparacion textual ignora mayusculas, minusculas, acentos y espacios repetidos. La ruta de area y elemento sigue siendo obligatoria para evitar coincidencias entre catalogos distintos.

## Archivos modificados
- `backend/src/modules/ventas-redes/ventas-redes-sync.repository.js`
- `backend/src/modules/ventas-redes/ventas-redes-sync.service.js`
- `google-apps-script/IMPORTAR_VENTAS_REDES_HOJAS_7_Y_8.gs`

## SQL requerido
Ninguno.

## Uso
1. Publicar los dos archivos backend modificados.
2. Sustituir el Apps Script anterior por el incluido en este FIX.
3. Ejecutar `enviarRedesYComentariosAiven()`.
4. Revisar el resultado JSON. Los nombres de catalogo sin coincidencia se reportaran por fila y no se insertaran silenciosamente.

## Validaciones realizadas
- Sintaxis Node.js de repository y service.
- Sintaxis JavaScript del Apps Script mediante copia temporal `.js`.
- Normalizacion del Apps Script acepta texto o ID para los cuatro catalogos.
- La backend consulta solo las cuatro rutas oficiales y convierte el texto al `id_catalogo` antes del UPSERT.

## Riesgos conocidos
No se ejecuto la importacion contra Aiven. Si un texto del respaldo no existe en la ruta oficial de `catalogo_general`, la fila sera rechazada indicando el valor y la ruta esperada. Esto evita asignar IDs incorrectos.
