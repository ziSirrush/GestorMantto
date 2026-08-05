# FIX Clientes Conteos ID o Nombre + Asesor V004

## Alcance
Corrige los conteos del listado de Ventas > Clientes.

## Regla aplicada
Una cotizacion se relaciona con el cliente cuando coincide cualquiera de estas rutas:

- `ventas_cotizaciones_cor.id_cliente = ventas_clientes.id_cliente`, o
- `ventas_cotizaciones_cor.cliente = ventas_clientes.nombre_empresa` normalizado.

Ademas, siempre debe coincidir el asesor por cualquiera de estas rutas:

- `ventas_cotizaciones_cor.id_asesor` con el usuario identificado por `ventas_clientes.iniciales`, o
- `ventas_cotizaciones_cor.asesor = ventas_clientes.iniciales` normalizado.

La misma regla se usa para Cotizaciones, En proceso, Vendidas y Perdidas.

## Archivo modificado
- `backend/src/modules/ventas-clientes/ventas-clientes.repository.js`

No modifica tablas, frontend, permisos ni otros modulos.
