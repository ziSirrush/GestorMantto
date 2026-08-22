# FIX FASE 2 — ALCANCE COMERCIAL VENTAS CORELLIAN V001

## Objetivo
Consolidar el alcance efectivo de Ventas `_cor` usando la lógica común existente y cerrar el hueco de seguridad/visibilidad de Dashboard Ventas.

## Base revisada
- Repositorio: `ziSirrush/GestorMantto`
- Rama: `main`
- HEAD revisado: `4c25d15cde9f530b7ba34b06e9087c661d1b9140`
- `backend/src/modules/ventas/ventas-visibility.service.js` base blob: `6c1cb33bcdc522a2e94669747495b04bb7d73e13`
- `backend/src/modules/ventas-dashboard/ventas-dashboard.controller.js` base blob: `beda0069ac51f91b61495cf2365b157ef94bdc32`

## Hallazgo
Cotizaciones, Clientes, Prospección y Redes ya consumen `ventas-visibility.service.js` para limitar lecturas por alcance comercial.

Dashboard Ventas no aplicaba ese alcance en sus endpoints principales. El controlador llamaba directamente a:
- listado de responsables comerciales;
- KPIs;
- tablas comerciales;
- tablas operativas;
- PDF individual;

sin validar que el `usuario_id` solicitado perteneciera al alcance efectivo del usuario autenticado.

## Matriz aplicada
- Director General: acceso total de Ventas.
- Director Ventas: acceso total de Ventas.
- Jefa Administración Ventas: acceso total de Ventas.
- Auxiliar Dirección: acceso total de Ventas.
- Gerente: él mismo + asesores comerciales activos cuyo `usuarios.reporta_a` sea el gerente.
- Asesor Comercial: únicamente él mismo.
- Administrativo: asesores comerciales activos relacionados mediante `usuarios_rel_admin`.

Los roles oficiales fueron contrastados contra la estructura/datos compartidos del proyecto:
- 1 `Director General`
- 5 `Director Ventas`
- 7 `Auxiliar Dirección`
- 47 `Jefa Administración Ventas`
- 48 `Gerente de Cuentas Corporativas`
- 50 `Gerente Comercial Baja California y Sureste`
- 54 `Gerente Comercial Zona Norte`
- 39 `Asesor Comercial`

## Cambios

### `backend/src/modules/ventas/ventas-visibility.service.js`
- La identidad usada para resolver alcance prioriza `contextUser` sobre `user`, respetando el usuario efectivo del modo Visor.
- `reporta_a` ya no incorpora cualquier subordinado activo: únicamente incorpora usuarios que sean realmente `Asesor Comercial` activo.
- `usuarios_rel_admin` también se depura contra usuarios activos con rol `Asesor Comercial`.
- Se conserva intacta la prioridad existente de `ADMIN_REL` y la lógica actual de Acceso Total; no se alteró la regla especial de asignación de Clientes.

### `backend/src/modules/ventas-dashboard/ventas-dashboard.controller.js`
- El selector `/dashboard/usuarios` se filtra por el alcance efectivo.
- `/dashboard/kpis`, `/dashboard/tablas` y `/dashboard/operacion` rechazan un `usuario_id` fuera del alcance.
- PDF `individual` aplica exactamente la misma validación antes de preparar o consultar datos.
- PDF `general` conserva la validación existente de rol + permiso; esta fase no amplía permisos.
- La respuesta del selector agrega `visibilidad` para que frontend pueda conocer el alcance ya calculado por backend.

## No modificado
- Frontend.
- SQL / estructura Aiven.
- Instalaciones.
- United `_uni`.
- `ventas-dashboard.service.js` y `ventas-dashboard.repository.js`.
- Permisos visuales del Panel de Control.

## Validaciones realizadas
1. `node --check backend/src/modules/ventas/ventas-visibility.service.js` — PASS.
2. `node --check backend/src/modules/ventas-dashboard/ventas-dashboard.controller.js` — PASS.
3. Prueba mock de matriz de alcance — PASS:
   - ALL;
   - gerente + asesores;
   - asesor propio;
   - administrativo por `usuarios_rel_admin`;
   - identidad efectiva de Visor.
4. Prueba mock de Dashboard — PASS:
   - gerente recibe solo selector autorizado;
   - administrativo recibe solo asesores relacionados;
   - asesor no puede consultar KPIs de otro asesor;
   - asesor sí puede consultar sus propios KPIs;
   - PDF individual respeta el mismo alcance.
5. Se validó compatibilidad con las rutas actuales de `ventas-dashboard.routes.js`; no requiere cambio de rutas.

## Nota de integración
Este FIX no comparte archivos con la Fase 1 de Editar Cotización, por lo que puede aplicarse después de Fase 1 sin sobreescribir sus cambios.

## Siguiente fase
FASE 3 — Reparar filtro Asesor en Cotizaciones para que consuma `ids_asesores_visibles` sin ocultar el filtro a gerentes/administrativos autorizados.
