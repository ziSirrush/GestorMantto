# FIX INT-10 · Blindaje B2 — Resiliencia del Catálogo General · V001

**Fecha:** 17/10/2026  
**Repositorio oficial:** `ziSirrush/GestorMantto` — `main`  
**Commit base verificado en GitHub:** `987439d7b7658e6cbad6edfdd871f4ae9a36465e`  
**Base acumulativa:** FIX B1 `FIX_INT10_B1_CONTINUIDAD_CATALOGO_V001.zip`.  
**Estado:** entrega local preparada; **no aplicada, no publicada**.

## Propósito y dependencia de B1

B2 se generó **sobre los archivos completos de B1**. El código de B1 aún no figuraba en `main` al preparar esta entrega. Por ello, el ZIP B2 **incluye el comportamiento B1**: si no se aplicó B1, se puede usar directamente B2 sobre la revisión oficial indicada, previa comprobación de conflictos; si ya se aplicó B1, B2 lo actualiza. **No aplicar B1 después de B2**, pues revertiría los reintentos.

## Cambios B2

- **GET de fotografías, navegación y alcance para Gestor de Fotografías:** hasta **2 reintentos** tras el intento inicial, con esperas de **200 ms** y **400 ms**. Se reintenta únicamente ante error de red (`TypeError`), HTTP **408/429** o HTTP **5xx**.
- **No** reintenta 401/403, otros 4xx, errores de contrato, contenido `200` no JSON ni operaciones de escritura. Sesión/revisión invalidadas interrumpen reintentos pendientes.
- **Paginación verificada:** exige `ok:true`, `limit:500`, `offset` exacto, arreglos válidos y máximo 500 registros por origen y página; cada foto requiere `id_photo` y proyecto. Rechaza IDs fotográficos repetidos **dentro del mismo origen** entre páginas. Conserva el tope de **100 páginas** y la salida segura ante respuestas incompatibles o incompletas.
- **Guards independientes:** si la lectura de navegación/gestión no se confirma, no presenta sus controles de acceso; una recuperación temporal sí restablece esos controles después de verificarlos.
- **Continuidad B1 preservada:** ante agotamiento de reintentos se mantiene el último catálogo COMPLETO de la sesión, en **solo lectura**. Ante 401/403 de la galería, cambio de identidad o revocación, se borra el respaldo y se bloquea.
- No altera mapa, equivalencias, 7 fotos CORELLIAN + 7 UNITED, motor de subida, tablas, permisos existentes ni backend.

**Límite técnico:** varias peticiones paginadas no forman un snapshot transaccional. La validación evita duplicados detectables y contratos inválidos, pero no garantiza detectar omisiones por cambios concurrentes entre páginas; esto requiere una decisión de contrato backend si fuese exigible.

## Archivos completos incluidos (solo modificados o nuevos)

| Ruta | Motivo |
|---|---|
| `modules/ventas-fotos-mapa/ventas-fotos-mapa.js` | Reintentos B2 y validación de páginas; conserva B1 y Gestor |
| `core/module-loader.js` | Invalidación de caché del JS del módulo exclusivamente |
| `index.html` | Invalidación de caché de `core/module-loader.js` exclusivamente |
| `tests/int10-b1-continuidad.test.js` | Fixtures acordes al contrato real, temporizador de simulación y nueva versión |
| `tests/int10-gestor-fotografias-guard.test.js` | Actualización de la aserción del flujo vigente y caché |
| `tests/int10-b2-resiliencia.test.js` | Pruebas de reintentos, contrato, paginación, seguridad y continuidad |
| `README_FIX_INT10_B2_RESILIENCIA_V001.md` | Documento de instalación/verificación |

**Sin** `.patch`, `.diff`, ejecutores, carpetas de dependencias, SQL o archivos de otros módulos.

## Verificación realizada

- Código fuente verificado con GitHub `main` y B1 anterior; los archivos de backend de apoyo de las pruebas coincidieron con los Git blob SHA de `main` y **NO** se incluyen en este ZIP.
- `node --check`: **PASS** (JavaScript del módulo, módulo cargador y pruebas).
- `node --test tests/int10-b1-continuidad.test.js tests/int10-b2-resiliencia.test.js tests/int10-gestor-fotografias-guard.test.js`: **42/42 PASS** (pruebas simuladas de API/DOM; no E2E).
- Integridad y nombres de las rutas del ZIP: verificados.
- **No ejecutado:** despliegue, navegador autenticado, PWA física, pruebas sobre Aiven/Azure ni E2E en producción.

## Aplicación manual

1. Verificar `main`/carpeta local contra el **commit base** antes de reemplazar archivos completos; si hay commits o modificaciones posteriores, hacer conciliación manual y no sobrescribirlos a ciegas.
2. Extraer este ZIP **en la raíz del repositorio**, manteniendo las rutas; revisar `git diff` y ejecutar los tres tests anteriores desde la raíz del repositorio real (incluye los archivos de backend que usan algunos tests).
3. Probar en **Local → GitHub Pages**, especialmente caída de página 2, recuperación 503, error 403, cambio de identidad y edición con Gestor de Fotografías. Tras autorización explícita, desplegar manualmente a **Netlify**.
4. Reversión: restaurar `modules/ventas-fotos-mapa/ventas-fotos-mapa.js`, `core/module-loader.js` e `index.html` desde B1; restaurar pruebas B1 y retirar la nueva prueba B2. Si no se aplicó B1 previamente, restaurar el estado base de GitHub confirmado. No revertir datos.

**SQL: NO SE REQUIERE.** Solo frontend; **NO necesita actualizar Azure**.  
**Sistemas modificados:** únicamente los archivos locales de esta entrega. **GitHub, Aiven, Azure, GitHub Pages y Netlify: sin cambios.**

## SHA-256 de los archivos de código y prueba

- `modules/ventas-fotos-mapa/ventas-fotos-mapa.js` — `f81063dd2eb7f1279b1738e52bad857f1aabf4a0f93f25dd23040439d3554849`
- `core/module-loader.js` — `5ef912c8a45976617ba99348eeaae125b095ab77ab24d40e85bf55d2465ff8d1`
- `index.html` — `30942356a1286488ff3b5c25d379ca48fc0e92786a2b0118371047d3b26f8eb8`
- `tests/int10-b1-continuidad.test.js` — `eb994d1fc6edc8004760ffdbd9ea06a6e8d4ae8a6a07fe62b2d3c33aa0e87e83`
- `tests/int10-gestor-fotografias-guard.test.js` — `a6b80d7f26e25db8f172543f80276e6b1b6836a383b0265fed8e7cd761cdcf07`
- `tests/int10-b2-resiliencia.test.js` — `7cd3bea0fdf9c1e328945fb71cbe4dbde7a5f9a578a9717ec95dde2b35f93978`
