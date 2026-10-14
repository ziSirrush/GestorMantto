# Mantto Gestor — FIX_NOTIFICACIONES_FOTOGRAFIAS_RUTA_DIAGNOSTICO_V001

**Fecha:** 14/10/2026  
**Base verificable:** `ziSirrush/GestorMantto`, rama `main`, commit `4688fecfb1542518dd74ac8ca438bb2dc1badabb` (`Version 101426.2`).  
**Estado:** paquete para aplicar y validar. **No desplegado.**  
**Norma:** Constitución del Proyecto v2.0 (27/08/2026).

## 1. Diagnóstico y objetivos

El evento `FOTOGRAFIA_PROYECTO_ACTUALIZADA` emitía `detalle:proyecto:<id>` para fotografías tanto de **CORELLIAN** como de **UNITED**. Esa ruta llega al detalle **UNITED/Portafolio** y puede mostrar `Proyecto no encontrado` al abrir una notificación Corellian como `P10152`.

Además, la falta de una notificación para un usuario no se puede atribuir solamente a que su configuración personal esté activa. La audiencia actual del evento son los usuarios **activos con rol vigente Director General**. Las condiciones posteriores de entrega Push dependen de una suscripción vigente y del despachador. **No puedo confirmar en este paquete por qué un usuario específico no recibe Push ni campana sin evidencia de Aiven y Azure.**

## 2. Archivos completos dentro del ZIP

| Ruta | Tipo | Propósito |
|---|---|---|
| `backend/src/services/notifications/project-photo-notification.service.js` | Modificado | Emite ruta Corellian tipada; mantiene ruta United; registra resultados y causas de ausencia de emisión. |
| `backend/src/modules/notificaciones/notificaciones.repository.js` | Modificado | Resuelve rutas fotográficas **históricas** en lectura mediante identidad estructurada `id_photo` + proyecto y ausencia de colisión entre ambos dominios. No escribe en Aiven. |
| `core/config.js` | Modificado | Carga una sola vez el integrador frontend, sin alterar las bases API. |
| `core/photo-notification-navigation.js` | Nuevo | Traduce únicamente la ruta Corellian al detalle unificado de Instalaciones; respeta las rutas ajenas. Compatible con campana, lista de notificaciones y Push. |
| `tests/project-photo-notifications.test.js` | Modificado | Actualiza las aserciones existentes para los dos dominios. |
| `tests/fix-photo-notification-navigation-v001.test.js` | Nuevo | 12 pruebas locales automatizadas con dobles de prueba. |

**Sin instaladores, sin parches, sin SQL de escritura, sin tablas o columnas nuevas.** Todos los archivos de código entregados son completos y conservan la estructura del repositorio.

## 3. Comportamiento tras aplicar

- Foto Corellian: nueva ruta `detalle:proyecto-corellian:P10152`. Se dirige al detalle unificado existente (`template: cliente-unificado`, `source: instalaciones-concentrado-cliente`), que consume los endpoints y el alcance Corellian ya existentes.
- Foto United: conserva `detalle:proyecto:<identificador>` y su detalle de Portafolio.
- Campana antigua: se intenta **solo en lectura** la identificación por `id_photo` y nombre de proyecto en `ins_proyecto_fotos` y `portafolio_proyecto_fotos`. Si la referencia corresponde **exclusivamente a Corellian**, se proyecta la nueva ruta; si corresponde **exclusivamente a United**, se mantiene. Si aparece en ambos o en ninguno, se abre la bandeja de Notificaciones: **no se adivina el dominio**.
- Push antiguo ya entregado: únicamente si trae el código exacto del evento y el sufijo histórico generado por el sistema `(Corellian).`, se dirige al detalle de Instalaciones. El acceso real sigue condicionado por el backend.
- El integrador registra como vista una notificación abierta desde la pantalla independiente de Notificaciones, usando el cliente HTTP autenticado actual; no modifica el comportamiento de notificaciones de otros eventos.
- No se cambia el rol **Gestor de Fotografías** exigido para subir/eliminar fotos, la audiencia exclusiva **Director General**, ni `excludeActor: false`. No se abren permisos ni llaves maestras.
- En Azure se registran eventos `PROJECT_PHOTO_NOTIFICATION_EMISSION`, `PROJECT_PHOTO_NOTIFICATION_NOT_CREATED`, `PROJECT_PHOTO_NOTIFICATION_NO_DIRECTORS`, `PROJECT_PHOTO_NOTIFICATION_ACTOR_REJECTED` y `PROJECT_PHOTO_NOTIFICATION_INPUT_REJECTED` con cantidades, razón y `trace_id` cuando esté disponible. **Emisión creada ≠ Push entregado.**

