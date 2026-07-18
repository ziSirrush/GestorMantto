# 05_REGLAS_DEPENDENCIAS

## Flujo permitido

Route
→ Controller
→ Service
→ Repository
→ MySQL

## No permitido

- Route → SQL
- Controller → Controller
- Repository → HTTP Response
- Frontend dependiendo de consultas SQL

Los componentes compartidos deberán ubicarse en `shared/`.
