# ADR - UNITED: Puertas por Alcance y Cuartos por usuario_zop

Fecha: 20/08/2026  
Estado: Aprobado para implementación incremental  
Proyecto: Mantto Gestor

## Contexto

El motor `alcance_uni` ya separaba UNITED de CORELLIAN y resolvía Zonas Operativas mediante `usuario_zop` + `z_op`. Sin embargo, la semántica anterior de la llave maestra UNITED permitía omitir completamente el filtro zonal.

Además, la Fase 6 del Panel de Alcance conservaba capacidad de escribir `usuario_zop`, mezclando dos responsabilidades administrativas:

- Alcance de Información: puertas/agrupaciones.
- Usuarios: Zonas Operativas asignadas al usuario.

La regla funcional validada queda expresada con la metáfora oficial:

- **Puertas**: agrupaciones UNITED administradas desde Panel de Control > Alcance.
- **Cuartos**: Zonas Operativas administradas desde Panel de Control > Usuarios.

## Decisión

### 1. Puertas

`usuarios_alcance_informacion` conserva:

- `DOMINIO_COMPLETO` para la llave maestra de puertas UNITED;
- `AGRUPACION` para puertas específicas UNITED.

La llave maestra UNITED abre todas las puertas del dominio, pero no concede acceso territorial ilimitado.

### 2. Cuartos

`usuario_zop` es la única relación efectiva usuario <-> Zona Operativa para filtrar registros UNITED.

`z_op` es el catálogo referencial de Zonas Operativas válidas.

Los checks de Zonas Op del tab Usuarios son la autoridad administrativa para crear/reemplazar las relaciones de `usuario_zop`.

### 3. Llave maestra UNITED

La llave maestra:

- sí abre puertas UNITED;
- no elimina la consulta de `usuario_zop`;
- no convierte un alcance territorial en acceso completo a todos los registros UNITED;
- si el usuario no tiene cuartos activos, el filtro de registros falla cerrado.

### 4. Panel de Alcance

Panel de Control > Alcance deja de modificar `usuario_zop`.

Puede leer las zonas del usuario únicamente como información contextual, pero guardar Alcance no puede agregar, quitar ni reemplazar cuartos UNITED.

### 5. Información cruzada

Para bloques UNITED, una llave maestra no salta `recordScopeCheck`. El bloque debe validar también el contexto territorial del registro.

CORELLIAN conserva por ahora la semántica existente de su llave maestra.

### 6. Acceso completo al dominio

En el Guard General se separan dos conceptos:

- `llave_maestra = true`: la llave de puertas está activa;
- `acceso_dominio_completo = true`: la consulta puede operar sin filtro de registros.

Para UNITED con `requiere_filtro_zona = true`, una llave maestra no produce `acceso_dominio_completo = true`.

## Regla final

```text
SESIÓN
  +
PERMISO FUNCIONAL
  +
PUERTA UNITED
  +
CUARTOS usuario_zop
  =
REGISTROS UNITED VISIBLES
```

## Consecuencias

- No se crean tablas ni columnas.
- No se modifica la captura de Zonas Op del tab Usuarios.
- No se modifican todavía consultas específicas de Portafolio/Tickets/módulos; eso corresponde a fases posteriores.
- El motor y los bridges centrales quedan preparados para impedir que una llave maestra UNITED elimine el filtro territorial.

## Sustituye parcialmente

Este ADR sustituye únicamente la semántica de **Llaves maestras UNITED** documentada en `ADR_ALCANCE_UNI_V001.md` y `README_FASE_3_ALCANCE_UNI_V001.md` donde se indicaba que `masterAccess` omitía `usuario_zop` y devolvía `1 = 1`.
