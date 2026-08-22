# FIX PERMISOS + ALCANCE GLOBAL + FALLBACK V001

Fecha: 19/08/2026
Base verificada: `ziSirrush/GestorMantto` / `main` / commit `b9a0cc4da9eb03eb2f845315eac538eb39567059`.

## Objetivo

Separar de forma estricta las dos capas de seguridad de información:

1. **Permisos efectivos por usuario**: definen qué módulo, elemento o acción puede usar una persona.
2. **Alcance de información**: define de qué usuarios/dominios puede consultar datos dentro de lo ya permitido.

El alcance **no concede permisos funcionales**. Tener Corellian/United completo no habilita módulos ni acciones.

## Dos observaciones incluidas

### 1. Scroll de usuarios en Panel de Control

La pestaña **Alcance de información** conserva la posición vertical de la lista lateral cuando se selecciona otro usuario o se trabaja en modo masivo. Cambiar de usuario ya no debe regresar la lista al inicio.

### 2. Activación masiva

Se agrega **Activación masiva** para varios usuarios desde la misma lista. La operación es aditiva:

- puede activar `CORELLIAN` completo;
- puede activar `UNITED` completo;
- puede activar `REPORTA_A`;
- puede activar `REL_ADMIN`;
- no elimina configuraciones existentes;
- no modifica Usuarios adicionales;
- máximo 200 usuarios por operación.

La información propia es una regla implícita: todo usuario ve siempre su propia información. El check se muestra bloqueado y no requiere una fila `USUARIO -> mismo usuario` en la tabla de alcance.

## Retiro de filtros de visibilidad anteriores

El camino moderno elimina como fuente de visibilidad:

- listas hardcodeadas de roles de Ventas;
- `ADMIN_REL` como decisión especial de visibilidad;
- `accessTotal/acceso_total` como autorización de acciones;
- visibilidad por `created_by` en Clientes, Cotizaciones y Asignación a Redes;
- la posibilidad de que un alcance restringido vacío termine sin filtro.

Los dropdowns de Asesor/Admin/Supervisor que permanezcan en las pantallas son **filtros de consulta sobre un catálogo ya limitado por backend**, no mecanismos de seguridad.

## Resolución de alcance

Para el usuario efectivo (incluido modo Visor):

`PROPIO ∪ REPORTA_A ∪ REL_ADMIN ∪ USUARIOS_ADICIONALES`

Si existe `DOMINIO_COMPLETO` para el dominio del módulo, no se aplica restricción por usuario dentro de ese dominio. Siempre se siguen verificando permisos funcionales.

Se aplicó alcance a los caminos activos revisados de:

- Ventas: Clientes, Contactos vía Cliente, Cotizaciones, Historial de Cotizaciones, Dashboard, Vendidos, Proyección, Perdidos, Prospección y Asignación a Redes.
- Instalaciones/Corellian: lecturas `ins_fl`, Dashboard de Instalaciones y Documentación Pendiente.

Para fuentes de Instalaciones se consideran `id_asesor`, `id_sup` e `id_admin`; para Cotizaciones se consideran `id_asesor` e `id_admin`.

## Fail closed

Cuando el alcance moderno es restringido y no contiene usuarios visibles, las consultas protegidas devuelven cero registros (`1 = 0`) en lugar de abrir la consulta completa.

Un alcance vacío **no activa fallback automático**: se considera una configuración válida, no una falla técnica.

## Fallback preparado

### Operación normal

No es obligatorio definir variables: el valor por defecto es moderno.

Recomendado explícitamente en producción:

```text
INFORMATION_SCOPE_MODE=ENFORCED
INFORMATION_SCOPE_FALLBACK_ON_ERROR=false
```

### Fallback manual de emergencia

Si el nuevo resolver causa una incidencia y se necesita regresar temporalmente al comportamiento previo de visibilidad:

```text
INFORMATION_SCOPE_MODE=LEGACY
```

Reiniciar el backend después de cambiar la variable.

El archivo `backend/src/modules/ventas/ventas-visibility.legacy.service.js` es una copia exacta del resolver de Ventas que estaba publicado antes de este FIX.

### Fallback automático solo ante falla técnica

Opcional:

```text
INFORMATION_SCOPE_MODE=ENFORCED
INFORMATION_SCOPE_FALLBACK_ON_ERROR=true
```

Con esa bandera, el resolver usa la lógica LEGACY únicamente si el alcance moderno lanza un error técnico. No hace fallback ante errores 4xx ni ante un alcance válido pero vacío, para evitar ampliar datos por una configuración restrictiva.

### Recuperación al modo normal

```text
INFORMATION_SCOPE_MODE=ENFORCED
INFORMATION_SCOPE_FALLBACK_ON_ERROR=false
```

Reiniciar el backend.

## Importante sobre el fallback

El fallback restaura **visibilidad anterior**, no restaura `accessTotal` como permiso de edición. Las acciones que ya tienen permisos formales continúan gobernadas por permisos efectivos del usuario.

## No incluido / límites verificados

