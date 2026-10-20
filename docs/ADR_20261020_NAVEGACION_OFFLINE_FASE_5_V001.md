# ADR | BLT NOW - Navegacion Offline Fase 5 V001

**Fecha:** 20-oct-2026  
**Estado:** FIX preparado, no aplicado y no desplegado  
**Base:** `ziSirrush/GestorMantto@857f52b8f38062f3171c3198568466b83e7805ac` (main, 102026.8).

## Contexto

Los puentes F1-F4 permiten reusar la interfaz original con los respaldos certificados y capturar intenciones locales. La auditoria detecto rutas de riesgo que permanecen abiertas cuando el usuario pierde la autorizacion despues del montaje de la pantalla: un formulario de Ticket deja de ser interceptado si `enabledScreen()` se vuelve `null`; un cuadro CORELLIAN puede conservar botones de edicion; el Resumen puede conservar DOM de otra identidad; y una lectura larga podria habilitar rutas con un cache territorial caducado.

## Decision

- **Fallo cerrado** de todo formulario nativo de Ticket mientras el contexto esta offline: el bloqueo sucede antes de consultar `enabledScreen()`. Solo acciones autorizadas se encolan; los intentos no autorizados conservan el texto del usuario, sin POST.
- **Revocacion durante el montaje:** los controles de proyecto se bloquean si la PWA esta offline, incluso cuando ya no existe permiso local vigente.
- **Privacidad de sesion:** al cambiar actor/usuario o vencer la sesion, ocultar el DOM del Resumen y borrar su mapa de detalle hasta una nueva lectura; una carga asincrona anterior no puede desbloquearlo.
- **Integridad de permisos:** releer el cache de acceso al final del escaneo de `verifiedSnapshot` para descartar una autorizacion caducada o una firma sustituida durante el trabajo asincrono.
- **Sin confirmaciones falsas:** si el formulario se resolvio localmente despues de cambiar de identidad, no borrar ni confirmar visualmente el texto en la pantalla de la nueva identidad.
- **Activacion atomica de la PWA:** requerir que los recursos basicos de ambos modulos certificados existan antes de activar un nuevo service worker. Borrar cache nuevo parcial si falla su preparacion; conservar el trabajador antiguo.
- **Autoridad operativa:** Aiven MySQL mantiene la fuente oficial. No se cambia el backend de sincronizacion, sus Guards, idempotencia o tablas existentes.

## Riesgos y mitigaciones

El respaldo local no puede detectar revocaciones hechas remotamente mientras no exista conexion; se usa TTL del cache y validacion posterior en backend. Los datos locales siguen expuestos a personas con acceso al perfil del navegador. La purga del almacenamiento al cerrar sesion (incluidos pendientes sin ACK) es una decision heredada y no se altera sin autorizacion. No se implementan respaldos de historicos de comentarios, fotografias ni otros modulos.

## Validacion

146 pruebas integradas simuladas y una prueba de worker de la PWA correctas; sintaxis JS correcta. Sin E2E real en PWA, Azure ni Aiven. Sin cambios remotos ni migracion SQL.
