# FIX_NORI_DOCK_PC_V001

## Objetivo
Evitar que Nori cubra información en escritorio sin perder su acceso rápido ni modificar su comportamiento móvil.

## Comportamiento nuevo en PC
- Nori permanece parcialmente oculta en el borde derecho como una pestaña compacta.
- Al pasar el cursor o enfocarla con teclado, se despliega suavemente y muestra la etiqueta `Nori`.
- Al pulsarla, abre el panel de soporte desde el borde derecho.
- Cuando el panel está abierto, el avatar queda junto al panel y funciona como botón para minimizarlo.
- `Escape` cierra el panel.
- `Ctrl + Shift + N` abre o minimiza Nori.
- Se respeta `prefers-reduced-motion`.

## Comportamiento móvil
- Se conserva el avatar flotante.
- Se conserva el arrastre táctil existente.
- No se aplican el dock ni los cambios de escritorio en pantallas de hasta 760 px.

## Archivos modificados
- `index.html`
- `core/app.js`
- `styles/base.css`

## Validaciones
- `node --check core/app.js`: correcto.
- No se agregaron librerías, timers, observadores ni llamadas de red.
- El cambio utiliza únicamente CSS y eventos ya disponibles del navegador.
- Se actualizaron las versiones de caché de `base.css` y `app.js` en `index.html`.

## Instalación
Reemplazar los tres archivos respetando sus rutas y publicar únicamente el frontend.
