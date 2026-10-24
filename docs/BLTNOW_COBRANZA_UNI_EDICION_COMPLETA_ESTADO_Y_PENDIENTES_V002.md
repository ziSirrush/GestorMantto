# Cobranza UNI Administración — edición manual VA, MP y Zona 1

Fecha: 2026-10-23. Sustituye el estado de implementación descrito en V001; **no constituye Vo. Bo. de producción**.

## Alcance implementado localmente

| Tabla | Editables | Protegidos |
| --- | ---: | --- |
| `pc` (Venta Adicional) | 15 capturas, incluidos proyecto, cliente, OV, fechas, precio y factura | `id_pc`, `id_proyecto_cobranza` y 14 automáticos |
| `detalle_mp_2026` | 11 capturas, incluidos proyecto, IDNS, cliente y datos operativos | `id_dmp`, `id_proyecto_cobranza` y 7 automáticos |
| `detalle_mp_2026_zona_1` | 124 datos generales y de facturación | `id_mp_zona_1`, `id_dmp`, `created_at`, `updated_at` |

- Editor Excel y contrato de acceso usan las listas ampliadas. Sigue siendo obligatorio el permiso efectivo `VER` + `EDITAR`, el guard UNITED y el alcance territorial del servidor. Hay apagado de emergencia mediante `PC_ADMIN_EDIT_ENABLED=false`, `MP_ADMIN_EDIT_ENABLED=false` y `MP_ADMIN_ZONA1_EXCEL_EDIT_ENABLED=false`.
- VA guarda la captura y sus derivados locales/relacionales en la misma transacción. Recalcula las ventas del proyecto afectado; al editar `proyecto`, también considera el anterior. Rechaza agregados incompletos, relaciones ambiguas y más de 100 ventas por proyecto; las consultas relacionadas están acotadas.
- MP guarda `proyecto`, `idns` y `cliente` solo en MP. Los cambios MP que afectan derivados VA lanzan el recálculo VA en la misma transacción. Zona 1 propaga a MP únicamente los seis BUSCARV documentados; `iguala` también actualiza `monto_anual` cuando existe un factor válido. `condiciones_pago` actualiza términos derivados de VA. Fallo de escritura, concurrencia, fórmula o auditoría revierte la transacción.
- Cuando MP y Zona 1 ya no coinciden en proyecto/IDNS/cliente, solo el usuario con permiso de edición puede ver la fila vinculada por `id_dmp` marcada como **identidad desajustada**. En esa fila se pueden reparar únicamente proyecto, IDNS o cliente; el resto de columnas sigue bloqueado hasta recuperar la coincidencia. La lectura normal conserva el filtro estricto. No se modifica Zona 1 automáticamente al editar IDNS en MP, según decisión del usuario.
- El alta legacy de Zona 1 permanece cerrada y, si llegara a habilitarse, acepta exclusivamente los 108 campos de facturación; la ampliación de edición no amplía el alta.
- Se renovaron las versiones de assets para evitar conservar el cliente de ocho/cinco campos en caché.

## Verificación realizada

- Suite completa `npm test` local: 1266 pruebas unitarias, 216 de validación, 60 de backend y 14 de contratos; todas pasaron. Validadores de almacenamiento terminaron sin error.
- Pruebas nuevas verifican listas 15/11/124, persistencia VA con la misma conexión, reversión MP→VA, acceso a filas desajustadas solo en reparación por FK/alcance y bloqueo de facturas en esas filas.
- `git diff --check` no reportó errores de whitespace. No hubo escrituras en Aiven ni despliegue.

## Pendientes antes de autorizar producción

1. Validar en entorno no productivo contra el esquema y datos reales de Aiven: cambios de cada tipo, rollback/auditoría, relación MP↔VA, reparación de identidad y consultas bajo carga. Las pruebas actuales son locales con conexiones simuladas.
2. Medir planes e índices de las consultas de relaciones y el costo de recalcular proyectos de hasta 100 VA. Confirmar comportamiento de proyectos mayores y concurrencia entre editores sin saturar Aiven; el límite actual rechaza la operación para evitar una actualización parcial.
3. Programar la actualización diaria de derivados sensibles al paso del tiempo (`dias_vencimiento`, `estatus` y acumulados) y reconciliar gradualmente valores históricos. Una edición humana sí persiste derivados, pero el cambio de día por sí solo aún no dispara escrituras.
4. Ejecutar conciliación/backfill controlado de derivados ya almacenados y verificar consumidores de otros módulos antes del corte de producción.

Si cualquier validación falla, mantener o activar las banderas de apagado; no elevar estos cambios directamente a `main`/producción basándose solo en la suite local.
