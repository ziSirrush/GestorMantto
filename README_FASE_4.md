# BLT NOW | Cobranza UNITED / Administración / gestion_credito
## FASE 4/6 — V001 — 23/10/2026

**Repositorio base verificado:** `ziSirrush/GestorMantto`, rama `main`, commit `6889a51a770c70f16c9baf2fbe122c26359e0dc4` (Version 102226.1). **Dependencia:** fases 1, 2 y 3. El ZIP contiene los archivos COMPLETOS acumulados de F1–F4, con rutas de repositorio. No son fragmentos ni archivos `.patch`.

### Implementación F4

- `gestion_credito`: permite editar directamente las **20 columnas autorizadas**, incluido `idns`. Una celda se abre con doble clic o Enter; confirma al salir del campo/Enter; Esc cancela. El backend siempre revalida la escritura.
- Edición múltiple: **un mismo campo** aplicado a entre 2 y 20 registros por operación, con selección tipo Excel y confirmación del usuario. Valores vacíos solo por opción explícita `NULL`.
- Protección absoluta de `id_gc` (PK), `id_proyecto_cobranza` (FK) y los siete campos automáticos. Los cálculos **no se escriben ni se alteran** en F4.
- Validación server-side con lista blanca, tipos `VARCHAR`, `INT`, `DECIMAL(18,2)`, longitudes, magnitudes y BIGINT como texto (evita pérdida de precisión).
- Nuevos endpoints HTTP, agregados al router administrativo de F2/F3 (con `humanInformationGuard_gnral` y puerta UNITED/COBRANZA_UNI):
  - `PATCH /api/cobranza-uni/administracion/tablas/gestion_credito/registros/:id`
  - `PATCH /api/cobranza-uni/administracion/tablas/gestion_credito/registros/edicion-multiple`
- Permisos efectivos **ACCESO_VISUAL + GC.VER + GC.EDITAR** exigidos por backend, además del motor oficial de **alcance territorial por registro**. El modo visor no puede escribir. No se copian permisos de otros módulos.
- Edición bajo transacción MySQL + `SELECT ... FOR UPDATE` + validación del **valor original** `expected` (conflicto HTTP 409 si otro proceso modificó la celda). Lotes completamente atómicos.
- Cuando cambia `proyecto`, se comprueba DESPUÉS del UPDATE y ANTES de COMMIT que la identidad oficial y `id_proyecto_cobranza` siguen siendo válidos y el alcance permanece autorizado. De no ser así, se ejecuta ROLLBACK.
- Auditoría de cada celda realmente modificada, con valores antes/después, actor, método y ruta, mediante `usuario_interacciones` **en la misma transacción**. Si falla la auditoría, se cancela el UPDATE.
- No cambia `/sync` ni consulta/vistas actuales GC, VA, MP. Sin escrituras en `pc` o `detalle_mp_2026`.

### IMPORTANTE — No publicar Fase 4 aislada

**Las siete fórmulas automáticas se integran en Fase 5.** Si ahora se modifica un campo de origen de cálculo (`montp_mp`, `monto_va`, `facturas_mp`, `facturas_va`, `categoria` o `recuento_no_equipos`), sus columnas derivadas NO se recalculan todavía. **No activar la escritura frente a datos operativos hasta instalar y validar Fase 5.** La UI lo advierte expresamente. Fase 6 verificará convivencia con las sincronizaciones GAS y análisis integral de auditoría/regresión; `/sync` podría sobrescribir cambios administrativos posteriores. No hay sincronización de edición de `idns` a otras tablas.

### Dependencia de navegación heredada de F2

El repo `main` revisado **no tiene aún montada la ruta nueva** en `index.html`, `core/router.js`, `core/module-loader.js`. Para que el Main y el editor se vean dentro de BLT NOW, sigue siendo necesaria la integración del cascarón documentada en `README_FASE_2.md` o la integración equivalente ya realizada en tu copia local. **Este ZIP no trae versiones parciales de esos archivos y no afirma que la navegación esté ya integrada.** No sobrescribir archivos compartidos de tu versión local por otros antiguos. Mantener el orden de montaje descrito en F2.

### Archivos nuevos F4 (completos)

- `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.gc-edit-validation.js`
- `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.gc-edit-service.js`
- `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.gc-edit-audit.js`
- `tests/cobranza-uni-administracion-fase4.test.js`

### Archivos actualizados F4 (completos)

- `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.routes.js`
- `modules/cobranza-uni/administracion/gestion-credito/gestion-credito.js`
- `modules/cobranza-uni/administracion/gestion-credito/gestion-credito.css`
- `modules/cobranza-uni/administracion/main/main.js`
- `tests/cobranza-uni-administracion-fase2.test.js` y `tests/cobranza-uni-administracion-fase3.test.js` (actualizados para no exigir que F4 carezca de rutas de escritura).

### Verificaciones

- Tests Node F1–F4: **29 de 29 correctos**, sin conectar a Aiven.
- `node --check` de JS F4: correcto.
- Auditoría, conflicto y rollback verificados con MySQL simulado dentro de los tests. No se ejecutaron escrituras reales, migración SQL, commits, push ni despliegues.
- **No verificado:** ejecución en Aiven ni HTTP autenticado real; el navegador Chromium estuvo bloqueado por el entorno de pruebas al abrir la vista, de modo que **no hay una validación visual end-to-end certificada**.

### Normas de entrega BLT NOW

ZIP con archivos **completos** y rutas originales + README. Sin instaladores, `.patch` ni scripts aplicadores. No se modifica Aiven ni GitHub, no se efectúan commits, push, publicación ni despliegue. Revisar el HEAD local y sus diferencias antes de integrar; si `main` avanzó respecto a la base señalada, reconciliar los archivos antes de copiar.

**Próxima fase:** F5, motor y persistencia segura de las siete fórmulas.
