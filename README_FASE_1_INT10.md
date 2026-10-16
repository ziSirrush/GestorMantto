# FASE 1 | INT-10 | FOTOGRAFÍAS — MAPA DE MÉXICO | V001

**Estado:** Entregado como ZIP de archivos completos. NO aplicado, NO desplegado.
**Origen verificado:** `JIVMBLT/updated_code` — `main` SHA `70186ce81f5bf4c5d94d80caae088f6d1596538b` (16/10/2026).
**Destino verificado:** `ziSirrush/GestorMantto` — `main` SHA `d2eb24514c2ee5726ee215d6c9fb36daadd66bb3` (15/10/2026).
**Norma:** `PROJECT_CONSTITUTION.md` v2.0, apartados 7, 8, 12, 17, 19 y 23.

## Qué cambia en esta Fase 1 (operacional)

- El Catálogo General de Fotografías abre con mapa interactivo de las 32 entidades federativas de México.
- El mapa colorea estados por **cantidad de proyectos con fotografías**, ofrece tooltip, interacción de clic/teclado y ranking lateral clicable.
- Al elegir un estado aparecen sus mosaicos; clic en miniatura abre el **carrusel ya existente**.
- Se conserva búsqueda por proyecto/ID/cliente (global o restringida al estado elegido), botón para volver al mapa y grupo `Sin estado reconocido`.
- KPIs visibles: proyectos con foto, estados con foto y carretes unidos por equivalencia.
- La carga de CSS y geometría es **local al módulo**, sin modificar `core/module-loader.js` ni `index.html` en esta fase.
- La geometría proviene de `@svg-maps/mexico` 2.0.0 (Victor Cazanave), con crédito **CC BY 4.0** en archivo y pantalla. Se redujeron trazos visuales con tolerancia 0.75 en coordenadas del `viewBox 793x498`; no es una copia binaria idéntica al LAB.
- Si falla la carga del mapa, el catálogo conserva su listado original de proyectos como respaldo visual.
- Se sustituye el texto visible `Aiven conectado` / el semáforo técnico por una **descripción funcional**, conforme al apartado 17 constitucional.

## Archivos completos a incorporar (conservar la misma estructura de carpetas)

- `modules/ventas-fotos-mapa/ventas-fotos-mapa.js` — MODIFICADO.
- `modules/ventas-fotos-mapa/ventas-fotos-mapa.html` — MODIFICADO.
- `modules/ventas-fotos-mapa/ventas-fotos-mapa-mexico.css` — NUEVO.
- `modules/ventas-fotos-mapa/mexico-estados.js` — NUEVO.

**No se incluye ningún `.patch`, `.diff`, instalador, ejecutor ni preparador.** El ZIP contiene únicamente los archivos terminados y esta documentación.

## Compatibilidad y límites

- **Backend:** sin cambios. La versión principal ya dispone de endpoints:
  - `GET /api/ventas/fotos-mapa/catalogo-general/fotografias`
  - `GET /api/ventas/fotos-mapa/catalogo-general/navegacion-corellian`
  - `GET /api/ventas/fotos-mapa/catalogo-general/navegacion-united`
- **Datos:** Aiven por el backend de Azure; no se importan SQLite, semillas ficticias ni migraciones LAB 020.
- **Permisos:** sin cambios. Conserva la puerta funcional GENERAL y los alcances de navegación por dominio existentes. No atribuir permisos del LAB al rol DG en Aiven sin revisión/autorización (Fase 3).
- **Carrusel:** conserva la corrección del Gestor principal para `change.type==='deleted'` y cambio de foto principal.
- **Módulos ajenos:** intactos. `core/details.js` intacto.
- **Cache/PWA:** el HTML y recursos nuevos tienen versionado local. La versión de URL que carga el JS principal en `module-loader` NO se cambia hasta la Fase 3; si una sesión de navegador conserva el JS antiguo, requiere recarga forzada para validar la Fase 1.
- **Alcances pendientes:** Fase 2 integrará/ajustará comportamiento y datos entre dominios cuando corresponda; Fase 3 verificará permisos, carga, caché y navegación global. Ninguna de esas fases se declara completada aquí.
- **Nota de límite del catálogo:** el endpoint existente consulta hasta 5,000 filas por origen; no se modifica ese contrato en la Fase 1.

## Verificaciones de entrega (no cuentan como fase operacional adicional)

- `node --check` del JavaScript del módulo y de la geometría: **PASS** (sintaxis).
- Geometría: 32 IDs únicos; rutas SVG y crédito verificables por lectura/ejecución estática.
- Contratos de backend y carga de proyecto: inspeccionados en GitHub main.
- No se efectuó acceso a Aiven real ni despliegue Local/GitHub Pages/Netlify.
- **Pendiente:** prueba en navegador autenticado con datos reales y permisos DG / limitados, PWA móvil, navegación por proyecto, fotos principales y regresión de edición/borrado. Se intentó una prueba automatizada con Chromium headless en el entorno de preparación, pero el proceso quedó bloqueado antes de devolver resultados; **no se registra como PASS ni como prueba E2E ejecutada**.

## Instalación manual habitual (sin instalador)

Extraer las carpetas del ZIP en la raíz del repositorio local **después de verificar el SHA/estado actual**; solo se sustituyen los dos archivos existentes y se incorporan dos nuevos. Ejecutar validaciones propias antes de promover mediante el flujo Local → GitHub Pages → Netlify (manual).

## Estado externo

GitHub, Aiven, Azure y Netlify: **SIN MODIFICACIONES**.

## Reversión manual

Restaurar desde Git los **dos archivos modificados** (`ventas-fotos-mapa.js` y `ventas-fotos-mapa.html`) y retirar los **dos archivos nuevos** (`mexico-estados.js` y `ventas-fotos-mapa-mexico.css`) de la copia donde se haya integrado. Validar antes de publicar; no hace falta modificar Aiven ni Azure.
