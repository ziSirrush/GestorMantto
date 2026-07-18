# Fix Dashboard Operativo - Vo.Bo. por Supervisor

Fecha: 18/07/2026
Estado sugerido: Pruebas

## Archivos modificados

- `modules/dashboard-operativo/dashboard-operativo.html`
- `modules/dashboard-operativo/dashboard-operativo.js`

## Cambio aplicado

1. Se eliminó la gráfica incorrecta **"% Servicio por tipo de equipo"**.
2. Se restauró **"% Vo.Bo. validados por supervisor"**.
3. La métrica agrupa los tickets del período por el Supervisor responsable del ticket.
4. El numerador cuenta únicamente tickets cuyo `vobo_estado`, normalizado, sea exactamente `VALIDADO`.
5. El denominador es el total de tickets del período asignados a ese Supervisor.
6. Se excluyen de la gráfica los responsables `Sin asignar` y `No aplica`.
7. Al seleccionar una barra se abre el modal de tickets correspondiente al Supervisor, conservando los enlaces al Detalle Ticket global.
8. Los KPIs y la gráfica de Vo.Bo. por zona usan la misma validación exacta, evitando falsos positivos como estados que solo contengan la palabra `VALID`.
9. Se actualizó la versión de caché del HTML a `20260718-v003`.

## No se modificó

- Backend.
- Base de datos.
- Detalle Ticket.
- CSS.
- Otros módulos.

## Validación técnica

- `node --check modules/dashboard-operativo/dashboard-operativo.js`: correcto.
- Sin referencias restantes a `op-bar-tipo` ni `tipo_serv`.
- IDs separados para servicio preventivo por Supervisor y Vo.Bo. por Supervisor.

## Prueba funcional recomendada

1. Publicar ambos archivos respetando sus rutas.
2. Abrir Dashboard Operativo y hacer una recarga forzada.
3. Seleccionar un mes con tickets.
4. Confirmar que aparece **"% Vo.Bo. validados por supervisor"**.
5. Comparar cada barra contra `vobo_estado = 'VALIDADO'` en los tickets del mes.
6. Hacer clic en una barra y validar que el modal muestre los tickets del Supervisor seleccionado.
