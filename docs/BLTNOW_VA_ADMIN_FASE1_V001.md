# BLT NOW — Cobranza UNITED — Administración — Venta Adicional — Fase 1 V001

Base comprobada: `ziSirrush/GestorMantto`, rama `main`, commit `a9098077bdcb3bae54e0e5ea71c81ef20874e9f8` (Version 102326.3, 23/oct/2026).

## Alcance

Contrato **declarativo** de `pc` incorporado sin tocar las rutas funcionales actuales:

- **31 campos** de Aiven y **30 encabezados** Sheets A:AD; `id_proyecto_cobranza` es columna adicional de Aiven.
- 15 campos de entrada editables **en fases posteriores**, 14 calculados y `id_pc`/`id_proyecto_cobranza` protegidos.
- Tipos MySQL conservados, FK a `cobranza_proyectos`, colacion y relaciones sin migraciones.
- BUSCARV mixto declarado: ID de proyecto validado -> proyecto inequívoco -> cliente SOLO para `terminos` si condiciones coinciden; referencias MP: `condiciones_pago`, `z_oper`, `estado`, `estatus_cartera`.
- Reglas declaradas: 16% IVA, `RECIBO` exento de multiplicador, fecha actual CDMX, 0 días = vencimiento en la fecha de factura, ausencia de factura -> fecha vencimiento NULL, importes y facturas acumulados por proyecto sin duplicar KPI.
- `id_pc` **NO** es AUTO_INCREMENT. Definir mecanismo de alta en Fase 6.
- Eliminación de activador GAS **NO** ejecutada; retirada solo tras sustitución funcional y autorización.

## Archivo por archivo

- `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-contract.js` — nuevo contrato puro de `pc`.
- `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.constants.js` — carga el contrato nuevo y declara esquema `pc` listo, mantiene GC intacto.
- `tests/cobranza-uni-administracion-venta-adicional-fase1.test.js` — nuevo test, sin Aiven.
- `tests/cobranza-uni-administracion-fase1.test.js` — actualiza el test antiguo que asumía que `pc` no tenía contrato.

## Instalación **local** sin publicar

Desde la raíz del repositorio, extraer el contenido de este ZIP conservando la estructura de carpetas. **No** ejecutar desde la carpeta `backend` para copiar a raíz. Ejecutar:

```powershell
node --test tests/cobranza-uni-administracion-fase1.test.js tests/cobranza-uni-administracion-venta-adicional-fase1.test.js
git status --short
```

Opcional: revisar otras pruebas con `node --test tests/cobranza-uni-administracion-*.test.js`.

No contiene `.sql`, `.patch`, instaladores, cambios de base de datos ni escrituras GitHub; no hacer `git add -f`.

**Validación local en copia parcial:** 59/59 tests del grupo Administración; no equivale a una ejecución CI en un checkout completo.
