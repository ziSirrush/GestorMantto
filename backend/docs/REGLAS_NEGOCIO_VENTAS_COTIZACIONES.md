# Normas de Desarrollo - Ventas Cotizaciones

Estado: Aprobadas para Fase 3
Fecha: 28/07/2026

## ND-VC-01. Separación frontend/backend

El frontend presenta formularios, botones y mensajes. El backend valida permisos, datos y persistencia en Aiven MySQL.

## ND-VC-02. Catálogo de estatus

Solo se aceptan los siguientes valores:

- Contacto
- En Cotizacion
- Sin Respuesta
- Seguimiento con Probabilidad
- En Espera de Definicion
- Pre Asignado
- Asignado
- En Contrato
- Vendido
- Perdido
- Siguiente Año
- Borrar

No se impone una secuencia rígida ni se prohíben regresos de estatus porque esa restricción no fue confirmada.

## ND-VC-03. Edición controlada

El backend solo admite columnas incluidas en la lista blanca del módulo. Campos ajenos son ignorados y no se construyen nombres de columnas desde la petición.

## ND-VC-04. Reasignación

La reasignación requiere el ID del asesor o administrativo. El usuario debe existir y estar activo. Las iniciales se obtienen del catálogo de usuarios cuando el frontend no las envía.

## ND-VC-05. Seguimientos acumulativos

Cada seguimiento se registra como una entrada nueva. No sobrescribe seguimientos previos ni el comentario principal de la cotización.

## ND-VC-06. Auditoría

Las escrituras registran quién, qué, cuándo, desde dónde y, cuando se proporciona, por qué. Se conservan valores anteriores y nuevos en formato JSON.

## ND-VC-07. Transacciones

Cada operación de escritura y su registro de auditoría se confirman en una misma transacción. Si una parte falla, se revierte todo.

## ND-VC-08. Permisos

Se reutilizan los permisos granulares existentes:

- `VENTAS_COTIZACIONES_OPERACION.VER`
- `VENTAS_COTIZACIONES_OPERACION.CREAR`
- `VENTAS_COTIZACIONES_OPERACION.EDITAR`
- `VENTAS_COTIZACIONES_OPERACION.ELIMINAR`

## ND-VC-09. Registros inactivos

No se permite cambiar estatus, reasignar ni agregar seguimientos a cotizaciones inactivas.
