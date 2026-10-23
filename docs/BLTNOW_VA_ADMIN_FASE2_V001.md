# BLT NOW · UNITED → Cobranza → Administración → Venta Adicional · Fase 2 V001

**Base verificada:** `ziSirrush/GestorMantto`, rama `main`, commit `a9098077bdcb3bae54e0e5ea71c81ef20874e9f8` (Version 102326.3, 23/oct/2026). **Prerequisito:** haber integrado los archivos de `BLTNOW_Venta_Adicional_Administracion_Fase_1_V001.zip` (contrato `pc`, actualizado constants y test F1), además del panel lateral de Administración (ya existente en la base).

## Alcance entregado

- `GET /api/cobranza-uni/administracion/tablas/pc/registros`: 31 columnas de `pc`, **solo lectura**; requiere sesión, permiso principal de Administración, puerta UNITED/COBRANZA_UNI, **permiso independiente `COBRANZA_UNI_ADMINISTRACION_VENTA_ADICIONAL.VER`** y alcance territorial por fila desde `buildCobranzaProjectScopeSql_uni(req,'pc')`. El permiso EDITAR no concede VER.
- SELECT y COUNT paginados: filas por página 15/30/50/100 desde UI (backend máximo 100), búsqueda general, filtro por columna, ordenamiento por columna y `id_pc` como desempate. Columnas SQL por lista blanca; parámetros vinculados, LIKE con comodines escapados. BIGINT se devuelve como texto.
- Interfaz independiente de `pc` en Main. Diseño ancho (`max-width:none` solo para la vista `pc`), tabla con scroll horizontal y vertical, cabecera fija, consecutivo y proyecto fijos en escritorio, modos Resumen / Operación / Facturación / Cartera / 31 columnas. En móviles, controles adaptables sin comprimir columnas.
- Muestra **valores persistidos** en Aiven, sin inventar recálculos de fórmulas. No hay POST/PATCH/DELETE para `pc`, no hay altas, ni cambios en GAS.
- Se conservan Gestión de Crédito, MP, rutas de lectura legacy, sus permisos y su lógica de edición.

## Archivos en el ZIP (completos, respetar rutas)

1. `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.routes.js` — agrega un GET con doble control de permisos.
2. `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-query.js` — nuevo constructor de SQL SOLO SELECT/COUNT.
3. `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-service.js` — servicio de lectura paginada/alcance.
4. `modules/cobranza-uni/administracion/main/main.js` — incorpora carga diferida de la consulta `pc`.
5. `modules/cobranza-uni/administracion/venta-adicional/venta-adicional.js` — nueva pantalla de lectura.
6. `modules/cobranza-uni/administracion/venta-adicional/venta-adicional.css` — diseño amplio/scroll/responsive aislado.
7. `tests/cobranza-uni-administracion-venta-adicional-fase2.test.js` — pruebas sin Aiven.
8. `docs/BLTNOW_VA_ADMIN_FASE2_V001.md` — presente documento.

## Instalación y validación local (PowerShell, raíz del repositorio)

Extraer el ZIP conservando carpetas **desde la raíz** de `mantto_gestor_frontend` (no desde `backend`). **No afecta F1 si está instalada**. Después:

```powershell
node --check backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-query.js
node --check backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.pc-service.js
node --check backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.routes.js
node --check modules/cobranza-uni/administracion/main/main.js
node --check modules/cobranza-uni/administracion/venta-adicional/venta-adicional.js
node --test tests/cobranza-uni-administracion-venta-adicional-fase2.test.js
node --test tests/cobranza-uni-administracion-*.test.js
git status --short
```

**Validación local realizada** sobre copia parcial de código: 68/68 pruebas del grupo Administración; navegador Chromium con datos simulados: lectura, paginación, filtros, 31 columnas, cambios de grupo, vista escritorio y móvil, escape XSS y retorno al Main. **No equivale a ejecutar toda la CI en un checkout completo ni a una prueba en Aiven**.

## Restricciones BLT NOW

Sin instaladores, `.patch`, `.sql`, migraciones ni excepciones de `.gitignore`. **No** se hizo commit, push, despliegue, modificación de Aiven ni retirada de activador GAS. La desactivación de GAS se abordará únicamente en la transición autorizada de una fase posterior.
