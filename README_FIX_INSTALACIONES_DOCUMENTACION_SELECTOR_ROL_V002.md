# FIX Instalaciones > Documentación Pendiente — Selector por rol V002

## Causa corregida
El repository ya contenía la lógica nueva de alcance por rol, pero el service desplegado seguía usando el permiso obsoleto `INSTALACIONES_DOCUMENTACION_FILTROS_SUPERVISOR.FILTRAR` para decidir si una persona podía cambiar supervisor. Cuando ese permiso era falso, cualquier usuario era tratado como el supervisor actual.

## Regla final
- Usuario con rol efectivo `SUPERVISOR_INSTALACIONES`: ve únicamente sus propios registros y no recibe selector.
- Usuario que NO tiene rol `SUPERVISOR_INSTALACIONES`, pero tiene acceso al módulo: entra por defecto en `Todos los supervisores` y recibe selector.
- El selector usa las opciones devueltas por el repository actual del módulo, que ya replica el universo regular del Dashboard, agrega EC cuando corresponde y excluye AFL/Ale Flores.
- El parámetro `id_supervisor` permite seleccionar un supervisor concreto para usuarios no supervisores.
- Un supervisor que intente consultar otro `id_supervisor` recibe 403.

## Archivos modificados
- `backend/src/modules/instalaciones-documentacion/instalaciones-documentacion.service.js`
- `modules/instalaciones-documentacion/instalaciones-documentacion_cor.js`

## No se modifica
- Dashboard Instalaciones.
- Repository de Documentación Pendiente (ya contiene el FIX de EC/AFL).
- SQL / permisos.
- Router, index.html, estilos ni otros módulos.

## Validaciones
- `node --check` ejecutado sobre ambos JS.
- El service ya no contiene `supervisor_cambiar` ni depende del permiso obsoleto del selector.
- El frontend soporta explícitamente la opción `Todos los supervisores` mediante `selected.all`.
- Paginación permanece en 30 registros.

## Deploy
1. Sustituir los dos archivos manteniendo sus rutas.
2. Reiniciar/desplegar backend por el cambio del service.
3. Desplegar frontend por el cambio del JS.
4. Probar un usuario no supervisor: debe iniciar en `Todos los supervisores` con selector visible.
5. Probar un usuario `SUPERVISOR_INSTALACIONES`: debe ver exclusivamente lo suyo y sin selector.

No requiere ejecutar SQL.
