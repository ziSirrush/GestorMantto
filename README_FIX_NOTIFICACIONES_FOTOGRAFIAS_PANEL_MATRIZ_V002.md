# Mantto Gestor | FIX Notificaciones de fotografias: destinatarios desde Panel V002

**Fecha:** 14/10/2026.  
**Repositorio:** `ziSirrush/GestorMantto` — `main`, commit base `99e3eb118d89b62ed7ae4fa4fa2ca7f983f34e19` (`Version 101426.3`).  
**Entrega:** solo archivos completos modificados/nuevos, rutas relativas; sin instalador, sin patch, sin escrituras a servidores.  
**Norma:** Constitución v2.0, desarrollo incremental, matriz central como fuente de verdad y política fail-closed.

## 1. Causa raíz verificada en código

Aunque el Panel de Control guarda permisos por evento y rol en `notificacion_evento_roles`, el servicio `project-photo-notification.service.js` todavía ejecutaba `directorGeneralUserIds_gnral()` y buscaba exclusivamente `DIRECTOR GENERAL` por texto del rol. Un **Auxiliar de Dirección** podía tener activa la interacción `FOTOGRAFIA_PROYECTO_ACTUALIZADA` en el Panel y seguir sin pertenecer a los destinatarios candidatos. El FIX V001 de navegación y diagnóstico no había corregido esta exclusión: V002 la sustituye.

Este hallazgo explica un defecto de selección en el código. **No verifica por sí solo la configuración real de Aiven ni la entrega Push de un dispositivo concreto.**

## 2. Regla implementada

- **Fuente única de destinatarios:** `notificacion_eventos` (evento activo) + `notificacion_evento_roles` (relación activa con política `OBLIGATORIA` o `OPCIONAL`) + `roles` activos + `usuario_roles` activos + `usuarios` activos.
- **Sin nombres o identificadores de rol hardcodeados para la audiencia.** DG, Auxiliar de Dirección o cualquier rol futuro reciben el evento **solo si** tienen asociación efectiva autorizada por el Panel.
- **Todos los roles activos del usuario** pueden habilitarlo. Un mismo usuario no recibe duplicados aunque tenga varios roles aplicables.
- El motor existente `notification.service.js` evalúa nuevamente la matriz, canales Campana/Push y preferencias del usuario cuando la política es OPCIONAL. La selección de candidatos **no** fuerza el canal ni omite permisos.
- Si el evento, la relación, el rol o el usuario no están activos, no se entrega el aviso. Sin audiencia, `SIN_DESTINATARIOS_HABILITADOS_EN_PANEL` y log `[PROJECT_PHOTO_NOTIFICATION_NO_PANEL_RECIPIENTS]`.
- Conserva `excludeActor: false`: un Gestor de Fotografías que también pertenezca a un rol habilitado puede recibir su propio aviso.
- Conserva la autorización independiente para **subir/eliminar** fotos (`Gestor de Fotografías`); no confundir este permiso de escritura con la matriz de destinatarios de avisos.
- Conserva las rutas del FIX anterior: CORELLIAN → `detalle:proyecto-corellian:<proyecto>`; UNITED → `detalle:proyecto:<proyecto>`.
- Registra `destinatarios_panel_candidatos`, `creadas`, `omitidas`, `push_elegibles`, `trace_id` y errores sin incluir credenciales o claves.

## 3. Archivos del paquete

| Ruta | Tipo | Propósito |
|---|---|---|
| `backend/src/services/notifications/project-photo-notification.service.js` | Modificado completo | Resolver la audiencia del evento desde la matriz del Panel, nunca desde el nombre DG. |
| `tests/project-photo-notifications.test.js` | Modificado completo | Cambia las pruebas de la regla antigua, valida la consulta a la matriz y el orden commit/emisión en repo completo. |
| `tests/fix-photo-notification-navigation-v001.test.js` | Modificado completo | Adapta las pruebas de navegación/diagnóstico anteriores al resolver del Panel. |
| `tests/fix-photo-notification-matrix-v002.test.js` | Nuevo | Simula habilitación/deshabilitación de DG, Auxiliar, otros roles, usuario con varios roles, errores y ambas rutas. |

