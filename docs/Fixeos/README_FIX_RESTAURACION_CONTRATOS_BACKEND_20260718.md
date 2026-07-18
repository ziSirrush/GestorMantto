# FIX RESTAURACION CONTRATOS BACKEND 20260718

## Objetivo

Restaurar los contratos del backend consumidos por las vistas congeladas sin modificar su frontend y conservando el endpoint nuevo del Dashboard Operativo.

## Archivos modificados

- `backend/src/controllers/data.controller.js`
- `backend/src/routes/data.routes.js`

## Contratos restaurados

- Detalle Equipo: KPIs, series de graficas, anos disponibles, periodo U365 y datos asociados.
- Detalle Proyecto: KPIs, distribuciones, informacion independiente por equipo y anos de tickets.
- Detalle Ticket: interacciones, comentarios y validacion.
- Equipos Criticos: consulta de tickets por lote.
- Movimientos Portafolio: catalogo y consulta de movimientos semanales.
- Rutas de Call Center U365 y autenticacion opcional de criticidad.

## Funcionalidad conservada

- `GET /api/servicios-preventivos/resumen-supervisor`
- El endpoint conserva autenticacion obligatoria y su exportacion desde el controlador.

## Instalacion

Copiar los dos archivos incluidos respetando sus rutas dentro del backend. No reemplazar otros archivos del proyecto.

## Validaciones realizadas

- Sintaxis de ambos archivos con `node --check`.
- Confirmacion de exportaciones del controlador.
- Confirmacion de rutas restauradas y del endpoint de preventivos.
- Comparacion contra la version inmediatamente anterior a la regresion identificada en el commit `5400d41`.

## Validacion recomendada antes de desplegar

1. Iniciar el backend localmente.
2. Verificar `/api/health`.
3. Abrir Detalle Equipo y comprobar KPIs, graficas y selector anual.
4. Abrir Detalle Proyecto y comprobar KPIs, rings, equipos y tickets.
5. Probar interacciones y validacion de Detalle Ticket.
6. Probar Equipos Criticos y Movimientos Portafolio semanales.
7. Verificar que Dashboard Operativo siga cargando preventivos por supervisor.
