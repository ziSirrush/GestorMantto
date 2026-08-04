# FIX Backend Ventas - Visibilidad V005

## Alcance implementado

La autenticación permanece obligatoria. Los permisos del Panel de Control siguen temporalmente desactivados para este módulo.

La visibilidad se calcula en el backend y se aplica al listado, KPIs, embudo, vendidos, perdidos, proyección, detalle, comentarios, archivos y operaciones sobre una cotización.

### Acceso total
- Rol 1: Director General
- Rol 5: Director Ventas
- Rol 7: Auxiliar Direccion
- Rol 47: Jefa Administracion Ventas

### Propio y asesores directos
- Rol 48: Gerente de Cuentas Corporativas
- Rol 50: Gerente Comercial Baja California y Sureste
- Rol 54: Gerente Comercial Zona Norte

El equipo directo se obtiene con `usuarios.reporta_a = id_SB del gerente`.

### Solo propio
- Rol 39: Asesor Comercial
- Rol 55: Ingenieria de Ventas

### Regla segura temporal
Cualquier rol autenticado no definido arriba ve únicamente las cotizaciones donde `id_asesor` coincide con su `id_SB`.

## Pendiente de datos
Para que los gerentes vean a sus asesores, debe poblarse correctamente `usuarios.reporta_a`. Si está NULL, el gerente solo verá sus propias cotizaciones.

Queda pendiente definir el alcance de los auxiliares administrativos de Ventas y migrar esta visibilidad al Panel de Control cuando se habiliten formalmente sus permisos.
