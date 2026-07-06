# ARCHIVOS MODIFICADOS - HOME TAREAS V0.2

Base: `pruebas_home_tareas_v0_1.zip`

## Objetivo
Aplicar ajustes puntuales al flujo de tareas personales y colaborativas dentro de Home, respetando la tabla `pendientes` y las tablas relacionadas.

## Cambios

### Frontend
- `pruebas/modules/home/home.js`
  - Fecha compromiso deja de ser obligatoria.
  - Área ahora se carga como lista desde catálogo real de `usuarios.area`.
  - Se agrega selector Empresa / razón social.
  - Proyectos se filtran por empresa seleccionada usando el campo disponible `portafolio.proyecto_cc_x_port`.
  - Equipos se filtran por proyecto seleccionado.
  - Seguimiento / Responsables queda como multiselección filtrada por empresa.
  - Evidencia inicial permite máximo 1 imagen o 1 archivo.
  - Se elimina captura manual de URLs para evidencia.
  - En detalle se muestra evidencia directa de la tarea.
  - Comentarios permiten adjuntar 1 archivo relacionado a `pendientes_comentarios_adjuntos`.

### Backend
- `backend/server.js`
  - Publica `/uploads` para archivos guardados localmente por la API.
  - Aumenta límite JSON a 12 MB para carga base64 controlada.

- `backend/src/controllers/data.controller.js`
  - Catálogos de tareas devuelven áreas, empresas, usuarios, proyectos y equipos.
  - Creación/edición de pendientes acepta `due_date` nulo.
  - Evidencia directa se guarda en `photo_url` o `adjunto_url` después de subir archivo.
  - Comentarios guardan máximo 1 adjunto en `pendientes_comentarios_adjuntos`.

### SQL requerido
- `backend/src/sql/pendientes_fecha_compromiso_nullable.sql`
  - Convierte `pendientes.due_date` a `DATE NULL`.

## Nota técnica
La tabla `pendientes` actual en Aiven tiene `due_date NOT NULL`. Para que la fecha compromiso sea realmente opcional, se debe ejecutar el SQL incluido antes de crear tareas sin fecha.

## Módulos congelados
No se modificaron módulos congelados: Resumen del Día, Equipos Críticos, Portafolio ni Proyectos.
