# Fase 3 — Resumen del Día Experimental

Fecha: 05/08/2026  
Versión: V001

## Alcance

Se integró el módulo funcional **Resumen del Día** dentro de la agrupación **Experimental**.

La vista conserva la lógica principal del prototipo `Desarrollo_United_Experimental` y se adapta a la arquitectura vigente de Mantto Gestor:

- Frontend modular.
- Backend Node.js + Express.
- Aiven MySQL como fuente operativa.
- Permiso visual independiente.
- Cálculos en backend.
- Filtros por Estado y Zona Operativa.
- Diseño responsivo para escritorio y dispositivos móviles.

## Fuente de datos

Se reutiliza exclusivamente la tabla existente:

- `tickets`

No se crean tablas nuevas ni se alteran tablas existentes.

## Endpoint agregado

`GET /api/experimental/resumen-dia`

Filtros opcionales:

- `estado`
- `zona`

El endpoint requiere:

- Sesión autenticada.
- Permiso efectivo `RESUMEN_DIA_EXP_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`.

## Indicadores conservados

- Tickets reportados durante el día operativo.
- Diferencia de tickets contra el día anterior.
- Tickets abiertos.
- Tickets cerrados.
- Tickets en curso.
- Distribución porcentual de estados.
- Promedio del tiempo de llegada.
- Cierres con equipo funcionando.
- Cierres con equipo no funcionando.
- Porcentaje de cierres funcionando.
- Responsabilidad BLT.
- Responsabilidad Cliente.
- Equipos parados del día.
- Diferencia de equipos parados contra el día anterior.
- Diferencia de cierres No Funcionando contra el día anterior.

## Reglas funcionales

### Fecha operativa

La fecha actual y el día anterior se resuelven en backend usando la zona horaria:

- `America/Mexico_City`

Esto evita que el cambio de día dependa de UTC en el navegador.

### Promedio de llegada

Se utiliza `tickets.tiempo_llegada` y se conservan valores mayores que cero y menores de 744 horas, conforme al tratamiento del prototipo.

### Cierre del día

Solo se consideran tickets cerrados. El campo `estatus_equipo_final` determina:

- Funcionando.
- No funcionando.

### Equipos parados

Se conserva el criterio del prototipo:

- Códigos de equipo únicos con ticket reportado durante el día y estado distinto de Cerrado.

Este indicador no sustituye el estado operativo oficial del Portafolio.

## Retiro de Equipos Críticos Original Experimental

De acuerdo con la decisión aprobada antes de esta fase, se retira la opción **Equipos Críticos Original** de la agrupación Experimental porque duplica en gran medida el módulo funcional vigente.

Se incluye el SQL:

- `backend/sql/20260805_FASE_3_RETIRAR_EQUIPOS_CRITICOS_ORIGINAL_EXP.sql`

El script desactiva sus registros de módulo y permisos, sin eliminarlos y sin modificar Equipos Críticos funcional ni Equipos Críticos Experimental.

## Archivos modificados o agregados

- `index.html`
- `core/router.js`
- `modules/experimental/experimental.js`
- `modules/experimental-resumen-dia/experimental-resumen-dia.js`
- `modules/experimental-resumen-dia/experimental-resumen-dia.css`
- `backend/src/routes/index.js`
- `backend/src/modules/experimental-resumen-dia/experimental-resumen-dia.routes.js`
- `backend/src/modules/experimental-resumen-dia/experimental-resumen-dia.controller.js`
- `backend/src/modules/experimental-resumen-dia/experimental-resumen-dia.service.js`
- `backend/src/modules/experimental-resumen-dia/experimental-resumen-dia.repository.js`
- `backend/sql/20260805_FASE_3_RETIRAR_EQUIPOS_CRITICOS_ORIGINAL_EXP.sql`
- `docs/FASE_3_RESUMEN_DIA_EXPERIMENTAL_V001.md`

## Despliegue

1. Confirmar que las Fases 0, 1 y 2 estén aplicadas.
2. Ejecutar el SQL de retiro de Equipos Críticos Original Experimental.
3. Desplegar los archivos del backend.
4. Publicar los archivos del frontend.
5. Activar el permiso de Resumen del Día Experimental para los usuarios o roles autorizados.
6. Validar cifras contra Aiven.

## Fuera de alcance

- Entregas Recientes.
- Equipos Críticos Experimental.
- Dashboard Call Center Experimental.
- Proyectos Críticos y su PDF.
- Modificación de módulos funcionales en Nevera.
- Creación o modificación estructural de tablas.
