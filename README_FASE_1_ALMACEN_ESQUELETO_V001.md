# Fase 1 - Almacén - Esqueleto visual V001

Fecha: 28/08/2026  
Proyecto: Mantto Gestor  
Alcance: frontend estructural únicamente

## Objetivo

Integrar la nueva estructura funcional de **Almacén** en Mantto Gestor sin conectar todavía base de datos, backend, Google Sheets, NetSuite ni información simulada.

La estructura queda consolidada en seis módulos principales:

1. Dashboard
2. Inventario
   - Inventario
   - Por Empresa
   - Por Almacén
   - Top
3. Stock
4. Préstamos
5. Resguardos
6. Auditoría

La antigua vista independiente **Búsqueda** queda integrada dentro del tab **Inventario**.

## Regla visual de esta fase

Todo bloque que dependa de información muestra explícitamente:

**Pend. Información**

No se inventan registros, KPIs, totales, porcentajes, almacenes, artículos ni resultados.

## Eliminado del prototipo

No se integra ninguna de estas piezas del HTML de referencia:

- login/PIN propio;
- usuarios locales;
- `localStorage` de sesión;
- carga manual de Excel;
- SheetJS / `XLSX`;
- drag & drop de archivos;
- parsers de Excel;
- datos simulados;
- persistencia local de auditorías;
- persistencia local de criticidades;
- cálculos reales de Stock;
- consultas a backend;
- consultas a Aiven;
- llamadas `fetch()`;
- altas o cambios de tablas/columnas.

Mantto Gestor conserva su sesión y navegación global existentes.

## Archivos nuevos

- `modules/almacen/almacen.js`
- `modules/almacen/almacen.css`

## Archivos existentes afectados al aplicar

- `index.html`
- `core/module-loader.js`
- `core/router.js`

Para mantener el entregable incremental y evitar reemplazar archivos globales con copias que puedan quedar desactualizadas, este paquete incluye `aplicar_fase_1_almacen.py`, que modifica únicamente los bloques exactos necesarios sobre el worktree actual.

## Permisos - Fase 1 sin BD

**No se crean permisos nuevos en Aiven en esta fase.**

El `main` revisado ya tenía tres identificadores visuales de Almacén. Para no inventar códigos nuevos, los seis accesos reutilizan temporalmente esos identificadores:

| Módulo | `data-permission` temporal |
|---|---|
| Dashboard | `almacen_dashboard` |
| Inventario | `almacen_inventarios` |
| Stock | `almacen_movimientos` |
| Préstamos | `almacen_movimientos` |
| Resguardos | `almacen_movimientos` |
| Auditoría | `almacen_movimientos` |

Esto es **alias temporal de Fase 1**, no el diseño final de permisos. Cuando se autorice la fase de permisos/BD se deberán mapear códigos definitivos usando la estructura existente, sin crear un sistema paralelo.

## Cómo aplicar en local

1. Extraer este ZIP en la raíz del repositorio conservando las carpetas.
2. Confirmar que existan:
   - `modules/almacen/almacen.js`
   - `modules/almacen/almacen.css`
3. Desde la raíz del repo ejecutar:

```powershell
python .\aplicar_fase_1_almacen.py
```

4. Revisar:

```powershell
git diff -- index.html core/module-loader.js core/router.js modules/almacen/almacen.js modules/almacen/almacen.css
```

5. Probar en Local antes de promover a GitHub Pages.

## Validación realizada en este entregable

- Sintaxis estática de `modules/almacen/almacen.js` con Node.
- Verificación de ausencia de `fetch(`, `XLSX`, `localStorage`, `sessionStorage` y endpoints dentro del módulo nuevo.
- Verificación de que las seis rutas y los cuatro tabs internos de Inventario estén definidos en el módulo.

**No se ejecutó una prueba E2E en Mantto Gestor.**  
**No se probó contra Aiven.**  
**No se modificó GitHub.**  
**No se modificó Aiven.**  
**No se modificó Azure.**  
**No se desplegó Netlify.**

## Resultado esperado después de aplicar

En el grupo lateral **Almacén** deben aparecer:

- Dashboard
- Inventario
- Stock
- Préstamos
- Resguardos
- Auditoría

Cada acceso debe abrir una vista real de Almacén, no el placeholder genérico de Mantto Gestor. Las pantallas deben mostrar su estructura visual y la leyenda **Pend. Información**.
