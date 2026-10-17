# FIX INT-9 · Permisos nativos del Panel de Control · V001

Fecha: 2026-10-17. Repositorio de referencia: `ziSirrush/GestorMantto`, `main` commit `2175424183baff635597cf53a9849e896931777c` (Version 101726.1). **No hay despliegue ni cambios de datos en esta entrega.**

## Incidencia comprobada

El frontend de Programación de Personal mostró «No tienes permiso de lectura...» incluso cuando el permiso podía estar concedido. `ManttoPermissions.can(codigo,{defaultValue:false})` comprueba `configurado`, pero `/api/panel-control/session-permissions` devuelve para cada acción el campo `efectivo` sin `configurado`. Consecuencia: el frontend consideraba falso **siempre**, independientemente del resultado real del Panel. Ese comportamiento fue introducido por INT-9; es un error de adaptación del frontend, no prueba de fallo del SQL.

## Corrección

- `modules/instalaciones-programacion-personal/instalaciones-programacion-personal.js`: utiliza `ManttoPermissions.state(codigo)` y exige `exists === true` y `efectivo === true` para `.VER`, `.CREAR`, `.EDITAR` y `.DESACTIVAR`. Mantiene el Visor en modo solo lectura y deniega acceso si no hay datos de permisos. Si el catálogo no llegó todavía al iniciar la ruta, consulta una vez la función nativa `ManttoPermissions.reload()`; un error mantiene denegación.
- `core/module-loader.js`: actualiza únicamente la versión del JS de INT-9 para invalidar caché.
- `index.html`: actualiza la versión de carga del module-loader para invalidar caché del navegador/PWA.
- Se conservan todos los demás módulos, rutas, estilos y control de acceso del backend.

## Permisos que deben existir y estar concedidos en el Panel

Módulo: `INSTALACIONES_PROGRAMACION_PERSONAL` dentro de Instalaciones. Sub-elemento: `INSTALACIONES_PROGRAMACION_PERSONAL_CALENDARIO_PROGRAMACION`.

- `.VER`: acceso de lectura al módulo y APIs (obligatorio).
- `.CREAR`: alta de personal y asignaciones.
- `.EDITAR`: edición de personal y asignaciones.
- `.DESACTIVAR`: baja lógica de personal y asignaciones.

El SQL de la Fase 1 **registra el catálogo, no concede permisos a ningún rol ni usuario**; el de Fase 2 **solo crea la tabla de asignaciones**. Ambos se consideran **ya aplicados según el usuario**. Si el Panel marca `efectivo=false` para `.VER`, asignar permiso en el Panel de Control al rol/usuario autorizado; el frontend **no** lo concede por sí solo. Deben seguir cumpliéndose puerta de información y alcance CORELLIAN.

## Aplicación

Extraer el ZIP sobre la raíz del repo, preservando la estructura. Son archivos completos; **no incluye patches, instaladores ni scripts de aplicación**. El ZIP no ejecuta ninguna acción. Validar en el Panel que la identidad efectiva (o Visor) tiene `VER`. Recargar la app y comprobar módulo/acciones con usuario permitido, denegado y Visor. El endpoint backend continúa siendo autoridad de permisos y alcance.

**SQL adicional requerido: NO.** No repetir scripts de creación de tablas. No se realizó prueba E2E contra Aiven/Azure; este FIX verifica por contrato estático el comportamiento de los permisos y valida sintaxis JS.
