# Fase 2 — Entregas · Checklist E2E + Azure

## Regla

Este checklist **sí genera datos** cuando se ejecuta. Hacerlo primero en el entorno de Pruebas/Aiven autorizado. No ejecutarlo deliberadamente sobre Producción sin autorización explícita.

Usar dos identidades controladas:

- **Responsable**: usuario con Programadas + Validación + Indicadores.
- **Colaborador**: usuario con Mis Entregas + Adjuntar archivo.

Usar un archivo pequeño no sensible, por ejemplo `QA_ENTREGAS_V001.pdf`.

## 1. Navegación y permisos

- [ ] El grupo `📬 Entregas` aparece únicamente con `ENTREGAS_CONTROL_ACCESO_VISUAL_MODULO.ACCESO_VISUAL` efectivo.
- [ ] Abre `Control de Entregas` sin caer en “En construcción”.
- [ ] Las pestañas no autorizadas quedan ocultas.
- [ ] Un usuario sin permiso obtiene 403 en backend aunque intente llamar el endpoint manualmente.

## 2. Crear entrega

Como Responsable:

- [ ] Crear una entrega `UNICA` con título `QA_ENTREGAS_V001_<fecha-hora>` para el Colaborador.
- [ ] Confirmar que aparece en Programadas inmediatamente, sin recargar toda la aplicación.
- [ ] Abrir detalle y confirmar una única ocurrencia y fecha límite correcta.

Repetir opcionalmente en Pruebas:

- [ ] SEMANAL genera 12 ocurrencias cada 7 días.
- [ ] QUINCENAL genera 12 ocurrencias cada 15 días.
- [ ] MENSUAL conserva el día o usa último día del mes cuando corresponda.

## 3. Carga Azure Blob

Como Colaborador:

- [ ] La entrega aparece en Mis Entregas.
- [ ] Cargar `QA_ENTREGAS_V001.pdf`.
- [ ] La UI se refresca inmediatamente.
- [ ] Aparece nombre de archivo y fecha real de carga.
- [ ] El estado es A tiempo/Tarde según la fecha límite.
- [ ] Abrir el archivo; debe obtenerse acceso temporal SAS y el contenido debe corresponder al archivo cargado.

Seguridad:

- [ ] Un tercer usuario no relacionado no puede abrir el archivo (403).
- [ ] El Responsable sí puede abrir el archivo.
- [ ] El Colaborador sí puede abrir su propio archivo.

## 4. Rechazo y reemplazo

Como Responsable:

- [ ] La entrega aparece en Validación.
- [ ] Rechazar con comentario `QA rechazo controlado`.

Como Colaborador:

- [ ] El rechazo y comentario aparecen inmediatamente.
- [ ] Reemplazar el archivo por una segunda versión.
- [ ] La validación vuelve a `SIN_REVISAR`.
- [ ] El nuevo archivo abre correctamente.

Verificar en telemetría/storage cuando esté disponible:

- [ ] El blob anterior fue eliminado o quedó en cola de limpieza controlada; no debe quedar referenciado como archivo activo de la instancia.

## 5. Validación final e indicadores

Como Responsable:

- [ ] Marcar la segunda carga como Válida.
- [ ] La entrega desaparece de pendientes de Validación.
- [ ] En Programadas, detalle muestra `Válido`.
- [ ] Indicadores reflejan la entrega vencida cuando corresponda, sin castigar ocurrencias todavía no vencidas.

## 6. Desactivación

- [ ] Desactivar la programación QA.
- [ ] Deja de aparecer entre Programadas activas.
- [ ] El historial existente no se destruye.
- [ ] Una programación inactiva no acepta nuevas cargas.

## 7. Responsive / PWA

Validar al menos PC y viewport móvil:

- [ ] Tabs utilizables sin desbordes destructivos.
- [ ] Modal de alta visible y desplazable.
- [ ] Tabla de detalle usa scroll horizontal cuando sea necesario.
- [ ] Selector de archivo utilizable.

## 8. Regresión mínima

- [ ] Inicio abre normalmente.
- [ ] Customer Experience Dashboard/Encuestas siguen navegando.
- [ ] Panel lateral mantiene un solo grupo expandido.
- [ ] Notificaciones/interacciones no fueron desactivadas.
- [ ] Panel de Control continúa cargando permisos.

## Criterio de cierre

Fase 2 puede declararse **CERRADA** únicamente cuando:

1. `VALIDAR_LOCAL_FASE_2_ENTREGAS_V001.ps1` = PASS.
2. `VALIDAR_AIVEN_FASE_2_ENTREGAS_V001.sql` = estructura/permisos correctos y consistencias en 0.
3. Smoke API de lectura = PASS con identidad que tenga los permisos requeridos.
4. Flujo E2E de creación → carga Azure → rechazo → reemplazo → validación = PASS.
5. Seguridad negativa = PASS.
6. Responsive/regresión mínima = PASS.

Si algún punto falla, **no cerrar la fase**; generar un FIX incremental específico.
