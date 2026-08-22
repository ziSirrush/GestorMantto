# FIX Instalaciones - Supervisores Dashboard + Documentacion V001

## Objetivo
Alinear el universo de supervisores solicitado sin acoplar los modulos.

## Dashboard Instalaciones
Archivo modificado:
- `backend/src/modules/instalaciones-dashboard/instalaciones-dashboard.repository.js`

Cambio minimo:
- conserva todos los supervisores actuales provenientes de `ins_fl.supervisor_fl`;
- agrega `EC` al selector cuando el usuario activo con iniciales `EC` tiene el rol activo `SUPERVISOR_INSTALACIONES`;
- si EC aun no tiene equipos en `ins_fl`, aparece con total 0;
- no modifica AFL / Alejandro Flores ni el filtro especial de Ajuste del Dashboard.

## Documentacion Pendiente
Archivo modificado:
- `backend/src/modules/instalaciones-documentacion/instalaciones-documentacion.repository.js`

Regla aplicada:
- el selector usa el mismo universo regular que Dashboard Instalaciones;
- incluye EC bajo la misma validacion de rol;
- excluye a Alejandro Flores (`id_SB = 38`, iniciales `ALF`; tambien se protege el alias visual `AFL`);
- los usuarios con rol `SUPERVISOR_INSTALACIONES` siguen restringidos a su propia informacion;
- los usuarios no supervisor con acceso al modulo conservan `Todos los supervisores` y el selector;
- la vista `Todos los supervisores` de Documentacion Pendiente excluye tambien los registros de Alejandro Flores.

## Independencia
No se hace `require()` entre Dashboard y Documentacion Pendiente. Cada modulo conserva controller/service/repository propios, conforme a la Constitucion del proyecto.

## No se modifica
- Frontend.
- SQL ni estructura de BD.
- Permisos.
- Calculo de documentacion.
- Paginacion 30x30.
- Reporte de Instalaciones.
- Carpetas.
- Modo Junta ni edicion del Dashboard.

## Fuentes verificadas
- Dashboard actual: `getSupervisors_cor()` se alimenta de `ins_fl.supervisor_fl` y AFL se maneja como filtro especial separado.
- Respaldo administrativo: Emmanuel Castillo = `EC`, `id_SB = 36`; Alejandro Flores = `ALF`, `id_SB = 38`.
- El cambio de rol actual de Emmanuel fue informado por el usuario como ya aplicado en Aiven; este FIX no modifica roles.

## Validaciones realizadas
- `node --check` sobre ambos archivos JavaScript.
- Diff limitado a las consultas de universo/scope de supervisores.
- No se crean dependencias entre modulos.
- No se incluyeron archivos sin cambios.

## Deploy
Requiere deploy/reinicio de backend. No requiere deploy frontend.

No se realizo prueba runtime contra Aiven desde este entorno.
