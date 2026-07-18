# Tablas relacionadas con el nuevo HOME

## Ya existentes y aprovechables

### pendientes
Base de tareas personales y colaborativas.

Campos clave:
- id_pendiente
- pendiente
- tipo_pendiente: PERSONAL / COLABORATIVA
- estatus
- area
- descripcion
- creado_por_email
- creado_por_iniciales
- due_date
- proyecto
- equipo
- con_subtareas
- prioridad

### pendientes_usuarios
Relaciona tareas con usuarios.

Campos clave:
- id_pendiente
- iniciales_usuario
- tipo_relacion: SEGUIMIENTO / RESPONSABLE

### pendientes_subtareas
Subtareas por pendiente.

### pendientes_comentarios
Comentarios por pendiente.

### pendientes_comentarios_adjuntos
Archivos ligados a comentarios.

### sup_notificaciones
Puede usarse para historial de notificaciones del Home.

Campos clave:
- id_usuario
- tipo_notificacion
- titulo_notificacion
- mensaje_notificacion
- accion_notificacion
- id_referencia
- ruta_destino
- leido
- fecha_creacion

### auth_audit
Sirve para auditoria de login/auth, pero NO alcanza para ultimas interacciones funcionales del sistema.

## Tabla recomendada a futuro

Para el bloque "Ultimas 5 interacciones", recomiendo crear una tabla dedicada:

```sql
CREATE TABLE user_activity_log (
  id_activity BIGINT NOT NULL AUTO_INCREMENT,
  usuario_id BIGINT NOT NULL,
  action_type VARCHAR(80) NOT NULL,
  module_key VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) DEFAULT NULL,
  entity_id VARCHAR(120) DEFAULT NULL,
  entity_label VARCHAR(255) DEFAULT NULL,
  route_target VARCHAR(500) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_activity),
  KEY idx_activity_usuario (usuario_id),
  KEY idx_activity_created (created_at),
  KEY idx_activity_module (module_key),
  CONSTRAINT fk_activity_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id_SB)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);
```