## 4. Aplicación manual — orden seguro

1. Verificar el commit base. Si `main` cambió o los archivos locales difieren, **detener y comparar antes de sobrescribir**: este paquete reemplaza archivos completos.
2. Tener respaldo/copia del código previo; no se requiere migración de Aiven.
3. Copiar los **2 archivos de backend** a sus rutas. Desplegar/reiniciar primero el backend en el entorno de pruebas autorizado de Azure.
4. Copiar los **2 archivos de frontend** (`core/config.js`, `core/photo-notification-navigation.js`) y las pruebas al repositorio de desarrollo, conservando rutas. **No ejecutar instaladores**.
5. Validar localmente la navegación. Publicar en **GitHub Pages** para validación en línea, con backend autorizado.
6. Probar desde ordenador y **PWA iPhone**, recargando la PWA para actualizar `core/config.js`. Revisar que el archivo `core/photo-notification-navigation.js?v=20261014-v001` sea servido con HTTP 200.
7. Solo después de aprobación, desplegar **Netlify manualmente**. Validar además el backend Azure y Aiven mediante los controles de abajo.

El simple reemplazo de archivos del ZIP **no modifica por sí mismo** GitHub, Azure, Aiven ni Netlify.

## 5. Pruebas reproducibles

Sintaxis (Node 22):

```bash
node --check backend/src/services/notifications/project-photo-notification.service.js
node --check backend/src/modules/notificaciones/notificaciones.repository.js
node --check core/config.js
node --check core/photo-notification-navigation.js
node --check tests/project-photo-notifications.test.js
node --check tests/fix-photo-notification-navigation-v001.test.js
```

Pruebas nuevas sobre un repositorio completo:

```bash
node --test tests/fix-photo-notification-navigation-v001.test.js
node --test tests/project-photo-notifications.test.js
```

**QA ejecutado al preparar el ZIP:** 12/12 nuevas pruebas simuladas correctas; 3/3 pruebas unitarias originales seleccionadas correctas. Se verificó sintaxis de los seis archivos. La prueba estática adicional del archivo original requiere los controladores y SQL que permanecen en el repositorio completo; no se ejecutó aisladamente.

**Pendiente / NO confirmado:** consultas reales a Aiven, validación SQL MySQL, autorización de `P10152` bajo la sesión real, existencia del evento configurado en producción, suscripción Push real, despacho VAPID y pruebas E2E iPhone/Azure/Netlify.

## 6. Diagnóstico en Aiven/Azure: SOLO LECTURA

Ejecutar únicamente con acceso autorizado de diagnóstico; reemplazar `DGB` por las iniciales reales y, después, el ID del usuario:

