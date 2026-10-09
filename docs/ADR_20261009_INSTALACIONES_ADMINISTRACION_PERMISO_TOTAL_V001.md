# ADR — Permiso explícito de edición total en Instalaciones · Administración

**Fecha:** 09/10/2026  
**Estado:** propuesta de cambio de autorización pendiente de instalación/validación  
**Ámbito:** únicamente `/api/instalaciones/administracion`, dominio CORELLIAN  
**FIX:** `FIX_1_INSTALACIONES_ADMINISTRACION_EDICION_TOTAL_BACKEND_V001`

## Contexto y decisión

La regla funcional solicitada es que **quien tenga permiso de edición del módulo pueda modificar todos los 93 campos operativos** de `ins_fl`, independientemente del nombre del rol. El frontend de edición fantasma y el autoguardado serán FIX 2. La matriz previa tenía 22 permisos `GRUPOS_*.(VER|EDITAR)` y bloqueos temporales de seis campos; esto no representa la política funcional nueva.

**Decisión segura:** conservar el permiso vigente `INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.ACCESO_VISUAL` para consultar el módulo y registrar un único permiso explícito adicional `INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.EDITAR` para editar los once grupos. **No se usa el permiso visual como permiso de escritura**, evitando ampliar silenciosamente el acceso de cuentas que sólo tenían lectura. No se asignan permisos automáticamente: el equipo autorizado debe recibir `EDITAR` a través del Panel de Control, y además conservar `ACCESO_VISUAL`.

Los 22 permisos históricos de grupos permanecen en base de datos para preservar su trazabilidad: **no habilitan edición**, pero mantienen las restricciones de lectura por sección de usuarios que sólo tengan `ACCESO_VISUAL` sin `EDITAR` global. Quien sí tenga ambos permisos globales visualiza y edita los once grupos. No se eliminan ni reasignan. El contrato API informa los códigos de permiso efectivos según el caso. No existe una condición textual por nombre de rol como «Admin Instalaciones».

## Protección independiente — no negociable

Cada ruta continúa validando `Sesión + Permiso funcional + Puerta CORELLIAN INSTALACIONES + Alcance del registro`. El visor de usuarios permanece solo lectura. La verificación del permiso de edición se realiza también en el servicio, nunca sólo desde el navegador. Los IDs `id_ins_fl`, `created_at` y `updated_at` continúan protegidos.

Todos los 93 campos operativos están disponibles en **ficha individual**; siguen vigentes límites del esquema, referencias a usuarios válidos, validaciones de fecha/porcentaje/costo, comparación con `expected`, transacciones y auditoría por grupo. Los campos `id_proyecto` y `referencia_sitio` cambian la agrupación o identidad lógica del equipo: su modificación **no es masiva** (para evitar fusionar equipos o provocar colisiones), y la unicidad `(id_proyecto,referencia_sitio)` se mantiene por el índice `uq_ins_fl_proyecto_referencia`. Un choque es HTTP 409 con rollback. Tras una edición de `id_proyecto` deberán revisarse integraciones y referencias de otras tablas; **no se automatizan propagaciones a tablas ajenas**.

Los cuatro campos anteriormente considerados derivados (`dias_restantes`, `dias_sin_visita`, `dias_sin_ccnr`, `meses_garantia_restantes`) quedan editables como campos almacenados, sin introducir un motor nuevo de cálculo. **No puedo confirmar** que integraciones externas no los vuelvan a calcular/sobrescribir; esta comprobación es criterio de QA.

## Despliegue, reversión y riesgo

1. Revisar destinatarios antes de conceder `EDITAR`. Aplicar manualmente el SQL de registro (sin asignaciones). Confirmar permisos existentes por medio del SQL read-only y el Panel de Control.
2. Asignar explícitamente `EDITAR` a los usuarios/grupos autorizados **solo después de comprobar la puerta y alcance**.
3. Aplicar los archivos de backend de forma incremental en entorno Local, comprobar pruebas y realizar despliegue manual/autorizado a Azure tras QA.
4. Revertir el FIX restaurando los archivos backend anteriores; no borrar automáticamente códigos de permiso ni entradas de auditoría. Revocar asignaciones `EDITAR` desde Panel de Control sólo mediante una decisión específica.

**Riesgo principal:** los usuarios con permisos históricos por sección pero **sin `EDITAR` global** perderán capacidad de escribir hasta recibir la asignación; ocurre deliberadamente en modo fail-closed. El backend no permitirá editar si el registro del permiso global todavía no existe. **No se cambió la Constitución del Proyecto**, el Guard central ni el motor de alcance.
