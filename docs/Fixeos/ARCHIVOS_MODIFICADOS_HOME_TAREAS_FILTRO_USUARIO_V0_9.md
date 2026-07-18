# Home/Tareas - Filtro por usuario V0.9

Fecha: 2026-07-07

## Cambio aplicado

Se ajustó el backend para que Home/Tareas no reciba tareas ajenas al usuario autenticado.

## Regla de visibilidad

### Tareas personales
Solo se muestran tareas donde:

```sql
pendientes.creado_por_email = usuario_actual.correo
```

### Tareas colaborativas
Se muestran tareas donde el usuario autenticado:

1. Es creador de la tarea:

```sql
pendientes.creado_por_email = usuario_actual.correo
```

2. O está asignado como responsable:

```sql
pendientes_usuarios.tipo_relacion = 'RESPONSABLE'
AND pendientes_usuarios.iniciales_usuario = usuario_actual.iniciales
```

## Archivo modificado

- `backend/src/controllers/data.controller.js`

## Endpoints ajustados

- `GET /api/home/bootstrap`
- `GET /api/pendientes`
- `GET /api/pendientes/:id`

## Validación técnica

Se validó sintaxis con:

```bash
node --check backend/src/controllers/data.controller.js
```
