# ADR · Experimental NS F7 · Borradores y cambios externos

**Fecha:** 26/10/2026 · **Estado:** Propuesto para validación LOCAL.

## Contexto

La Fase 6 permite conservar la pantalla mientras cambian datos recibidos por Aiven. El usuario requiere que, al escribir un comentario en un ticket, un cambio de NetSuite no borre su texto y quede identificado el campo modificado.

## Decisión

Crear un complemento **aislado de Experimental NS**, sin tocar el Core global, los módulos originales ni la base de datos. El editor de prueba queda físicamente fuera del bloque que se actualiza; autoguarda notas en `sessionStorage` de la pestaña y compara campos observados de cada ticket para avisar del cambio. Historial temporal sin atribución de autor NS. No se envían comentarios ni se modifica el ticket.

## Justificación

No existe aún un contrato aprobado de **escritura de comentarios** para estos módulos NS, ni una versión de registro certificada por backend para bloquear escrituras concurrentes. Implementar una escritura real o nuevas tablas sin autorización contradiría la Constitución. La advertencia de cambio es una comprobación de prototipo, **no un control transaccional**.

## Seguridad y reversión

- Actor+usuario efectivo; limpieza al logout, expiración, cambio de visor y denegación F6.
- `sessionStorage` por pestaña con límites y caducidad; no datos persistidos en servidor.
- Para revertir, restaurar los seis archivos modificados desde `BACKUP_EXPNS_F7_*` y retirar cinco archivos nuevos; el sistema vuelve a F6.

## Futuro, fuera de F7

Cuando se apruebe enviar comentarios reales: diseñar ruta protegida con Guard/alcance de registro y control de versiones `UPDATE ... WHERE version = ?` o mecanismo equivalente validado contra la estructura real de Aiven; guardar historial oficial solo si se autoriza su modelo. No se crea nada de ello en F7.
