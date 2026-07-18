# ADR-004 Separación Controller-Service-Repository

Estado: Aprobado

## Decisión
Las responsabilidades quedan separadas:

- Routes: registro de rutas y middleware.
- Controller: HTTP.
- Service: reglas de negocio.
- Repository: acceso a datos.

No se permite SQL fuera del Repository.
