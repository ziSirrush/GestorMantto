# FIX 02.2 - Corrección de formato de Proyecto y lectura de Cobranza

Fecha: 15/08/2026
Base usada:
- `FIX_02_1_COBRANZA_PROYECTO_FK_20260815` para backend.
- `FIX_02_DETALLE_PROYECTO_ADEUDOS_20260815` para `core/details.js`, ya que FIX 02.1 no modificó ese archivo.
- `FIX_01_3_PROJECT_NAME_FECHA_FLEXIBLE_20260815` se revisó únicamente como referencia. Su parser global ya reconoce `16 DE septiembre 0197`, por lo que no se regenera ni modifica.

## Hallazgo 1 - Fecha/proyecto
`ManttoFormat.projectName()` ya convierte correctamente:

- `16 DE septiembre 0197`
- `0197-09-16T06:36:36.000Z`
- `16/09/0197`

hacia:

`16 de Septiembre #197`

El problema visible en Detalle Proyecto era que el encabezado usaba directamente `p.proyecto_nombre`/`p.proyecto` y no pasaba por `projectNameDisplay()`.

### Corrección
En `core/details.js`, solamente el título y subtítulo de Detalle Proyecto pasan ahora por `projectNameDisplay()`. El valor real de proyecto usado para consultas y navegación no se altera.

## Hallazgo 2 - Cobranza
FIX 02.1 priorizaba exclusivamente `id_proyecto_cobranza` cuando existía y solo usaba texto si la FK era NULL.

### Corrección
`filtroProyectoCobranza_gnral()` conserva la FK como primera condición y agrega fallback por equivalencia de formato del proyecto en la misma consulta.

Ejemplo para `16 DE septiembre 0197` con FK `1`:

- `id_proyecto_cobranza = 1`
- texto exacto `16 DE septiembre 0197`
- prefijo `197-09-16%`
- prefijo `0197-09-16%`

Esto permite encontrar registros históricos almacenados como, por ejemplo, `0197-09-16T06:36:36.000Z`, sin modificar los datos de Aiven.

La misma regla se aplica únicamente a las tres lecturas de FIX 02:

- `gestion_credito`
- `detalle_mp_2026`
- `pc`

## Archivos modificados
- `core/details.js`
- `backend/src/modules/proyectos/proyectos.service.js`

## No se modifica
- `core/project-name.js` (ya funciona para el formato reportado).
- Dashboard Portafolio.
- Tabla Portafolio.
- Base de datos o esquema.
- Apps Script.
- Módulos de Cobranza, MP o VA.
- Rutas, permisos, notificaciones, CSS ni módulos en Nevera no relacionados.

## Validaciones realizadas
- `node --check core/details.js` -> OK.
- `node --check backend/src/modules/proyectos/proyectos.service.js` -> OK.
- Parser global verificado con `16 DE septiembre 0197` -> `16 de Septiembre #197`.
- Filtro backend verificado para:
  - `16 DE septiembre 0197`
  - `0197-09-16T06:36:36.000Z`
  - `16/09/0197`
  - `197-09-16`
- Para el caso actual genera FK `1` + variantes `197-09-16%` y `0197-09-16%`.

## Deploy
Este FIX modifica frontend y backend:
1. Publicar `core/details.js`.
2. Publicar/reiniciar backend por `proyectos.service.js`.
3. Refrescar la aplicación.
4. Abrir `16 de Septiembre #197` y validar nombre, Adeudo MP, Adeudo VA y Adeudo Total.
