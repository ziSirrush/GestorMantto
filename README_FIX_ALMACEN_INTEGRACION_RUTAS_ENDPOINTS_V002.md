# FIX Almacén — Integración rutas + endpoints V002

**Fecha:** 30/08/2026  
**Proyecto:** Mantto Gestor  
**Repositorio base:** `ziSirrush/GestorMantto`  
**Rama base:** `main`

## Corrección de V001

V001 quedó mal empaquetado: contenía el aplicador y archivos auxiliares, pero no incluía las copias finales completas de los archivos modificados.

V002 corrige ese problema. Este ZIP **sí contiene los cinco archivos completos modificados, respetando sus rutas reales del repositorio**.

## Base verificada antes de aplicar el FIX

Los cinco archivos base fueron reconstruidos desde `main` y comparados por Git blob SHA antes de aplicar cambios:

| Archivo | Git blob SHA de `main` usado como base |
|---|---|
| `index.html` | `893936272384c4e670158f6e5c0e52de74332e0d` |
| `core/module-loader.js` | `49aada2274fba00fd0caa604da41c416fdc30bcb` |
| `core/router.js` | `4bc7373bf6dca751409755f3d5981238445d0c7c` |
| `backend/src/routes/index.js` | `3209bd36d13e06865e5d93ff11d0368776b954c3` |
| `backend/src/modules/almacen/almacen.routes.js` | `a6666b88f3cb665e907be97667122d67e427fb85` |

## Problema corregido

La lógica nueva de Gestión de Almacén ya existe en `modules/almacen/almacen.js`, pero la integración global de `main` estaba incompleta:

- el panel lateral todavía mostraba Dashboard, Inventarios y Movimientos;
- `Inventarios` navegaba a `almacen-inventarios`, mientras el módulo real usa `almacen-inventario`;
- `Movimientos Almacén` seguía expuesto aunque no forma parte de la estructura nueva;
- faltaban Stock, Préstamos, Resguardos y Auditoría;
- faltaban los seis contenedores `view-almacen-*`;
- `core/module-loader.js` no registraba las seis rutas;
- `core/router.js` no despachaba las rutas a `window.ManttoAlmacen.init(route)`;
- `backend/src/routes/index.js` no montaba `almacen.routes.js` en `/almacen`;
- Stock, Préstamos, Resguardos y Auditoría compartían un único guard legado.

## Estructura final de Almacén

1. Dashboard Almacén → `almacen-dashboard`
2. Inventario → `almacen-inventario`
3. Stock → `almacen-stock`
4. Préstamos → `almacen-prestamos`
5. Resguardos → `almacen-resguardos`
6. Auditoría → `almacen-auditoria`

Todas estas rutas cargan `modules/almacen/almacen.js` y `modules/almacen/almacen.css` mediante el lazy loader existente.

## Permisos utilizados

Frontend:

- `almacen_dashboard`
- `almacen_inventarios`
- `almacen_stock`
- `almacen_prestamos`
- `almacen_resguardos`
- `almacen_auditoria`

Backend:

- Dashboard: `ALMACEN_DASHBOARD_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`
- Inventario: `ALMACEN_INVENTARIOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`
- Stock: `ALMACEN_MOVIMIENTOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL` — se conserva temporalmente el código histórico reutilizado para Stock.
- Préstamos: `ALMACEN_PRESTAMOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`
- Resguardos: `ALMACEN_RESGUARDOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`
- Auditoría: `ALMACEN_AUDITORIA_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`

## Archivos completos incluidos y modificados

```text
index.html
core/module-loader.js
core/router.js
backend/src/routes/index.js
backend/src/modules/almacen/almacen.routes.js
```

No modifica:

```text
modules/almacen/almacen.js
modules/almacen/almacen.css
backend/src/modules/almacen/almacen.service.js
```

## Cómo aplicar

### Opción 1 — Sustitución de los cinco archivos

Desde este ZIP copia los cinco archivos sobre las mismas rutas de tu repo local y revisa:

```powershell
git diff -- index.html core/module-loader.js core/router.js backend/src/routes/index.js backend/src/modules/almacen/almacen.routes.js
```

### Opción 2 — Aplicador fail-closed

Copia `aplicar_fix_almacen_integracion_v002.py` a la raíz de tu repo `GestorMantto` y ejecuta:

```powershell
python .\aplicar_fix_almacen_integracion_v002.py
```

El aplicador primero valida todos los anchors en memoria y solo después escribe. Si detecta una estructura distinta o una aplicación parcial no reconocida, se detiene.

## Validaciones realizadas al generar V002

- Base comparada contra los Git blob SHA de `main`: **OK**.
- `node --check core/module-loader.js`: **OK**.
- `node --check core/router.js`: **OK**.
- `node --check backend/src/routes/index.js`: **OK**.
- `node --check backend/src/modules/almacen/almacen.routes.js`: **OK**.
- Seis botones de Almacén: **OK**.
- Seis `view-almacen-*`: **OK**.
- Seis rutas en lazy loader: **OK**.
- Despacho `showAlmacen(route)`: **OK**.
- Mount backend `/almacen`: **OK**.
- Separación de guards Préstamos/Resguardos/Auditoría: **OK**.
- Segunda ejecución del aplicador sin cambios: **OK / idempotente**.

## Archivos auxiliares

- `CAMBIOS_V002.patch`: diff exacto contra la base verificada de `main`.
- `MANIFEST_SHA256.txt`: hashes SHA-256 de los archivos entregados.
- `validar_fix_almacen.sql`: consultas **solo lectura** para revisar catálogo/permisos en Aiven.

## Alcance

Este paquete no ejecuta `git commit`, `git push`, despliegues ni escrituras en Aiven/Azure/Netlify.

No puedo confirmar el resultado funcional en tu Aiven/Azure hasta que el FIX se aplique y se pruebe en ese entorno. El paquete sí fue validado estáticamente contra la estructura de `main` usada como base.
