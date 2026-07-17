# Fix Dashboard Operativo: preventivo por supervisor y equipos activos

## Archivo base revisado
- `Ultima Ver 2303.zip`

## Regla aplicada
La gráfica inferior derecha ahora muestra **% Servicio preventivo por supervisor**.

- Agrupación: `portafolio.supervisor_zona`.
- Denominador: equipos cuyo `estatus_servicio` normalizado sea `En Servicio`.
- Numerador: equipos de ese mismo supervisor con confirmación mensual de servicio en el mes seleccionado.
- Se excluyen `No aplica` y `Sin asignar`.
- Al seleccionar una barra se abre el detalle de los equipos activos correspondientes al supervisor.

## Archivos modificados
- `modules/dashboard-operativo/dashboard-operativo.js`
- `modules/dashboard-operativo/dashboard-operativo.html`
- `index.html` (actualización de versión para evitar caché del JavaScript)

## Validación
- `node --check modules/dashboard-operativo/dashboard-operativo.js`: correcto.

## No modificado
- Base de datos.
- Backend.
- Otras gráficas o módulos.
