# FIX Clientes - conteos por cliente y asesor V002

## Causa
La consulta anterior contaba cotizaciones solo con `ventas_cotizaciones_cor.id_cliente = ventas_clientes.id_cliente`.
Eso producía ceros cuando las cotizaciones históricas no tenían `id_cliente` poblado y tampoco separaba correctamente al mismo cliente entre asesores distintos.

## Regla aplicada
Una cotización cuenta únicamente si coinciden:

1. El cliente.
2. El asesor.

Se priorizan IDs cuando existen:
- `q.id_cliente = vc.id_cliente`
- `q.id_asesor = usuarios.id_SB` resuelto desde `ventas_clientes.iniciales`

Solo si falta el ID correspondiente se usa respaldo histórico normalizado:
- `q.cliente = vc.nombre_empresa`
- `q.asesor = vc.iniciales`

## Columnas corregidas
- Cotizaciones
- En proceso
- Vendidas
- Perdidas

No se modifica la estructura de tablas, frontend, permisos ni otros módulos.
