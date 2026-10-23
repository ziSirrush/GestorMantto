# BLT NOW | Cobranza UNI / Administración | Fase 1/6 - V001

**Base revisada:** `ziSirrush/GestorMantto` rama `main`, commit `6889a51a770c70f16c9baf2fbe122c26359e0dc4` (versión 102226.1, 22/10/2026 UTC).

## Alcance entregado

- Contrato técnico de las tres tablas: `gestion_credito`, `pc`, `detalle_mp_2026`, con sus claves primarias reales.
- Catálogo completo de las 29 columnas de `gestion_credito`, obtenido del `CREATE TABLE` compartido por Joseph; 20 editables (incluye `idns`), 2 protegidas (`id_gc`, `id_proyecto_cobranza`) y 7 automáticas.
- Metadatos de dependencias para las siete columnas calculadas. **Todavía no se ejecutan fórmulas**; se implementarán y validarán en fases posteriores.
- Estructura frontend aislada para el futuro Main, sin navegación ni edición de datos.
- Pruebas automáticas de contrato y aislamiento.

## Archivos completos para incorporar en las mismas rutas del repositorio

1. `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.constants.js`
2. `modules/cobranza-uni/administracion/main/main.js`
3. `modules/cobranza-uni/administracion/main/main.css`
4. `tests/cobranza-uni-administracion-fase1.test.js`

**Aplicación:** incorporar los cuatro archivos respetando su ubicación. No se sustituyen archivos existentes en esta fase. Revisar diferencias si el repositorio local avanzó desde el commit indicado.

**Validaciones realizadas:** sintaxis JS de backend y frontend: OK; `node --test tests/cobranza-uni-administracion-fase1.test.js`: **5/5 pruebas correctas** (sin conexión a Aiven).

## Fuera de alcance de Fase 1

- Sin cambios de `index.html`, `core/router.js`, `core/module-loader.js`, permisos ni endpoints (Fase 2).
- Sin editor tipo Excel, consultas, escritura en MySQL, guardado masivo, auditoría o cálculo automático (Fases 3 a 6).
- Las columnas de `pc` y `detalle_mp_2026` se definirán cuando se validen sus esquemas.
- Sin modificaciones en Aiven, sin commit, push, despliegue o publicación.

**Observación de integración futura:** la ruta actual de sincronización de Gestión de Crédito puede actualizar campos derivados; el motor de cálculo de Fase 5 y la protección de sincronización deberán coordinarse, sin alterar las integraciones existentes.
