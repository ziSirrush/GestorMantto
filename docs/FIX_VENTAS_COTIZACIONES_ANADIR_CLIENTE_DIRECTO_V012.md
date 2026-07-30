# FIX V012 - Añadir cliente desde Nueva cotización

## Corrección

El botón **Añadir cliente** de `Nueva cotización` ahora abre directamente la vista:

`ventas-clientes-nuevo`

Se envía el contexto de retorno `ventas-cotizaciones-nueva`.

## Regreso después del alta

Cuando el cliente se guarda desde esa vista:

1. Regresa a `Nueva cotización`.
2. Recarga la colección de clientes visibles.
3. Selecciona automáticamente el cliente recién creado.
4. Carga sus contactos y selecciona el principal cuando exista.
5. Restaura los demás datos previamente capturados en la cotización.

## Archivo modificado

- `modules/ventas-cotizaciones-nueva/ventas-cotizaciones-nueva.js`

No requiere SQL ni cambios de backend.
