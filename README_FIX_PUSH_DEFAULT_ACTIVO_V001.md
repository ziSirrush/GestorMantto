# FIX_PUSH_DEFAULT_ACTIVO_V001

Fecha: 27/08/2026  
Proyecto: Gestor Mantto  
Base de codigo revisada: `ziSirrush/GestorMantto` @ `c7b6bba7b3be8356b5277252c0bf5d9f88980cb6` (`Update Notificaciones 082726.2 - Notificaciones`)

## Objetivo

Corregir el riesgo auditado de eventos activos/configurables cuyo canal Push nace desactivado por `push_default = 0` cuando el usuario todavia no tiene una preferencia explicita.

Este FIX alinea esos eventos con la norma cerrada de Gestor Mantto: las notificaciones nacen activas y las notificaciones opcionales respetan posteriormente la preferencia personal autorizada del usuario.

## Eventos modificados

Unicamente:

1. `tareas.comentario.creado`
2. `tickets.comentario.creado`
3. `ventas.cotizacion.comentario`
4. `ventas.cotizacion.estatus`
5. `ventas.prospeccion.comentario`
6. `ventas.prospeccion.estatus`
7. `ventas.redes.comentario`
8. `ventas.redes.estatus`

Cambio:

```text
push_default: 0 -> 1
```

## Efecto funcional

Para un usuario al que el evento le aplica como `OPCIONAL`:

- sin fila en `notificacion_preferencias`: Push queda activo por defecto;
- con preferencia explicita `push = 0`: Push continua desactivado;
- con `silenciada = 1`: la preferencia sigue siendo respetada;
- con `push = 1`: no cambia su comportamiento.

Para un usuario al que el evento le aplica como `OBLIGATORIA`, la politica central ya fuerza el canal correspondiente; este FIX no redefine obligatoriedad ni roles.

## Lo que NO modifica

- `notificacion_preferencias`;
- `notificacion_evento_roles`;
- Campana;
- Correo;
- prioridad;
- alcance GENERAL/CORELLIAN/UNITED;
- emisores;
- destinatarios;
- `sup_notificaciones` historicas;
- backend JavaScript;
- frontend;
- Service Worker;
- VAPID;
- FIX 1, FIX 2 o FIX 3.

No crea tablas, columnas, indices ni relaciones.

## Seguridad del SQL

El SQL tiene preflight fail-closed. Los ocho eventos deben:

- existir;
- estar activos;
- seguir configurables;
- conservar `obligatoria = 0` en el catalogo legacy;
- conservar Campana activa por defecto.

Si esas condiciones no coinciden, `@mg_preflight_ok = 0` y el `UPDATE` no modifica filas.

El `UPDATE` usa `codigo_evento`, PK de `notificacion_eventos`, por lo que es compatible con MySQL Workbench Safe Update Mode.

## Orden de aplicacion

1. Ejecutar `backend/sql/20260827_FIX_PUSH_DEFAULT_ACTIVO_V001.sql`.
2. El primer resultado debe mostrar:
   - `eventos_esperados = 8`
   - `eventos_encontrados = 8`
   - `eventos_validos = 8`
   - `preflight_ok = 1`
3. El resultado final debe mostrar:
   - `eventos_push_default_activo = 8`
   - `validacion_final = OK`
4. Ejecutar `backend/sql/20260827_VERIFICAR_FIX_PUSH_DEFAULT_ACTIVO_V001.sql`.
5. La consulta global debe devolver:
   - `eventos_objetivo = 8`
   - `push_default_activo = 8`
   - `revisar = 0`
6. Revisar el reporte de preferencias para confirmar que las preferencias explicitas existentes permanecen intactas.

## Backend / despliegue

Este FIX no contiene archivos de backend ni frontend. El motor vigente consulta `notificacion_eventos` y `notificacion_preferencias` desde MySQL al resolver preferencias/emisiones, por lo que el cambio pertenece exclusivamente al catalogo de Aiven.

No requiere modificar Netlify.

## Reversion

Si es necesario revertir especificamente este FIX y se confirma que los ocho eventos tenian `push_default = 0` antes de aplicarlo:

```sql
UPDATE notificacion_eventos
SET push_default = 0
WHERE codigo_evento IN (
  'tareas.comentario.creado',
  'tickets.comentario.creado',
  'ventas.cotizacion.comentario',
  'ventas.cotizacion.estatus',
  'ventas.prospeccion.comentario',
  'ventas.prospeccion.estatus',
  'ventas.redes.comentario',
  'ventas.redes.estatus'
);
```

No ejecutar esa reversion si alguno de esos defaults fue cambiado deliberadamente por otra decision posterior.

## Validacion local del paquete

```powershell
node --test validation/push-default-active.test.js
```

La prueba verifica que:

- solo se escriba `notificacion_eventos.push_default`;
- no se escriban preferencias ni matrices;
- se preserve el contrato de preferencia personal;
- el SQL de verificacion sea solo lectura;
- el UPDATE use la PK para Safe Updates.

## Sistemas modificados por Aster al generar el paquete

Ninguno.

- GitHub: intacto.
- Aiven: intacto.
- Azure: intacto.
- GitHub Pages: intacto.
- Netlify: intacto.
