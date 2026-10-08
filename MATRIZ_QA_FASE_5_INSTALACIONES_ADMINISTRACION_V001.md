# MATRIZ QA / CONTROL DE LIBERACION - INSTALACIONES > ADMINISTRACION - FASE 5
Fecha: 2026-10-08 | Base GitHub main: 9a744173990386cc0c64f6e1225ab9b07cf273cb

**IMPORTANTE:** Los casos E2E estan PENDIENTES; no se han ejecutado contra Aiven ni Azure.
Solo las pruebas automatizadas locales con DOBLES y validacion sintactica
pueden marcarse como realizadas por esta entrega.

| ID | Prioridad | Caso y resultado obligatorio | Entorno | Estado de entrega |
|---|---|---|---|---|
| Q01 | P0 | Catalogo F2 tiene 23 codigos activos; asignacion real autorizada para usuarios QA | Aiven / Panel de Control | PENDIENTE |
| Q02 | P0 | Sin sesion y sin puerta CORELLIAN/INSTALACIONES devuelve 401/403 | Azure | PENDIENTE |
| Q03 | P0 | Sin permiso de modulo no aparecen vista, listado ni detalle aun por URL directa | Local / Azure | PENDIENTE |
| Q04 | P0 | Usuario con VER solo de costos no recibe campos de proyecto/cliente ni se busca/ordena por ellos | Azure / Aiven | PENDIENTE |
| Q05 | P0 | Usuario fuera de alcance CORELLIAN no puede abrir/editar el id_ins_fl aun por URL directa | Azure | PENDIENTE |
| Q06 | P0 | Visor de Usuarios no puede editar aunque el usuario efectivo tenga EDITAR | Local / Azure | PENDIENTE |
| Q07 | P0 | EDITAR de un grupo no concede otro; el backend devuelve 403 al PATCH indebido | Azure | PENDIENTE |
| Q08 | P0 | Cada uno de los 11 grupos tiene formulario/control correcto y persistencia autorizada | Local / Aiven | PENDIENTE |
| Q09 | P0 | PATCH solo de campos cambiados, no borra valores de otras columnas | Azure / Aiven | PENDIENTE |
| Q10 | P0 | Auditoria guarda mismo usuario, modulo, grupo, campos, before y after con fecha/hora | Aiven | PENDIENTE |
| Q11 | P0 | Si falla INSERT de auditoria, UPDATE revierte en la misma transaccion | Laboratorio Aiven | PENDIENTE |
| Q12 | P0 | JSON de auditoria >65535 bytes provoca 413 y ROLLBACK completo | Laboratorio Aiven | PENDIENTE |
| Q13 | P0 | Dos usuarios editan mismo campo; segundo obtiene 409 y no pisa primero | Azure / Aiven QA | PENDIENTE |
| Q14 | P0 | Dos usuarios editan campos distintos; ambas ediciones persisten sin pisarse | Azure / Aiven QA | PENDIENTE |
| Q15 | P0 | Cambio de id_sup/id_asesor/id_admin que quita alcance impide siguiente GET/PATCH | Azure / Aiven QA | PENDIENTE |
| Q16 | P0 | GAS/Sheets -> ins_fl no sobrescribe sin control una edicion humana; validar autoridad por campo y sincronizaciones | Aiven QA / GAS | PENDIENTE / BLOQUEANTE |
| Q17 | P1 | Fechas ISO de guardado y DD/MM/AAAA de pantalla; rechaza 29 feb invalido | Local / Azure | PENDIENTE |
| Q18 | P1 | Porcentaje 0-100, precision 2; montos no negativos y validacion de rango | Local / Azure | PENDIENTE |
| Q19 | P1 | Selector responsables solo usuarios activos, FK validada; edicion de asignaciones | Local / Azure | PENDIENTE |
| Q20 | P1 | No permite modificar identidad ni derivados pendientes de politica | Azure / Aiven | PENDIENTE |
| Q21 | P1 | Tras guardar, refresco selectivo inmediato; si falla recarga se avisa sin falso exito | Local / Azure | PENDIENTE |
| Q22 | P1 | Cache actualizado (loader/index), responsive 760/480, PWA, dispositivo movil | Local / GitHub Pages | PENDIENTE |
| Q23 | P1 | SQL readonly verifica permisos y auditorias nuevas sin detalle 0 | Aiven | PENDIENTE |
| Q24 | P0 | Flujo Local -> GitHub Pages -> Netlify; deploy Netlify manual autorizado | Pipeline de promocion | PENDIENTE |

## Automatizaciones incluidas (no son E2E)

- Tests Fase 5: auditoria atomica simulada, limite UTF-8, concurrencia serializada simulada,
  proyeccion SQL restringida, contrato de smoke readonly y frontend. Ejecutados localmente.
- Tests Fase 4: 11 tests simulados; ejecutados localmente sobre los archivos de Fase 4 mas el FIX Fase 5.
- Script `EJECUTAR_QA_FASE_5.ps1`: ejecuta desde el checkout completo pruebas F1-F5 y sintaxis (NO ejecutado en Windows aqui).
- Script `validation/instalaciones-administracion-fase5-readonly-smoke.js`: GET sin escritura,
  verificaciones de auth/permiso/contrato/busqueda; para invocacion manual contra backend.
- SQL `database/QA_FASE_5_INSTALACIONES_ADMINISTRACION_SOLO_LECTURA_V001.sql`: SELECT en base autorizada.

## Criterio de aceptacion

- **NO LIBERAR** con cualquier P0 fallido o no validado.
- Evidencia por caso: usuario/rol efectivo (sin credenciales), fecha/hora CDMX,
  entorno, ID de registro de prueba, codigo HTTP, diff de BD anonimizado,
  ID de auditoria, resultado y responsable que lo valido.
- Pruebas mutantes solo en laboratorio/restauracion y con respaldo; nunca
  ejecutar pruebas destructivas deliberadas en Produccion.
- Respetar scopes CORELLIAN y politica del Visor. No crear tablas.
- Mantener campos de identidad `id_proyecto`/`referencia_sitio` y cuatro
  derivados bloqueados hasta que exista decision funcional documentada.
- Resolver convivencia GAS/Sheets con una decision sobre autoridad de campos:
  esta entrega NO altera sincronizadores ni presume que dos escritores pueden
  actualizar los mismos campos sin conflictos.
