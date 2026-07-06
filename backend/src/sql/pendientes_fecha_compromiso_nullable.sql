-- Mantto Gestor - Home tareas v0.2
-- Requerido para que Fecha compromiso deje de ser obligatoria.
-- La tabla actual pendientes tiene due_date NOT NULL, por lo que la API ya permite null
-- pero Aiven debe aceptar NULL antes de crear tareas sin fecha.
ALTER TABLE pendientes
  MODIFY due_date DATE NULL;
