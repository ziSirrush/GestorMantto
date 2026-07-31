# Fase C — Puesto del contacto en Clientes y Cotizaciones

## Incluye
- Nuevo cliente: captura y persistencia del puesto del contacto principal.
- Directorio de contactos: alta, edición, lectura y visualización del puesto.
- Nueva cotización: muestra el puesto en la lista y lo precarga al elegir contacto.
- Detalle de cotización: obtiene el puesto vigente desde `ventas_clientes_contactos` mediante `id_contacto`.

## Base de datos
Requiere las columnas ya aplicadas en Fase A. No agrega una columna a `ventas_cotizaciones_cor`; se conserva la relación normalizada con `id_contacto`.

## Alcance descartado
No se modifica Instalaciones. La Fase D se considera innecesaria mientras Clientes, Contactos y Cotizaciones sean la fuente comercial del dato.
