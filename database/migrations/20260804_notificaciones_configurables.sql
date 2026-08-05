START TRANSACTION;

CREATE TABLE IF NOT EXISTS notificacion_eventos (
  codigo_evento VARCHAR(120) NOT NULL,
  agrupacion VARCHAR(80) NOT NULL,
  modulo VARCHAR(100) NOT NULL,
  accion VARCHAR(80) NOT NULL,
  nombre_evento VARCHAR(180) NOT NULL,
  descripcion VARCHAR(500) DEFAULT NULL,
  prioridad_default ENUM('BAJA','MEDIA','ALTA','CRITICA') NOT NULL DEFAULT 'MEDIA',
  configurable TINYINT(1) NOT NULL DEFAULT 1,
  obligatoria TINYINT(1) NOT NULL DEFAULT 0,
  campana_default TINYINT(1) NOT NULL DEFAULT 1,
  push_default TINYINT(1) NOT NULL DEFAULT 0,
  correo_default TINYINT(1) NOT NULL DEFAULT 0,
  titulo_default VARCHAR(255) DEFAULT NULL,
  mensaje_default VARCHAR(500) DEFAULT NULL,
  icono_default VARCHAR(100) DEFAULT NULL,
  accion_destino VARCHAR(50) NOT NULL DEFAULT 'ABRIR_MODULO',
  ruta_default VARCHAR(500) DEFAULT NULL,
  orden SMALLINT UNSIGNED NOT NULL DEFAULT 100,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (codigo_evento),
  KEY idx_not_evento_agrupacion (agrupacion, modulo, activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notificacion_preferencias (
  id_preferencia BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_usuario INT UNSIGNED NOT NULL,
  codigo_evento VARCHAR(120) NOT NULL,
  campana TINYINT(1) NOT NULL DEFAULT 1,
  push TINYINT(1) NOT NULL DEFAULT 0,
  correo TINYINT(1) NOT NULL DEFAULT 0,
  silenciada TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id_preferencia),
  UNIQUE KEY uq_not_pref_usuario_evento (id_usuario, codigo_evento),
  KEY idx_not_pref_evento (codigo_evento),
  CONSTRAINT fk_not_pref_usuario FOREIGN KEY (id_usuario) REFERENCES usuarios(id_SB) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_not_pref_evento FOREIGN KEY (codigo_evento) REFERENCES notificacion_eventos(codigo_evento) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO notificacion_eventos (
  codigo_evento, agrupacion, modulo, accion, nombre_evento, descripcion,
  prioridad_default, configurable, obligatoria, campana_default, push_default,
  titulo_default, accion_destino, ruta_default, orden
) VALUES
('tickets.comentario.creado','Operacion','Tickets','COMENTARIO','Nuevo comentario en Ticket','Comentario agregado a un Ticket relacionado.','MEDIA',1,0,1,0,'Nuevo comentario en Ticket','ABRIR_TICKET','detalle/ticket',10),
('tickets.vobo.actualizado','Operacion','Tickets','VOBO','Vo.Bo. de Ticket actualizado','Validacion, rechazo o cambio de Vo.Bo.','ALTA',0,1,1,1,'Vo.Bo. de Ticket actualizado','ABRIR_TICKET','detalle/ticket',20),
('tareas.asignada','General','Tareas','ASIGNACION','Nueva tarea asignada','El usuario fue asignado como responsable o participante.','ALTA',0,1,1,1,'Nueva tarea asignada','ABRIR_TAREA','home',30),
('tareas.comentario.creado','General','Tareas','COMENTARIO','Nuevo comentario en tarea','Comentario o archivo agregado a una tarea relacionada.','MEDIA',1,0,1,0,'Nuevo comentario en tarea','ABRIR_TAREA','home',40),
('ventas.cotizacion.comentario','Ventas','Cotizaciones','COMENTARIO','Comentario en cotizacion','Comentario o archivo agregado a una cotizacion relacionada.','MEDIA',1,0,1,0,'Nuevo comentario en cotizacion','ABRIR_COTIZACION','ventas-cotizaciones',50),
('ventas.cotizacion.estatus','Ventas','Cotizaciones','ESTATUS','Estatus de cotizacion actualizado','Cambio de estatus de una cotizacion relacionada.','ALTA',1,0,1,0,'Cotizacion actualizada','ABRIR_COTIZACION','ventas-cotizaciones',60),
('ventas.prospeccion.comentario','Ventas','Prospeccion','COMENTARIO','Comentario en prospeccion','Comentario o archivo agregado a una visita relacionada.','MEDIA',1,0,1,0,'Nuevo comentario en prospeccion','ABRIR_PROSPECCION','ventas-prospeccion',70),
('ventas.prospeccion.estatus','Ventas','Prospeccion','ESTATUS','Estatus de prospeccion actualizado','Cambio de estatus de una visita relacionada.','ALTA',1,0,1,0,'Prospeccion actualizada','ABRIR_PROSPECCION','ventas-prospeccion',80),
('ventas.redes.comentario','Ventas','Asignacion a Redes','COMENTARIO','Comentario en Asignacion a Redes','Comentario o evidencia agregada a un registro relacionado.','MEDIA',1,0,1,0,'Nuevo comentario en Asignacion a Redes','ABRIR_RED','ventas-asignacion-redes',90),
('ventas.redes.estatus','Ventas','Asignacion a Redes','ESTATUS','Estatus de Asignacion a Redes actualizado','Cambio de estatus de un registro relacionado.','ALTA',1,0,1,0,'Asignacion a Redes actualizada','ABRIR_RED','ventas-asignacion-redes',100),
('soporte.solicitud.actualizada','Soporte','Solicitudes','ESTATUS','Solicitud de soporte actualizada','Cambio relevante en una solicitud de soporte.','ALTA',1,0,1,1,'Solicitud de soporte actualizada','ABRIR_SOPORTE','soporte-solicitudes',110)
ON DUPLICATE KEY UPDATE
  nombre_evento = VALUES(nombre_evento),
  descripcion = VALUES(descripcion),
  prioridad_default = VALUES(prioridad_default),
  configurable = VALUES(configurable),
  obligatoria = VALUES(obligatoria),
  campana_default = VALUES(campana_default),
  push_default = VALUES(push_default),
  titulo_default = VALUES(titulo_default),
  accion_destino = VALUES(accion_destino),
  ruta_default = VALUES(ruta_default),
  orden = VALUES(orden),
  activo = 1,
  updated_at = NOW();

COMMIT;
