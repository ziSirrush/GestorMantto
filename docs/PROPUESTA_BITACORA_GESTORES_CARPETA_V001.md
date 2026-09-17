# Propuesta de modificaciones: Bitácora de Obra y gestores de carpeta V001

## Estado del documento

- Fecha: 2026-09-17.
- Estado: alcance funcional y técnico fijado para revisión.
- Ruta funcional: `Instalaciones > Proyectos > Detalle de proyecto > Bitácora de Obra`.
- Código de permiso actual: `INSTALACIONES_PROYECTOS_DETALLE_PROYECTO_BITACORA.VER`.
- Este documento no implementa cambios de código, base de datos ni permisos.

## Objetivo

1. Convertir la Bitácora de Obra en una consulta por visitas, donde cada visita corresponde a una fecha distinta de carga de documentos en Drive.
2. Mostrar solamente los registros de la fecha seleccionada.
3. Mostrar un contador de visitas igual al número de fechas agrupadas.
4. Conservar la Bitácora de Obra; no será reemplazada por el gestor de carpeta.
5. Agregar un gestor de carpeta nuevo con una vista tabular semejante a la Bitácora actual.
6. Conservar el gestor de carpeta anterior, pero ocultarlo mediante un permiso específico y sin eliminar su implementación.
7. Identificar visualmente los proyectos que no tengan una carpeta de Drive relacionada.

## Respuesta a la pregunta sobre la fecha real del documento

### Lo que sí se puede leer actualmente

La integración actual solicita a Google Drive los metadatos `createdTime` y `modifiedTime` y los guarda como `fecha_creacion_drive` y `fecha_modificacion_drive`.

- `createdTime`: fecha y hora en que fue creado el recurso de archivo en Drive.
- `modifiedTime`: última fecha y hora en que cualquier usuario modificó el archivo.
- `fecha_primera_deteccion`: momento en que Mantto Gestor detectó por primera vez el archivo durante una sincronización; no es necesariamente su fecha de carga real.

