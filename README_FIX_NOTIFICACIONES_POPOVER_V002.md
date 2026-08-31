# FIX_NOTIFICACIONES_POPOVER_V002

## Problema confirmado
El popover `#hdr-notif-popover` se genera en `modules/home/home.js` con una lista `.hdr-notif-list` y botones `.hdr-notif-row` que contienen icono, titulo, mensaje y fecha.

En `styles/home.css` la lista original usa `display:flex; flex-direction:column`. Cuando otras hojas CSS lazy cargadas por los modulos alteran dimensiones de `button`/elementos internos, las filas pueden terminar comprimidas. El FIX V001 dependia de una hoja adicional; este V002 deja la defensa directamente al final de `styles/home.css` y cambia la lista a `display:block`, eliminando por estructura el encogimiento como flex-item.

## Que modifica
Solo frontend:
- `styles/home.css`: agrega un bloque aislado con selectores bajo `#hdr-notif-popover` y propiedades criticas con `!important`.
- `index.html`: cambia la version de `home.css` a `20260831-notif-popover-v002` para forzar recarga del CSS.
- Si existe un link del antiguo `styles/notificaciones-layout-fix.css`, lo retira de `index.html` para no mantener dos fixes paralelos.

No modifica backend, Aiven, estados leido/no leido, rutas, contenido ni logica de notificaciones.

## Aplicacion
Extrae el ZIP. Copia `aplicar_fix_notificaciones_popover_v002.py` y la carpeta `patches` a la raiz del repo, o extrae todo el paquete en una carpeta y ejecuta el aplicador desde la raiz del repo:

```powershell
python .\RUTA_DEL_FIX\aplicar_fix_notificaciones_popover_v002.py
```

El script trabaja sobre el directorio actual, por lo que debes estar situado en la raiz de `GestorMantto`.

Revisa:

```powershell
git diff -- index.html styles/home.css
```

Valida:

```powershell
python .\RUTA_DEL_FIX\validar_fix_notificaciones_popover_v002.py
```

## Resultado esperado
Cada notificacion conserva una tarjeta de altura normal con:
- icono;
- titulo;
- mensaje;
- fecha/hora.

Si hay muchas notificaciones, el scroll ocurre en `.hdr-notif-list`; las tarjetas no se aplastan para intentar caber en el popover.

## Nota de despliegue
Despues de publicar frontend, hacer recarga forzada. La version `home.css?v=20260831-notif-popover-v002` evita depender del CSS anterior almacenado en cache.
