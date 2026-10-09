# Mantto Gestor — Matriz de QA del FIX 3 | Instalaciones · Administración

Fecha: 09/10/2026. **Cierre técnico no equivale a liberación productiva.**
Origen oficial de código revisado: `ziSirrush/GestorMantto` `main` `2e516699c42f870b730bbee712b437e72e9f4d8d` (`Version 100926.4`).
Base funcional integrada en laboratorio local: ZIP `FIX_1_INSTALACIONES_ADMINISTRACION_EDICION_TOTAL_BACKEND_V001` + ZIP `FIX_2_INSTALACIONES_ADMINISTRACION_AUTOGUARDADO_V001`. Ninguno de esos ZIP se debe dar por desplegado basándose únicamente en esta matriz.

| Caso | Prioridad | Validación exigida | Validación obtenida |
| --- | --- | --- | --- |
| Permiso acceso visual / EDITAR explícito | P0 | Solo EDITAR autorizado escribe; ACCESO_VISUAL por sí solo NO | Unitarias offline. **Real pendiente** |
| Scope CORELLIAN por equipo e identidad efectiva | P0 | 403/404 fuera de alcance; visor siempre solo lectura | Unitarias; smoke GET opt-in. **Real pendiente** |
| Campos operativos | P0 | 93 campos editables en ficha individual solo con permiso; 3 técnicos protegidos | Contrato y test offline. **Real pendiente** |
| Guardado individual | P0 | Un PATCH por campo al blur/change; 0 PATCH por tecla; GET posterior | DOM/API simulados. **Real pendiente** |
| Blanco legado de fecha/número | P0 | Solo enfocar/salir NO convierte dato histórico a NULL | Corregido y probado offline. **Real pendiente** |
| Vaciar campo voluntario | P0 | Botón explícito Vaciar transmite NULL y `expected` original | Probado offline. **Real pendiente** |
| Campo modificado concurrentemente | P0 | expected del valor visto, conflicto 409; sin sobreescritura silenciosa | Corregido y probado offline. **Real pendiente** |
| GET después de PATCH | P0 | Si cambió otro campo no editado, sincroniza UI. Si hay borrador conserva contenido/baseline. | Corregido y probado offline. **Real pendiente** |
| Error antes de PATCH | P0 | Mostrar error; conservar dato y reintento manual, sin reintentos automáticos | Unitarias offline. **Real pendiente** |
| Error tras PATCH confirmado | P0 | Estado pendiente de verificar; bloquear envíos y NO informar guardado confirmado | Unitarias offline. **Real pendiente** |
| Revocación de permisos/alcance tras PATCH | P0 | Purga de ficha y fallo cerrado | Unitarias offline. **Real pendiente** |
| Auditoría atómica en `usuario_interacciones` | P0 | Valor anterior/nuevo, usuario/fecha/hora; falla de audit provoca rollback | Revisión estática y dobles. **Aiven QA pendiente** |
| Edición múltiple | P0 | 2–20 equipos, mismo `id_proyecto`, confirmación manual, rollback integral | Unitarias offline. **Real pendiente** |
| Integridad de `id_proyecto` / `referencia_sitio` | P0 | Individual edit permite cambios bajo UNIQUE; lote los rechaza | Revisión y dobles. **Aiven QA pendiente** |
| Permisos 24 códigos (23 previos + EDITAR global) | P0 | Código global registrado, asignado por Panel de Control; sin rol implícito | SQL SELECT entregado. **Aiven real pendiente** |
| Carga, móviles, PWA y navegación | P1 | Campos accesibles/visibles en móvil; volver y refresco selectivo | CSS/DOM estático. **Navegador pendiente** |
| Cache bust frontend | P1 | En `module-loader.js` e `index.html` tokens nuevos | Script de actualización local entregado. **Windows pendiente** |
| Backend Azure + GitHub Pages + Netlify manual | P0 | Local -> GitHub Pages validado -> despliegue manual Netlify | **NO EJECUTADO** |

## Smoke remoto solo lectura (opcional y autorizado)

`validation/instalaciones-administracion-fix3-autoguardado-readonly.js` requiere `--readonly --base-url` con origen HTTPS y `MANTTO_QA_TOKEN` (JWT de usuario con **ACCESO_VISUAL y EDITAR global**). Admite `MANTTO_QA_READONLY_TOKEN` para usuario sin EDITAR, `MANTTO_QA_DENIED_TOKEN` para usuario sin acceso, `--record-id` permitido y `--denied-record-id` fuera de alcance. Registra SOLO resultados PASS/SKIP; nunca valores operativos ni tokens. **No hace PATCH/POST ni prueba auditoría de escritura.**

## Cierre

**NO aprobar producción hasta que todas las filas P0 tengan evidencia real en ambiente autorizado.** Ante divergencia SQL/autorización/auditoría, no deshabilitar guards; detener y documentar. La única tabla fuente operativa es `ins_fl`, sin modificaciones de esquema.
