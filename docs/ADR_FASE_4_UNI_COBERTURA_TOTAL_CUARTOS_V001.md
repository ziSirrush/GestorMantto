# ADR — FASE 4 · Cobertura territorial UNITED por Cuartos

## Estado

Aprobado para la Fase 4.

## Contexto

UNITED ya dispone de dos conceptos separados:

1. **Puertas**: agrupaciones habilitadas desde Panel de Control > Alcance.
2. **Cuartos**: Zonas Operativas asignadas al usuario desde Panel de Control > Usuarios.

Las asignaciones territoriales existentes se almacenan en `usuario_zop`, referenciando el catálogo `z_op`.

El Guard podía resolver correctamente la Puerta y los cuartos, pero varios servicios consultaban sus tablas sin incorporar el alcance territorial resultante. Esto permitía que una pantalla autorizada mostrara registros de Zonas Operativas no asignadas al usuario.

## Decisión

Se mantienen los cuartos en **Usuarios > Zonas Op**. No se trasladan a Alcance y no se crea una tabla nueva.

La autoridad territorial de UNITED queda así:

```text
usuario_zop.usuario_id
        ↓
usuario_zop.zona_id
        ↓
z_op.id_zona / z_op.zona
        ↓
consulta del módulo
```

Las Puertas permanecen independientes:

```text
Permiso funcional
        +
Puerta en Alcance
        +
Cuartos en usuario_zop
        =
Registros visibles
```

Para tablas con FK territorial se usa `zona_id`. Para tablas existentes de Cobranza que solo almacenan código textual se usa igualdad normalizada exacta contra `z_op.zona`; no se usa `LIKE` para ampliar alcance.

## Consecuencias

- Una sola asignación de cuartos rige todas las Puertas UNITED del usuario.
- Cambiar una Puerta no modifica `usuario_zop`.
- Cambiar los cuartos no modifica las Puertas.
- La llave maestra UNITED no omite los cuartos.
- KPIs, gráficas, catálogos y tablas deben partir del mismo universo autorizado.
- El frontend no es la barrera de seguridad; la reducción se realiza en backend.
- Sin cuartos válidos, el motor cierra por defecto.
- Las integraciones M2M continúan separadas del alcance humano.

## No incluido

Esta fase no crea ni migra tablas, no cambia el contenido de Aiven y no redefine permisos funcionales existentes. Las reglas de autorización funcional de bloques cruzados continúan siendo responsabilidad de la capa de permisos/información cruzada ya existente.
