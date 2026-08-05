# FIX_NORI_DOCK_PC_INTEGRADO_V002

## Objetivo
Restaurar el dock de Nori en escritorio sin sobrescribir ni revertir los cambios recientes del Visor de Usuarios, la sincronización silenciosa, el guardado selectivo del Panel de Control ni la actualización inmediata de datos.

## Alcance
Se integraron únicamente los cambios funcionales de `FIX_NORI_DOCK_PC_V001` sobre la base acumulada vigente.

### Escritorio
- Nori queda parcialmente visible en el borde derecho.
- Al pasar el cursor o enfocar con teclado, se despliega y muestra la etiqueta `Nori`.
- Al abrirse, el panel entra desde el lado derecho y el avatar queda como botón de minimizar.
- `Escape` cierra el panel.
- `Ctrl + Shift + N` abre o minimiza Nori.
- Se respeta `prefers-reduced-motion`.

### Móvil
- Se conserva el avatar flotante.
- Se conserva el arrastre táctil existente.
- No se aplica el dock de escritorio en pantallas de hasta 760 px.

## Archivos modificados
- `index.html`
- `core/app.js`
- `styles/base.css`

## Compatibilidad preservada
- No se eliminó `installMutationRefreshSignal()`.
- No se tocaron `core/data-sync.js`, `core/user-viewer.js`, Panel de Control, backend ni base de datos.
- Se conservaron los estilos completos del Visor y los ajustes móviles recientes.
- Se actualizaron únicamente las versiones de caché de `base.css` y `app.js`.

## Despliegue
Publicar únicamente el frontend y realizar una recarga forzada del navegador.
