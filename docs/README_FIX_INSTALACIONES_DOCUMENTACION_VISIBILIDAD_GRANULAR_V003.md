# FIX Instalaciones - Documentacion Pendiente - Visibilidad granular V003

## Sintoma corregido

El modulo cargaba el selector de supervisor, pero ocultaba KPIs, graficas, filtros y tabla para usuarios que ya tenian acceso visual al modulo cuando los permisos granulares nuevos aun no estaban relacionados expresamente en `rol_permisos` o `usuario_permisos`.

## Causa

`getEffectivePermissionsBulk_cor()` convertia dos situaciones diferentes en el mismo `false`:

1. permiso expresamente denegado;
2. permiso nuevo todavia no configurado para el usuario/rol.

El frontend interpreta esos `false` literalmente y oculta Resumen/Listado.

## Regla aplicada

Resolucion de cada permiso del modulo:

1. Excepcion individual activa en `usuario_permisos` -> gana su `permitido`.
2. Si alguno de los roles activos tiene el permiso configurado en `rol_permisos` -> se respeta la herencia efectiva.
3. Si el permiso granular aun NO esta configurado por rol ni usuario -> hereda temporalmente el resultado de `INSTALACIONES_DOCUMENTACION_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`.
4. En cuanto Panel de Control configure expresamente el permiso con 0 o 1, el fallback deja de aplicar.

Esto conserva la transicion segura usada por el Gestor y no elimina la granularidad futura.

## Alcance de supervisor conservado

- `SUPERVISOR_INSTALACIONES`: solo sus registros, sin selector.
- Usuario no Supervisor de Instalaciones con acceso al modulo: Todos los supervisores por defecto y selector disponible.
- Universo de Documentacion: mismo universo regular de Dashboard + EC, excluyendo AFL/Ale Flores.

## Archivos modificados

- `backend/src/modules/instalaciones-documentacion/instalaciones-documentacion.repository.js`
- `backend/src/modules/instalaciones-documentacion/instalaciones-documentacion.service.js`

## No modifica

- Dashboard Instalaciones.
- Frontend de Documentacion Pendiente.
- SQL / catalogo de permisos.
- Reporte, Ajuste, Carpetas u otros modulos.

## Aplicacion

1. Sustituir los dos archivos backend respetando las rutas.
2. Reiniciar/deployar backend.
3. Recargar completamente la aplicacion para limpiar la seleccion AG que pudiera quedar viva en la sesion SPA.
4. Validar con usuario no supervisor: debe iniciar en `Todos los supervisores` y mostrar KPIs, graficas, filtros y tabla.
5. Validar con `SUPERVISOR_INSTALACIONES`: debe ver solo su informacion y sin selector.

No requiere SQL.