```sql
-- Identidad y roles activos del usuario receptor
SELECT u.id_SB, u.nombre, u.iniciales, u.estado AS usuario_activo,
       ur.activo AS relacion_activa, r.rol, r.codigo, r.estado AS rol_activo
FROM usuarios u
LEFT JOIN usuario_roles ur ON ur.id_usuario = u.id_SB
LEFT JOIN roles r ON r.id_rol = ur.id_rol
WHERE u.iniciales = 'DGB';

-- Evento y matriz obligatoria de Dirección General
SELECT e.codigo_evento, e.activo, e.obligatoria,
       e.campana_default, e.push_default, ner.activo AS relacion_activa,
       ner.politica, r.rol, r.codigo
FROM notificacion_eventos e
LEFT JOIN notificacion_evento_roles ner ON ner.codigo_evento = e.codigo_evento
LEFT JOIN roles r ON r.id_rol = ner.id_rol
WHERE e.codigo_evento = 'FOTOGRAFIA_PROYECTO_ACTUALIZADA';

-- Sustituir 123 por el id_SB confirmado (no por id_photo)
SELECT n.id_notificacion, n.id_usuario, n.tipo_notificacion,
       n.ruta_destino, n.id_referencia, n.leido, n.fecha_creacion
FROM sup_notificaciones n
WHERE n.id_usuario = 123
  AND n.tipo_notificacion = 'FOTOGRAFIA_PROYECTO_ACTUALIZADA'
ORDER BY n.id_notificacion DESC LIMIT 20;

-- Una suscripción activa es necesaria para Push, pero no prueba entrega
SELECT s.id_suscripcion, s.id_usuario, s.activo,
       s.ultimo_id_notificacion, s.ultimo_uso_at, s.updated_at
FROM notificaciones_push_suscripciones s
WHERE s.id_usuario = 123
ORDER BY s.updated_at DESC;
```

En Azure consultar `PROJECT_PHOTO_NOTIFICATION_*`, `NOTIFICATION_TRACE` y los registros del job `pushNotifications`. Si existe notificación en `sup_notificaciones` pero no Push, separar el diagnóstico de **emisión, selección de destinatario, suscripción, VAPID/despachador y permiso del navegador**. No registrar secretos VAPID ni tokens del dispositivo.

## 7. Criterios de aceptación E2E pendientes

- Foto Corellian P10152 creada y eliminada → aparece en campana de Director General y se abre su detalle **Corellian** sin buscar el proyecto en Portafolio United.
- Foto United creada y eliminada → abre detalle **United**, no se ve afectada la navegación normal del resto de notificaciones.
- Notificación histórica: coincidencia única de identidad, y ambigua/no verificable, respetan las rutas definidas arriba.
- Gestor de Fotografías que también tenga rol **Director General activo** recibe una notificación dirigida a sí mismo (`excludeActor: false`).
- Un usuario **sin** Director General no recibe ese evento por la sola configuración de su perfil.
- Campana vs. Push: comprobar ambos por separado en PWA iOS; si no llega Push, registrar la evidencia de suscripción y los logs sin falsear una prueba de entrega.
- Usuarios sin alcance sobre el proyecto siguen bloqueados por los guards existentes.

## 8. Reversión

Restaurar los **4 archivos existentes modificados** desde el commit previo aprobado, eliminar `core/photo-notification-navigation.js` y la prueba nueva. No hay reversión de Aiven porque el FIX no escribe ni migra registros. Los nuevos avisos ya persistidos mantienen su ruta tipada; si se revierte el frontend, esos avisos podrían dejar de navegar correctamente. Por eso, **revertir backend y frontend de forma coordinada**, sin desplegar una mitad sola.

## 9. Límites y cautelas

- Este FIX **no** asigna automáticamente el rol Director General ni fuerza suscripciones Push en dispositivos con permisos denegados o caducados.
- Tampoco puede prometer la entrega Push a ningún iPhone sin validación del dispositivo y del despachador Azure.
- La vista unificada Corellian reutiliza el lector existente de `ins_fl`, incluido su límite de consulta actual; validar que el proyecto objetivo esté dentro del alcance del usuario y visible en esa consulta. Si no lo está, debe abrirse una incidencia distinta de lectura/alcance, **no ampliar permisos como atajo**.
- Ningún módulo de Main, ninguna llave maestra ni las preferencias del usuario se alteran.
