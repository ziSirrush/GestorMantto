# FIX Backend Ventas V007

Corrige el error MySQL `ER_WRONG_FIELD_WITH_GROUP` del endpoint de embudo cuando el servidor usa `sql_mode=ONLY_FULL_GROUP_BY`.

## Cambio

La consulta agrupaba por `TRIM(estatus_proyecto)` pero ordenaba repitiendo la expresión original. Ahora ordena usando el alias agrupado `estatus`:

```sql
GROUP BY TRIM(estatus_proyecto)
ORDER BY FIELD(estatus, ...), estatus ASC
```

No cambia reglas de negocio, visibilidad, filtros ni estructura de datos.