Este FIX no crea tablas ni columnas y no incluye SQL.

No se inventaron nuevos códigos de permiso para rutas que hoy no tienen una acción formal específica en el catálogo. Por esa razón, controles administrativos/sistema que ya eran deliberadamente por rol (por ejemplo administración general del Panel de Control, reconciliación técnica y algunos gestores de archivos/fotos) no se transformaron en este paquete. Este FIX no amplía esos privilegios.

Por lo tanto, **no se afirma que toda autorización administrativa histórica del repositorio haya sido convertida a permisos efectivos**. Lo que sí queda migrado es la capa de **visibilidad de información** revisada en los módulos indicados y las acciones de Asignación a Redes que ya cuentan con permisos formales verificables.

## Archivos incluidos

### Backend

- `backend/src/services/information-scope-gnral.service.js`
- `backend/src/controllers/panel-control-alcance.controller.js`
- `backend/src/routes/panel-control.routes.js`
- `backend/src/modules/ventas/ventas-visibility.service.js`
- `backend/src/modules/ventas/ventas-visibility.legacy.service.js`
- `backend/src/controllers/ins-fl-read-cor.controller.js`
- `backend/src/modules/instalaciones-dashboard/instalaciones-dashboard.controller.js`
- `backend/src/modules/instalaciones-dashboard/instalaciones-dashboard.routes.js`
- `backend/src/modules/instalaciones-documentacion/instalaciones-documentacion.service.js`
- `backend/src/middleware/ventas-cotizaciones-permissions.middleware.js`
- `backend/src/modules/ventas-clientes/ventas-clientes.repository.js`
- `backend/src/modules/ventas-clientes/ventas-clientes.service.js`
- `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones-editar-bootstrap.service.js`
- `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.service.js`
- `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.repository.js`
- `backend/src/modules/ventas-cotizaciones-historial/ventas-cotizaciones-historial.repository.js`
- `backend/src/modules/ventas-dashboard/ventas-dashboard.service.js`
- `backend/src/modules/ventas-redes/ventas-redes.service.js`
- `backend/src/modules/ventas-redes/ventas-redes.repository.js`
- `backend/src/modules/ventas-prospeccion/ventas-prospeccion.repository.js`

### Frontend

- `modules/panel-control/panel-control.js`
- `modules/panel-control/panel-control.css`
- `modules/ventas-asignacion-redes/ventas-asignacion-redes.js`
- `modules/ventas-asignacion-redes-formulario/ventas-asignacion-redes-formulario.js`
- `modules/ventas-asignacion-redes-detalle/ventas-asignacion-redes-detalle.js`
- `modules/ventas-clientes-nuevo/ventas-clientes-nuevo.js`
- `modules/ventas-clientes-detalle/ventas-clientes-detalle.js`
- `modules/ventas-cotizaciones/ventas-cotizaciones.js`
- `modules/ventas-vendidos/ventas-vendidos.js`
- `modules/ventas-perdidos/ventas-perdidos.js`
- `modules/ventas-proyeccion/ventas-proyeccion.js`
- `index.html` (solo cache-busting sobre la versión actual de `main` para los archivos modificados)

## Validaciones realizadas

- `node --check`: OK en todos los `.js` incluidos.
- `npm run check` del backend: OK; estructura base validada.
- `panel-control.routes.js` cargó correctamente con el contrato de variables DB presente.
- Resolver de Ventas exporta la API esperada.
- Fallback manual `LEGACY`: probado.
- Fallback automático ante error técnico: probado.
- Error 4xx no activa fallback: probado.
- Propio implícito: probado.
- Resolver LEGACY copiado: hash Git idéntico al `ventas-visibility.service.js` de `main` antes del FIX (`ebf713671641556fa1edd45dff8380462e5be8bd`).
- `index.html`: al revertir únicamente los cache-bust de este FIX, su Git blob vuelve exactamente a `ce14fbbab8f5fce10e434f549c3a5af23ef428f4`, blob actual de `main` verificado.
- Se verificó que `accessTotal/acceso_total` no se use ya como guard de acciones en los módulos migrados; queda únicamente como contrato de compatibilidad del adaptador y dentro del resolver LEGACY.
- Se verificó `fail closed` en los repositories/servicios migrados.

## Validación runtime pendiente

No se puede confirmar desde este entorno el estado desplegado de Aiven/Railway ni ejecutar pruebas contra datos reales de producción. Después de reemplazar los archivos se debe validar, en este orden:

1. backend inicia sin error;
2. `/api/health` responde OK;
3. Panel de Control carga Alcance de Información;
4. seleccionar usuarios mantiene el scroll;
5. activación masiva confirma exactamente la cantidad seleccionada;
6. un usuario con alcance restringido solo ve datos autorizados;
7. un usuario con Corellian/United completo no gana módulos ni acciones que no tenga permitidos;
8. modo Visor usa el alcance del usuario visualizado;
9. prueba controlada de `INFORMATION_SCOPE_MODE=LEGACY` y regreso a `ENFORCED`.
