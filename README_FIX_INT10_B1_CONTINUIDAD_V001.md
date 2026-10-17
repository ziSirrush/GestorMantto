# INT-10 · Blindaje B1 · Continuidad del Catálogo General · V001

**Fecha:** 17/10/2026  
**Repositorio oficial:** `ziSirrush/GestorMantto`, rama `main`  
**Commit base verificado:** `987439d7b7658e6cbad6edfdd871f4ae9a36465e`  
**Estado:** ZIP de archivos completos preparado localmente. **NO aplicado ni desplegado**.

## Causa

Durante una actualización, `modules/ventas-fotos-mapa/ventas-fotos-mapa.js` vaciaba el Catálogo General ante cualquier error de consulta (conexión, backend o paginación), incluso después de haber cargado previamente un catálogo íntegro.

## Corrección B1

- Conserva **en memoria de la sesión actual** el último Catálogo General completo confirmado (CORELLIAN y UNITED) cuando una actualización falla de forma transitoria. No muestra páginas parciales como si fueran completas.
- Identifica claramente los datos retenidos: **«se muestran los últimos resultados válidos (solo lectura)»**.
- Cuando una actualización falla, **deshabilita la navegación y gestión basada en guards de la consulta anterior**; el backend continúa autorizando toda mutación. Una nueva carga correcta recupera esos controles según los permisos vigentes.
- Si falla la **primera carga**, no muestra información inventada. Ante **HTTP 401/403 de la galería**, limpia el catálogo previo y cierra el carrusel activo. Se preserva la invalidación existente al cambiar identidad, sesión, Visor o permisos.
- Corrige la propagación del código HTTP cuando el servidor responde contenido no JSON (por ejemplo, HTML de error 403), para no tratarlo como falla temporal.
- **No implementa reintentos automáticos** (reservados para B2) ni modifica autenticación, guards, mapas, equivalencias, motor fotográfico o límite de **7 + 7 = 14**.

**Alcance del respaldo:** solo memoria de la pestaña y usuario efectivo. No se guarda en `localStorage` ni en `sessionStorage`, y no se conserva tras recargar completamente el navegador. Ante cambio de identidad, expira inmediatamente.

## Archivos completos incluidos

| Ruta relativa | Cambio |
|---|---|
| `modules/ventas-fotos-mapa/ventas-fotos-mapa.js` | Continuidad ante fallo transitorio; denegación 401/403; aviso de solo lectura |
| `core/module-loader.js` | Nueva versión de caché únicamente para JS del Catálogo General |
| `index.html` | Nueva versión de caché para `core/module-loader.js` |
| `tests/int10-gestor-fotografias-guard.test.js` | Actualización de aserción de versión para evitar regresión falsa |
| `tests/int10-b1-continuidad.test.js` | Pruebas nuevas de continuidad, error parcial, recuperación e invalidación |
| `README_FIX_INT10_B1_CONTINUIDAD_V001.md` | Esta documentación |

No incluye parches, diffs, instaladores, scripts de despliegue ni archivos no afectados.

## Verificaciones ejecutadas

- Archivos originales cotejados por **Git blob SHA** con `main` antes del cambio.
- `node --check` de los JavaScript modificados y de las pruebas: **PASS**.
- `node --test tests/int10-gestor-fotografias-guard.test.js tests/int10-b1-continuidad.test.js`: **14/14 PASS**, con simulación de API/DOM.
- ZIP: validación de integridad y rutas originales.
- **No ejecutado:** pruebas E2E con usuarios productivos, consultas a Aiven real, despliegue a Netlify/GitHub Pages/Azure.

## Aplicación manual y reversión

1. Comparar el `main`/rama local con el **commit base**. Si ya cambió, conciliar los cambios antes de sustituir archivos completos.
2. Extraer el ZIP sobre la **raíz del repositorio local**, respetando rutas; revisar `git diff`.
3. Ejecutar las pruebas anteriores y validar en **Local → GitHub Pages**: carga válida, error de red tras carga válida, primera carga fallida, HTTP 401/403, retorno de conexión y cambio de usuario.
4. Tras validación y autorización, publicar **manualmente** a **Netlify**. **No requiere despliegue de Azure**.
5. Reversión: restaurar exclusivamente los cuatro archivos existentes desde el commit base y retirar `tests/int10-b1-continuidad.test.js`. No revertir datos.

**SQL:** **NO REQUIERE** (sin `ALTER`, `CREATE`, `UPDATE` ni migraciones).  
**Sistemas modificados:** solo archivos de entrega locales. **GitHub, Aiven, Azure, GitHub Pages y Netlify intactos**.
