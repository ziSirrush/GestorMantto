# FIX_NOTIFICACIONES_LAYOUT_V001

## Problema corregido

Cuando existen muchas notificaciones dentro de **Notificaciones nuevas**, las tarjetas se comprimen verticalmente y el texto queda recortado.

La causa es de layout: `.hdr-notif-list` es una columna flex con altura maxima y scroll, mientras cada `.hdr-notif-row` podia conservar el valor por defecto `flex-shrink: 1`. Un FIX previo agrego `overflow:hidden` a la tarjeta para controlar el desbordamiento horizontal; con muchas filas eso permite que el navegador reduzca su altura en lugar de dejar que la lista desplace verticalmente.

## Correccion

- Cada `.hdr-notif-row` queda con `flex: 0 0 auto` y `flex-shrink: 0`.
- Cada tarjeta conserva altura natural y un minimo de 64 px.
- Titulo, descripcion y fecha conservan sus lineas normales.
- `.hdr-notif-list` sigue siendo el unico contenedor que hace scroll vertical.
- No se cambia JavaScript, backend, Aiven, estados leido/no leido ni rutas de notificaciones.

## Archivos del FIX

- `styles/notificaciones-layout-fix.css` (archivo nuevo completo)
- `aplicar_fix_notificaciones_layout_v001.py`
- `validar_fix_notificaciones_layout_v001.py`
- `patches/CAMBIOS_NOTIFICACIONES_LAYOUT_V001.patch`
- `validation/VALIDACION_FIX.txt`
- `MANIFEST_SHA256.txt`

El aplicador agrega a `index.html`, inmediatamente despues de `styles/home.css`, el link cache-busteado al CSS del FIX. No reescribe `styles/home.css`.

## Aplicacion recomendada

Extrae el ZIP **sobre la raiz del repo GestorMantto** y ejecuta:

```powershell
python .\aplicar_fix_notificaciones_layout_v001.py
```

Revisa los cambios:

```powershell
git diff -- index.html styles/notificaciones-layout-fix.css
```

Valida:

```powershell
python .\validar_fix_notificaciones_layout_v001.py
```

Despues publica el frontend por el procedimiento normal y realiza una recarga forzada del navegador.

## Resultado esperado

Con 5, 15, 30 o mas notificaciones, las tarjetas conservan su altura normal. El popover mantiene su altura maxima y aparece scroll vertical para recorrer las restantes.