No se alteran tablas, columnas, relaciones, datos, ni la interfaz del Panel. No se requieren migraciones SQL para aplicar la lógica; **la configuración aprobada del Panel permanece en Aiven**.

## 4. Advertencia importante sobre SQL histórico

`sql/20261008_FOTOGRAFIAS_NOTIFICACION_DIRECCION_GENERAL_V001.sql` es el bootstrap histórico de la **regla anterior**. Contiene un `UPDATE notificacion_evento_roles` que desactiva roles distintos de Dirección General. **NO VOLVER A EJECUTAR ESE SQL DESPUÉS DE CONFIGURAR EL PANEL**: revocaría la selección del Auxiliar y cualquier otro rol. V002 no ejecuta ese archivo ni lo modifica silenciosamente; debe tratarse como migración histórica ya superada, no como script de sincronización o configuración diaria.

## 5. Aplicación manual y dependencias

1. Verificar `main` y comparar estos archivos con el commit base antes de reemplazarlos. Si cambiaron después de `99e3eb1`, detener y reconciliar.
2. Tener aplicado el FIX V001 de rutas fotográficas; `main` 101426.3 ya contiene sus archivos, pero GitHub Pages y Netlify pueden no estar desplegados con esa versión.
3. Conservar respaldo del servicio previo; copiar el **único archivo de backend modificado** a su ruta y copiar las 3 pruebas a `tests/` del repo. No copiar el código del ZIP anterior por encima de `main`.
4. Ejecutar las pruebas y validar respuesta Azure/Aiven en un ambiente autorizado. Desplegar **backend en Azure** mediante el flujo aprobado solo después de validar.
5. Para probar la campana de DG y Auxiliar, cargar una fotografía nueva (evento no duplicado), revisar `NOTIFICATION_TRACE` y `PROJECT_PHOTO_NOTIFICATION_EMISSION`, validar su `id_usuario` en `sup_notificaciones` y sus preferencias. Por separado comprobar una suscripción Push activa por dispositivo y el job de despacho.
6. Confirmar la navegación Corellian/United desde campana y Push en frontend ya actualizado por V001. Si el frontend no está publicado en Netlify, su publicación sigue siendo **manual** tras validación Local → GitHub Pages.

## 6. Pruebas locales realizadas

En ambiente temporal con los archivos del FIX V001 coincidentes en SHA con `main`:

```bash
node --check backend/src/services/notifications/project-photo-notification.service.js
node --check tests/project-photo-notifications.test.js
node --check tests/fix-photo-notification-navigation-v001.test.js
node --check tests/fix-photo-notification-matrix-v002.test.js
node --test tests/project-photo-notifications.test.js tests/fix-photo-notification-navigation-v001.test.js tests/fix-photo-notification-matrix-v002.test.js
```

**Resultado real local:** 26 casos detectados; **25 correctos y 1 omitido** por falta de los controladores originales en el directorio temporal de QA. Los controladores y Panel se verificaron además como texto real de `main` mediante la conexión GitHub. La prueba estática omitida se ejecuta al correr la suite contra el repositorio completo; **no afirmamos que esa prueba se haya ejecutado localmente**.

Estas son **pruebas unitarias con dobles de base de datos**, no pruebas MySQL ni validación productiva. La consulta MySQL queda pendiente de validación contra Aiven bajo credenciales autorizadas. No hay E2E de iPhone/Azure ni confirmación Push.

## 7. Diagnóstico Aiven — SOLO LECTURA

