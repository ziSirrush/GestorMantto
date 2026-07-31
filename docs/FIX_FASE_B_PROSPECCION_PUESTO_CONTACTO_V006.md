# FIX Fase B - Puesto del contacto en Prospeccion V006

## Alcance
Integra `puesto_contacto` en la captura de Nueva visita de Prospeccion.

## Reglas
- Contacto existente: carga nombre, puesto, correo y telefono.
- Nuevo contacto: permite capturar puesto y lo guarda en `ventas_clientes_contactos`.
- La visita conserva una copia historica en `ventas_prospecciones.puesto_contacto`.
- El selector muestra `Nombre · Puesto` cuando el puesto existe.
- No modifica Clientes, Nueva Cotizacion ni otros modulos; se atenderan en fases posteriores.

## Requisito previo
Las columnas `puesto_contacto` deben existir en:
- `ventas_clientes_contactos`
- `ventas_clientes`
- `ventas_prospecciones`
