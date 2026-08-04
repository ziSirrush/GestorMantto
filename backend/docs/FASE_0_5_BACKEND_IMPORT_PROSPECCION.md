# Fase 0.5 - Backend de carga histórica de Prospección

## Endpoints

### Prospecciones

`POST /api/ventas/prospeccion/sync`

Acepta un arreglo directo o `{ "registros": [...] }` con los encabezados:

`id_pros, empresa, proyecto, ubicacion, contacto, correo, telefono, foto_1, comenario, foto_2, foto_3, foto_4, id_usuario, ciudad, estado, tipo_proyecto, fecha_visita, estatus, fecha_cam_estatus`

Reglas:
- `id_pros` se inserta directamente como PK.
- `id_usuario` debe existir en `usuarios.id_SB`.
- `ubicacion` se conserva y además se divide en latitud y longitud cuando es válida.
- `comenario` se acepta con el nombre exacto del encabezado compartido; también se acepta `comentario`.
- `fecha_visita` se guarda únicamente en `fecha_visita`; no reemplaza `created_at`.
- `foto_1` a `foto_4` se guardan en `ventas_prospeccion_archivos` como `VISITA`.
- La repetición del envío actualiza la prospección y reemplaza sus fotos de visita.

### Comentarios

`POST /api/ventas/prospeccion/comentarios/sync`

Acepta un arreglo directo o `{ "registros": [...] }` con:

`id_com_pors, id_pros, id_usuario, comentario, fecha_hora, adjunto`

Reglas:
- `id_com_pors` se inserta directamente como PK.
- `id_pros` debe existir antes de cargar el comentario.
- `id_usuario` debe existir en `usuarios.id_SB`.
- Si `fecha_hora` tiene valor, se usa tanto en `fecha_hora` como en `created_at`.
- Si `fecha_hora` está vacío, `fecha_hora` queda NULL y `created_at` usa el valor automático de MySQL.
- `adjunto` se guarda en `ventas_prospeccion_archivos` como `COMENTARIO`.
- La repetición del envío actualiza el comentario y reemplaza su adjunto.

## Procesamiento

- Lotes internos de 300 registros.
- Una transacción por lote.
- Máximo 100 errores detallados en la respuesta.
- No crea columnas ni modifica las tablas.
