# Fase 2 · Visor de usuarios · Identidad efectiva V001

## Base acumulativa

1. `ult ver 2235hrs - 0804.zip`
2. `FASE_1_VISOR_USUARIOS_NUEVA_PESTANA_V001.zip`

## Hallazgo

La Fase 1 generaba correctamente un token temporal y abría una pestaña independiente, pero el middleware conservaba `req.user` como la sesión real. Varios controladores y servicios históricos todavía utilizan directamente `req.user` para resolver roles, filtros, alcances y datos. Por ese motivo, la interfaz podía mezclar a Joseph con el usuario visualizado: mostraba controles de Programador, filtros de acceso total y consultas con un alcance distinto al usuario seleccionado.

## Cambios

### Backend

- Se conserva la sesión real en `req.actorUser`.
- Se conserva el usuario visualizado en `req.contextUser`.
- En solicitudes de lectura (`GET`, `HEAD` y `OPTIONS`) realizadas desde el visor, `req.user` pasa a representar al usuario visualizado.
- `/api/auth/me` y las rutas de permisos del dispositivo conservan la identidad real para no alterar la sesión ni la autorización del equipo desde el que se abre el visor.
- Se agregó `GET /api/panel-control/viewer-bootstrap` para hidratar desde Aiven la identidad efectiva actual del usuario visualizado.
- La identidad efectiva incorpora puesto, área, jefe, roles activos, detalle de roles, zonas y parámetros de Equipos Críticos.
- Un token de visor vencido o inválido devuelve `403` sin cerrar ni borrar la sesión real.
- Las rutas con autenticación opcional también respetan el contexto efectivo cuando reciben un token de visor válido.

### Frontend

- La pestaña del visor valida primero la sesión real y después obtiene la identidad efectiva actual mediante `viewer-bootstrap`.
- El usuario real permanece en `localStorage`; el usuario visualizado permanece únicamente en `sessionStorage` de la pestaña del visor.
- Los controles exclusivos de Programador se calculan usando al usuario visualizado, no a la sesión real.
- El botón manual `Actualizar`, `Recargar`, `Refrescar` o `Sincronizar` se oculta cuando el usuario visualizado no tiene rol Programador.
- Los indicadores técnicos de Aiven/API se ocultan cuando el usuario visualizado no es Programador.
- Textos visibles de carga que mencionaban Aiven se presentan de forma genérica para usuarios no Programador.
- Se activó `core/data-sync.js` en `index.html`, ya que el archivo existía pero no estaba siendo cargado por la página.

## Resultado esperado

Al abrir a Ignacio Neri en el visor:

- el Panel Lateral usa sus permisos efectivos;
- Ventas aplica su alcance comercial real;
- los filtros Asesor y Administrativo solo aparecen si Ignacio tiene acceso total;
- los listados consultan los registros que corresponden a Ignacio;
- no aparecen el botón Actualizar, el indicador API ni estados de Aiven si Ignacio no es Programador;
- Joseph permanece como sesión real exclusivamente para el permiso del visor y futura auditoría.

## Alcance pendiente

Esta fase no bloquea todavía las operaciones de escritura. El rechazo global de `POST`, `PUT`, `PATCH` y `DELETE`, además de la desactivación de Guardar, Crear, Editar, Eliminar, Comentar, Adjuntar, Validar y Cambiar estatus, corresponde a la Fase 3.

## Archivos modificados

- `index.html`
- `core/auth.js`
- `core/data-sync.js`
- `backend/src/middleware/auth.middleware.js`
- `backend/src/controllers/panel-control.controller.js`
- `backend/src/routes/panel-control.routes.js`

## Base de datos

Esta fase no requiere ejecutar SQL adicional. Utiliza el permiso y las estructuras creadas en la Fase 1.

## Validaciones realizadas

- `node --check` en todos los JavaScript modificados.
- `npm run check` del backend completado correctamente.
- Correspondencia verificada entre ruta y controlador de `viewer-bootstrap`.
- `/api/health` confirmado en la estructura del backend, sin modificaciones.
- Confirmado que los únicos archivos de aplicación modificados respecto de la base acumulativa son los seis indicados arriba.

No se realizaron pruebas contra Aiven ni una prueba multiusuario real desde este entorno.
