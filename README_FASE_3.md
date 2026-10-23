# BLT NOW — Cobranza UNI / Administración / gestion_credito
## FASE 3/6 — V001 — 23/10/2026

**Base verificada:** `ziSirrush/GestorMantto`, rama `main`, commit `6889a51a770c70f16c9baf2fbe122c26359e0dc4` (Version 102226.1, 22/10/2026 UTC). **Dependencia:** estructura F1 y Main/permisos F2; este ZIP incluye los archivos completos y actualizados de esas fases, además de F3.

### Entregable
- Pantalla administrativa de `gestion_credito` con **29 columnas reales** (20 editables futuras, incluidos `idns`; 2 claves protegidas; 7 derivadas). En F3 la tabla **solo permite consultar**: no se guardan celdas todavía.
- Tabla tipo Excel con scroll horizontal/vertical, primera columna y encabezados fijos, búsqueda, filtro por cualquiera de las 29 columnas, orden por cada columna y paginación 25/50/100.
- GET `/api/cobranza-uni/administracion/tablas/gestion_credito/registros`: consulta parametrizada, lista blanca SQL, 100 registros máximo por página, CAST a texto de PK/FK BIGINT sin pérdida de precisión, y permiso de lectura independiente de `gestion_credito`.
- Mantiene el Guard oficial (sesión + permiso principal + puerta `UNITED/COBRANZA_UNI`) y el **motor de alcance territorial oficial** `buildCobranzaProjectScopeSql_uni`. No sustituye ni relaja el filtro de seguridad del módulo existente.
- El Main incorpora el editor F3 mediante `ManttoModuleLoader.loadStyle` y `loadScript` oficiales, sin exigir una modificación **adicional** al registro del cargador de F2.
- `pc` y `detalle_mp_2026` siguen siendo selectores sin editor; no se inventan sus columnas.

### Archivos modificados de fases previas (COMPLETOS)
- `modules/cobranza-uni/administracion/main/main.js` (ahora abre el editor GC F3).
- `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.routes.js` (nuevo GET GC protegido).

### Archivos nuevos de F3 (COMPLETOS)
- `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.gc-query.js`
- `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.gc-service.js`
- `modules/cobranza-uni/administracion/gestion-credito/gestion-credito.js`
- `modules/cobranza-uni/administracion/gestion-credito/gestion-credito.css`
- `tests/cobranza-uni-administracion-fase3.test.js`

### Dependencia de integración pendiente de F2 — IMPORTANTE
El repositorio `main` **aún no contiene** el Main administrativo. El ZIP de F2 no integraba `index.html`, `core/router.js` ni `core/module-loader.js`: el montaje sigue pendiente. **Antes de probar F3 en la aplicación, aplicar íntegramente las indicaciones del apartado “Integración del cascarón pendiente” de `README_FASE_2.md` sobre tu copia local actualizada.** Estas modificaciones compartidas no se incluyen como archivos incompletos ni scripts de reemplazo; solo se sustituyen archivos completos revisados.

Igualmente, sin el alta **manual y autorizada** del catálogo de los 7 permisos en MySQL (F2), y sin su asignación explícita desde Panel de Control, el backend deniega por diseño el acceso. No se ejecutó dicho SQL en Aiven.

### Validaciones
- `node --test tests/cobranza-uni-administracion-fase1.test.js tests/cobranza-uni-administracion-fase2.test.js tests/cobranza-uni-administracion-fase3.test.js`: **17/17 pruebas locales correctas**.
- `node --check` de todos los JS nuevos o modificados en el ZIP: correcto.
- Tests comprueban orden/filtro por lista blanca, escape de comodines, parámetros y paginación, conversión de BIGINT, alcance y permisos, esquema y ausencia de escrituras.
- **No probado**: HTTP real con sesión/permisos en Aiven, ejecución SQL de F2, navegación montada en una instancia completa. No afirmar esa integración como validada.

### Normas BLT NOW
Paquete ZIP con archivos completos y rutas originales; **sin .patch, instaladores ni aplicadores**. Sin modificar la base Aiven, sin commits, push, despliegues ni publicación. Antes de reemplazar archivos, comprobar que tu versión local no avanzó frente al commit revisado.

**Próxima F4:** editar exclusivamente los 20 campos autorizados con transacciones, auditoría y validación en backend. Los 7 cálculos se implementarán en F5 y NO deben adulterarse en F4.
