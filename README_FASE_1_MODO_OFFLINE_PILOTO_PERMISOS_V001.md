# Fase 1 — piloto de Modo Offline por permiso

## Resultado

BLT NOW incorpora el módulo `Modo Offline > Configuración` con un permiso dedicado:

`GENERAL_MODO_OFFLINE_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`

El acceso queda denegado por defecto. La migración registra el permiso en el Panel de Control, pero no lo asigna a roles ni usuarios.

## Habilitación controlada

1. Aplicar `sql/20261020_MODO_OFFLINE_PILOTO_PERMISO_V001.sql` en Aiven.
2. Abrir el Panel de Control de BLT NOW.
3. Seleccionar únicamente a la persona que participará en la prueba.
4. Asignar la excepción positiva para `Modo Offline > Configuración > Mostrar módulo`.
5. Cerrar y volver a abrir la sesión del usuario si la matriz de permisos ya estaba cargada.

No se debe asignar este permiso a un rol general durante el piloto.

## Qué prueba esta fase

- El menú sólo aparece con el permiso efectivo.
- `GET /api/offline/capabilities` valida nuevamente el permiso en el backend.
- La hora preferida se guarda localmente por usuario y dispositivo.
- La persona debe confirmar manualmente que está conectada a Wi‑Fi.
- IndexedDB escribe, verifica y elimina un registro técnico temporal.
- El Modo Visor puede revisar la pantalla, pero no guardar ni ejecutar la prueba.

## Qué no hace todavía

- No descarga ni conserva datos operativos.
- No registra un proceso periódico real.
- No promete ejecución exacta con la PWA cerrada.
- No sincroniza cambios offline con Aiven.

La hora configurada se considera una preferencia. En una fase posterior, si la aplicación no está abierta a esa hora, el respaldo se intentará en la siguiente oportunidad disponible, siempre después de la confirmación de Wi‑Fi del usuario.

## QA local

```powershell
node --test tests/offline-pilot-permissions.test.js
node --check modules/offline-pilot/offline-pilot.js
node --check backend/src/modules/offline-pilot/offline-pilot.service.js
node --check backend/src/modules/offline-pilot/offline-pilot.controller.js
node --check backend/src/modules/offline-pilot/offline-pilot.routes.js
```

La migración no se aplica automáticamente desde el repositorio.