```sql
-- Comprueba la política efectiva del evento en Panel de Control.
SELECT e.codigo_evento, e.activo AS evento_activo,
       ner.activo AS permiso_activo, ner.politica,
       r.id_rol, r.rol, r.codigo, r.estado AS rol_activo
FROM notificacion_eventos e
LEFT JOIN notificacion_evento_roles ner ON ner.codigo_evento = e.codigo_evento
LEFT JOIN roles r ON r.id_rol = ner.id_rol
WHERE e.codigo_evento = 'FOTOGRAFIA_PROYECTO_ACTUALIZADA'
ORDER BY r.rol;

-- Destinatarios realmente candidatos con la nueva regla (no confirma Push).
SELECT DISTINCT u.id_SB, u.iniciales, u.nombre
FROM notificacion_eventos e
INNER JOIN notificacion_evento_roles ner
  ON ner.codigo_evento = e.codigo_evento
 AND ner.activo = 1
 AND ner.politica IN ('OBLIGATORIA', 'OPCIONAL')
INNER JOIN roles r ON r.id_rol = ner.id_rol AND r.estado = 1
INNER JOIN usuario_roles ur ON ur.id_rol = r.id_rol AND ur.activo = 1
INNER JOIN usuarios u ON u.id_SB = ur.id_usuario AND u.estado = 1
WHERE e.codigo_evento = 'FOTOGRAFIA_PROYECTO_ACTUALIZADA'
  AND e.activo = 1
ORDER BY u.id_SB;

-- Sustituir ID_USUARIO por el id_SB previamente confirmado del Auxiliar.
SELECT n.id_notificacion, n.id_usuario, n.tipo_notificacion, n.leido,
       n.ruta_destino, n.fecha_creacion
FROM sup_notificaciones n
WHERE n.id_usuario = ID_USUARIO
  AND n.tipo_notificacion = 'FOTOGRAFIA_PROYECTO_ACTUALIZADA'
ORDER BY n.id_notificacion DESC LIMIT 20;
```

Si el Auxiliar figura en la consulta de candidatos pero no hay fila en `sup_notificaciones`, revisar `NOTIFICATION_TRACE.decisions` por `SIN_ROL_ASOCIADO`, `PREFERENCIA_DESACTIVADA`, duplicados, errores o alguna otra omisión. Si existe fila pero no Push, revisar `notificaciones_push_suscripciones`, permisos del dispositivo y el job `pushNotifications` por separado.

## 8. Criterios de aceptación pendientes en entorno real

- Activar evento para Dirección General y Auxiliar → ambos aparecen como candidatos y reciben su notificación según política y canales de su rol.
- Deshabilitar Auxiliar desde Panel, sin cambiar código → deja de ser destinatario de nuevas fotografías.
- Asignar a futuro otro rol activo desde Panel → lo incluye automáticamente, sin cambiar código.
- Deshabilitar evento/rol/usuario → no lo notifica.
- Usuario autorizado por dos roles no recibe dos notificaciones idénticas.
- Corellian abre su detalle en Instalaciones; United abre el detalle de Portafolio.
- Al habilitar política OPCIONAL, se respetan preferencias de Campana/Push; la falta de una suscripción Push no debe impedir el funcionamiento de la campana.
- Validar en Azure/Aiven bajo usuario real y en PWA iPhone; no marcar la incidencia como cerrada hasta verificar estos puntos.

## 9. Reversión y alcance

Reponer `backend/src/services/notifications/project-photo-notification.service.js` desde el commit base `99e3eb118d89b62ed7ae4fa4fa2ca7f983f34e19`, y las pruebas afectadas desde ese commit. **Advertencia:** esa reversión restaura el error de audiencia exclusiva DG; utilizar solo como rollback técnico en caso de fallo y conservar el diagnóstico para un correctivo. No se necesitan cambios en Aiven para revertir este FIX; los avisos ya emitidos no se eliminan.

**Sistemas no tocados:** GitHub, Aiven, Azure, Netlify, GitHub Pages y dispositivos iPhone. El ZIP es una entrega local para aplicar con el flujo oficial.
