# Mantto Gestor - Entorno `pruebas`

Este entorno es independiente del Proyecto Final. Su objetivo es validar la nueva pantalla HOME definitiva antes de integrar modulo por modulo.

## Objetivo

- Mantener el Proyecto Final intacto.
- Usar este HOME como centro de operaciones permanente.
- Integrar posteriormente cada modulo usando la tabla comparativa.
- Conservar una estructura modular clara.

## Regla de diseno del HOME

Todo elemento visible debe ser accionable:

- Tarea -> abre detalle de tarea.
- Proyecto -> abre modulo Proyectos con el proyecto filtrado.
- Equipo -> abre Portafolio / detalle de equipo.
- Usuario -> abre Usuarios / perfil.
- Notificacion -> abre el origen.
- Actividad reciente -> reabre el registro exacto.
- Contador -> abre listado filtrado.

## Estado actual

Este paso es maqueta funcional de frontend con datos mock alineados a las tablas existentes:

- pendientes
- pendientes_usuarios
- pendientes_subtareas
- pendientes_comentarios
- pendientes_comentarios_adjuntos
- sup_notificaciones
- auth_audit

No conecta aun con Railway/Aiven. La conexion real se hara cuando validemos la UI.