Google define oficialmente `createdTime` como el momento de creación del archivo y `modifiedTime` como su última modificación: [recurso `files` de Drive API](https://developers.google.com/workspace/drive/api/reference/rest/v3/files).

### Lo que no hace la lógica actual

La Bitácora no descarga ni abre el contenido de PDF, Word, Excel u otros documentos para buscar una fecha escrita o embebida en ellos. Tampoco solicita actualmente la fecha EXIF de las fotografías.

Es técnicamente posible ampliar la lectura, con estas limitaciones:

- Para imágenes, Drive puede devolver `imageMediaMetadata.time`, que corresponde a la fecha EXIF de toma cuando la imagen contiene ese dato.
- Para PDF u Office se tendría que descargar y analizar el archivo. La fecha interna puede no existir, ser incorrecta, haber sido alterada o representar la creación del archivo original y no su carga en Drive.
- Los documentos nativos de Google no tienen una “fecha real del documento” universal distinta de sus metadatos e historial.

Por esas razones, la fecha interna del archivo no debe usarse como criterio general de agrupación.

### Decisión recomendada para esta versión

La agrupación se realizará con `createdTime` de Drive, persistido como `fecha_creacion_drive`, y se mostrará al usuario con la etiqueta **Fecha de carga en Drive**.

Esta definición tiene una limitación conocida: si un archivo ya existía en Drive y posteriormente fue movido a la carpeta del proyecto, `createdTime` conserva la creación del archivo; no representa el momento exacto en que fue incorporado a esa carpeta. La lógica actual no puede reconstruir retroactivamente esa fecha de incorporación.

Si el negocio requiere la fecha exacta de incorporación a la carpeta, deberá plantearse una fase distinta basada en actividad/cambios de Drive o en un registro generado por Mantto Gestor desde el momento en que comience a monitorear la carpeta.

## Diagnóstico de la lógica actual

### Bitácora de Obra

La implementación actual se encuentra principalmente en:

- `core/details.js`.
- `backend/src/modules/instalaciones-bitacora/instalaciones-bitacora.service.js`.
- `backend/src/modules/instalaciones-bitacora/instalaciones-bitacora.repository.js`.
- `backend/src/services/google/drive.service.js`.

Comportamiento actual:

1. Al abrir el detalle se consulta primero la información persistida.
2. En segundo plano se sincroniza recursivamente la carpeta del proyecto y sus subcarpetas.
3. Se guardan altas y actualizaciones por `drive_file_id`.
4. Los archivos que dejan de aparecer se conservan en la bitácora con estatus `eliminado`.
5. Los documentos no-imagen se muestran en una sola tabla, ordenados por “Último movimiento”.
6. La tabla se pagina del lado del navegador en bloques de 15 registros.
7. Las imágenes no aparecen como renglones. Se cuentan como evidencia fotográfica activa del mismo día de `fecha_creacion_drive` y el total se muestra junto a cada documento de esa fecha.
8. La fecha visible de “Último movimiento” prioriza modificación, creación o primera detección; por lo tanto, actualmente no representa de forma estricta la fecha de carga.
9. La agrupación SQL existente de fotografías usa `DATE(fecha_creacion_drive)` en UTC. No define explícitamente el día civil de Ciudad de México.

### Gestor de carpeta anterior

El gestor existente también está dentro de `core/details.js` y actualmente:

- aparece sin un permiso visual propio;
- valida la conexión OAuth de Google del usuario;
- permite alternar entre “Carpeta del proyecto” y “Carpeta raíz”;
- muestra un árbol expandible de carpetas y archivos;
- permite abrir cada elemento en Drive;
- se inicializa siempre que se abre el detalle unificado del proyecto.

## Especificación funcional propuesta

### 1. Bitácora agrupada por fecha de carga

La Bitácora de Obra debe conservar su permiso actual y cambiar solamente su forma de consulta y presentación.

#### Definición de una visita

- Una visita es una fecha civil distinta obtenida de `fecha_creacion_drive` de los documentos no-imagen de la bitácora.
- La fecha civil se calculará en la zona `America/Mexico_City` antes de agrupar.
- Las imágenes seguirán siendo evidencia asociada al día y no crearán por sí solas una visita.
- Los documentos históricos con estatus `eliminado` seguirán formando parte de su visita. La bitácora no debe perder una visita porque el archivo dejó de estar en Drive.
- Un registro sin `fecha_creacion_drive` se mostrará en un grupo separado llamado “Sin fecha de Drive”, pero ese grupo no aumentará el contador de visitas.

#### Contador

- Etiqueta: `Visitas`.
- Valor: cantidad de fechas válidas y distintas presentes en la agrupación.
- No es la cantidad de documentos, imágenes, carpetas ni sincronizaciones.
- El valor debe calcularse en backend con el mismo conjunto de datos usado para construir los grupos; no debe inferirse de la página visible.

#### Selector de fecha

- Los grupos se ordenarán del más reciente al más antiguo.
- Cada opción mostrará la fecha en formato `DD/MM/AAAA` y el número de documentos de ese grupo.
- Al entrar a la Bitácora se seleccionará automáticamente la fecha más reciente.
- Al seleccionar una fecha solamente se mostrarán los documentos y la evidencia correspondientes a esa fecha.
- Cambiar de fecha no debe abrir Drive ni ejecutar una nueva sincronización.
- Después de pulsar “Actualizar”, se reconstruyen los grupos y se conserva la fecha seleccionada si todavía existe; en caso contrario se selecciona la más reciente.

#### Tabla de la fecha seleccionada

Se conserva la presentación general de la tabla actual:

- Documento.
- Subcarpeta.
- Fecha de carga en Drive.
- Último movimiento.
- Estado.
- Contador de evidencia fotográfica de la fecha.
- Acción para abrir el archivo en Drive.

La paginación de 15 registros se aplica dentro del grupo seleccionado, no sobre todos los documentos del proyecto.

### 2. Gestor de carpeta nuevo

Se agregará un segundo gestor sin sustituir ni reutilizar visualmente el árbol anterior.

#### Presentación

La nueva vista usará el patrón tabular de la Bitácora actual:

- lista plana de archivos;
- icono por tipo;
- nombre del archivo y acción “Abrir”;
- ruta de la subcarpeta;
- fecha de creación/carga;
- última modificación;
- estado activo o eliminado cuando el inventario persistido lo permita;
- paginación de 15 registros;
- estado de última sincronización y botón “Actualizar”.

Las carpetas no se mostrarán como renglones expandibles. La jerarquía se representará mediante la columna “Subcarpeta”. A diferencia de la Bitácora, el nuevo gestor deberá incluir todos los tipos de archivo, también imágenes.

#### Separación respecto de la Bitácora

- La Bitácora seguirá siendo el historial organizado por visitas.
- El gestor nuevo será el inventario general de la carpeta.
- Seleccionar una visita afectará solamente a la Bitácora.
- El inventario del gestor nuevo no debe alterar el contador de visitas.
- Ambos componentes pueden reutilizar los mismos datos sincronizados, pero deben tener estados de interfaz independientes.

### 3. Gestor de carpeta anterior bajo permiso

El árbol existente se conserva como gestor legado y se oculta de forma predeterminada.

Permiso propuesto:

`INSTALACIONES_PROYECTOS_DETALLE_PROYECTO_GESTOR_CARPETA_LEGACY.VER`

Reglas:

- El subelemento debe llamarse `Gestor de carpeta anterior` o `Gestor de carpeta legado` en el Panel de Control.
- La migración solamente registra el permiso; no lo asigna automáticamente a roles ni usuarios.
- Si el permiso no existe, no está configurado o no es efectivo, el componente no se muestra ni se inicializa.
- Al no inicializarse, no debe consultar el estado OAuth, la relación de carpeta ni los hijos de Drive.
- La implementación del árbol no se elimina para permitir su habilitación controlada durante la transición.
- El permiso debe validarse también en cualquier endpoint dedicado que se cree exclusivamente para el gestor legado. No se debe modificar globalmente el endpoint genérico de Drive si es utilizado por otros módulos.

Permiso propuesto para el gestor nuevo:

`INSTALACIONES_PROYECTOS_DETALLE_PROYECTO_GESTOR_CARPETA.VER`

El gestor nuevo también debe operar con permiso efectivo y validación backend. Esto evita que la visibilidad dependa únicamente de ocultar HTML en el navegador.

### 4. Indicador de proyecto sin carpeta relacionada

Los proyectos que no tengan una relación activa con una carpeta de Drive mostrarán el indicador `📁❌`.

Reglas:

- El indicador significa exclusivamente `Sin carpeta relacionada`.
- Debe mostrarse en el listado de proyectos y en el encabezado o resumen del detalle del proyecto.
- Dentro de los gestores debe conservarse además el mensaje textual `Sin carpeta relacionada` o `SIN CARPETA ASIGNADA`.
- El indicador se calcula con la relación activa del proyecto; no basta con que exista una carpeta de nombre parecido.
- Si la relación está inactiva, eliminada o no contiene un `carpeta_id` válido, el proyecto se considera sin carpeta.
- Cuando se cree o reactive una relación válida, el indicador debe desaparecer después de actualizar los datos.
- El emoji debe incluir texto visible o un `aria-label` con `Sin carpeta relacionada`; no debe ser el único medio para comunicar el estado.
- El indicador es informativo. Pulsarlo no debe abrir OAuth, Drive ni el gestor legado.

## Contrato de datos propuesto para la Bitácora

La respuesta persistida debe separar resumen, grupos y registros seleccionados. Estructura de referencia:

```json
{
  "ok": true,
  "id_proyecto": "P14223",
  "visitas_total": 3,
  "fecha_seleccionada": "2026-09-17",
  "grupos": [
    {
      "fecha_carga": "2026-09-17",
      "total_documentos": 4,
      "total_imagenes_evidencia": 12,
      "total_activos": 4,
      "total_eliminados": 0
    }
  ],
  "documentos": [],
  "sincronizacion": {}
}
```

Notas:

- `fecha_carga` es una fecha civil `YYYY-MM-DD`, no un instante UTC.
- `visitas_total` debe coincidir con el número de grupos con fecha válida.
- El backend debe aceptar una fecha seleccionada validada, por ejemplo `?fecha=2026-09-17`.
- Si no se envía fecha, el backend devuelve el grupo más reciente.
- Los campos UTC originales se conservan para auditoría y para mostrar horas.

## Criterios de aceptación

### Bitácora

1. Tres fechas distintas de carga producen tres visitas, aunque existan veinte documentos.
2. Cinco documentos cargados el mismo día producen una visita.
3. Al seleccionar una fecha no aparece ningún documento de otra fecha.
4. La fecha se agrupa conforme a `America/Mexico_City`, incluso cuando el instante UTC cae en otro día local.
5. Modificar un archivo no lo mueve a otra visita.
6. Eliminar un archivo de Drive cambia su estado histórico, pero no cambia su visita original.
7. Las imágenes del mismo día se contabilizan como evidencia y no incrementan por sí solas el número de visitas.
8. La paginación indica los registros del grupo seleccionado.
9. El botón “Actualizar” conserva el comportamiento de sincronización y vuelve a calcular contador y grupos.
10. Sin el permiso de Bitácora, ni la vista ni sus endpoints son accesibles.

### Gestores de carpeta

1. El gestor nuevo muestra una tabla plana con todos los archivos y sus rutas.
2. El gestor nuevo y la Bitácora pueden mostrarse simultáneamente cuando ambos permisos son efectivos.
3. El gestor anterior no aparece ni hace solicitudes a Drive sin su permiso legado.
4. Habilitar el permiso legado vuelve a mostrar el árbol actual sin sustituir el gestor nuevo.
5. Ocultar el gestor anterior no desconecta la cuenta de Google ni elimina relaciones de carpetas.
6. Un proyecto sin relación activa muestra `📁❌` y el texto accesible `Sin carpeta relacionada`.
7. Un proyecto con relación activa no muestra el indicador `📁❌`.

## Cambios técnicos previstos para una fase de implementación

### Frontend

- Separar los estados del gestor nuevo, gestor legado y Bitácora en `core/details.js`.
- Agregar el selector de visitas y el contador.
- Filtrar/paginar únicamente el grupo seleccionado.
- Mantener la tabla actual como base visual del gestor nuevo.
- Aplicar permisos efectivos a ambos gestores.
- Formatear instantes con el núcleo temporal del proyecto y no con una conversión local implícita.
- Mostrar el indicador `📁❌` en los proyectos sin relación activa de carpeta y retirarlo cuando la relación sea válida.

### Backend

- Construir grupos por `fecha_creacion_drive` usando el día civil de Ciudad de México.
- Devolver `visitas_total`, `grupos`, `fecha_seleccionada` y los documentos de la selección.
- Mantener `modifiedTime` solamente como último movimiento, nunca como clave de visita.
- Exponer un inventario completo para el gestor nuevo, incluyendo imágenes.
- Conservar la reconciliación de activos/eliminados y los límites actuales de recorrido.
- Validar permisos en las rutas de Bitácora y de los gestores.

### Base de datos y permisos

- No es obligatorio cambiar las columnas de documentos: ya existen creación, modificación y primera detección.
- Evaluar un índice por `id_proyecto`, `fecha_creacion_drive`, `estatus` si el volumen real lo requiere.
- Crear una migración idempotente para los dos permisos de gestor.
- No asignar los permisos nuevos automáticamente.

### Pruebas

- Agrupación por día CDMX en límites UTC.
- Conteo de visitas con fechas repetidas.
- Selección de grupo y paginación interna.
- Permanencia de grupos con documentos eliminados.
- Evidencias fotográficas que no crean visitas independientes.
- Ausencia de inicialización y llamadas de red del gestor legado sin permiso.
- Autorización backend de los tres componentes.

## Fuera de alcance de esta versión

- Sustituir o eliminar la Bitácora de Obra.
- Eliminar el gestor de carpeta anterior.
- Editar, renombrar, subir o borrar archivos de Drive.
- Inferir una fecha universal leyendo el contenido de todos los formatos.
- Reconstruir retroactivamente el momento exacto en que un archivo fue movido a la carpeta del proyecto.
- Convertir la fecha EXIF de una fotografía en la clave principal de visita.
- Usar el indicador `📁❌` para señalar errores de OAuth o fallas temporales de Drive; esos estados deben conservar mensajes distintos.

## Punto que debe confirmarse antes de programar

La propuesta fija **fecha de carga = `createdTime` de Drive**, mostrada y agrupada por día de Ciudad de México. Si el término “fecha real del documento” debe significar la fecha escrita dentro del archivo, la fecha EXIF de una fotografía o la fecha en que el archivo fue movido a la carpeta del proyecto, el diseño requiere otra fuente y debe ajustarse antes de implementar.
