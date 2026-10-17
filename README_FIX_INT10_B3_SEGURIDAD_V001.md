# FIX INT-10 | Blindaje B3 — Seguridad y validación | V001

**Fecha:** 17/10/2026  
**Proyecto:** Mantto Gestor · `ziSirrush/GestorMantto` (`main`)  
**Base GitHub contrastada:** `987439d7b7658e6cbad6edfdd871f4ae9a36465e`  
**Base funcional de entrega:** `FIX_INT10_B2_RESILIENCIA_PAGINACION_V001.zip` (**B1 + B2 incluidas**).  
**Estado:** archivos preparados y pruebas locales simuladas aprobadas; **no aplicado ni desplegado**.

## Corrección B3

1. **Sesión:** HTTP **401 de cualquier consulta INT-10**, incluso navegación CORELLIAN/UNITED o guard de gestión, invalida el catálogo en memoria. No se confunde con un 403 de un guard independiente.
2. **Catálogo sin permiso:** HTTP **401/403** de la lectura GENERAL descarta el respaldo, cierra el carrusel y anula revisiones selectivas pendientes para impedir que restauren fotos tras una revocación.
3. **Refresco selectivo:** un 401/403 al recargar las fotos de un proyecto anula completamente el catálogo y sale de la vista cuando esa es la ruta activa.
4. **Cambios de permisos:** ante evento `mantto:permissions-updated`, un permiso GENERAL revocado, ausente o indeterminado cierra el acceso. Si el permiso GENERAL sigue vigente, se cierran los controles anteriores y se consultan nuevamente los guards de navegación y del rol **Gestor de Fotografías** antes de volver a habilitarlos.
5. **Compatibilidad:** se preservan B1 (últimos resultados completos en memoria, modo solo lectura ante errores temporales) y B2 (máximo **2 reintentos GET**, validación de contratos/paginación), equivalencias, mapa, separación CORELLIAN/UNITED y **7 + 7 = 14 fotos**. Ningún permiso se concede desde el frontend: las mutaciones siguen autorizadas por el backend.

## Archivos completos del ZIP

- `modules/ventas-fotos-mapa/ventas-fotos-mapa.js` — blindaje B3, conserva B1+B2.
- `core/module-loader.js` — versión JS B3 sin afectar otros módulos.
- `index.html` — versión del cargador B3.
- `tests/int10-b1-continuidad.test.js` — prueba B1 con versión acumulativa B3.
- `tests/int10-b2-resiliencia.test.js` — pruebas B2 con versión acumulativa B3.
- `tests/int10-gestor-fotografias-guard.test.js` — guard/rol original y versión acumulativa B3.
- `tests/int10-b3-seguridad.test.js` — pruebas nuevas de revocación, 401/403, solicitudes pendientes, gestor y sesión/visor.
- `README_FIX_INT10_B3_SEGURIDAD_V001.md` — este documento.

**No incluye** `.patch`, `.diff`, SQL, ejecutores, instalaciones automáticas, backend sin cambios ni módulos ajenos.

## Pruebas ejecutadas

- `node --check` del JS del módulo, cargador y cuatro archivos de tests: **PASS**.
- `node --test tests/int10-b1-continuidad.test.js tests/int10-b2-resiliencia.test.js tests/int10-gestor-fotografias-guard.test.js tests/int10-b3-seguridad.test.js`: **59/59 PASS**, simulando GET, DOM, permisos y respuestas del backend. Los dos archivos backend requeridos por la prueba de Gestor se consultaron desde la base principal y **no se distribuyen** porque no cambian.
- Integridad ZIP, rutas originales y contenido: **PASS**.
- **No ejecutado:** pruebas autenticadas E2E, Aiven/Azure productivos, navegador PWA real, GitHub Pages ni Netlify.

## Aplicación y reversión

1. Comparar la carpeta local/commit con la base anterior. B3 **reemplaza B2 y contiene B1 + B2**, de modo que **no** debe aplicarse B1 ni B2 después de B3; conciliar primero si `main` o la copia local avanzó.
2. Extraer el ZIP en la **raíz** del repositorio, conservando carpetas; revisar `git diff`. Ejecutar los cuatro tests desde el repositorio completo.
3. Validar con roles reales en **Local → GitHub Pages**, incluyendo lectura GENERAL sin Gestor, Gestor autorizado CORELLIAN, acceso UNITED independiente, 403 catálogo, 403 guard, 401 sesión, visor, refresco selectivo y 7 + 7.
4. **Netlify solo mediante despliegue manual autorizado**. Para revertir, restaurar las tres fuentes frontend de B2 y los tests anteriores desde el ZIP B2; si B2 nunca se incorporó, restaurar base verificada mediante Git.

**SQL: NO REQUIERE APLICAR NINGÚN SQL.** Solo frontend; **no requiere actualizar Azure**.

**Límite de seguridad preexistente (no modificado en B3):** la galería GENERAL del backend consulta ambos orígenes con el permiso GENERAL, sin alcance por registro de cada dominio en esa lectura. Su ajuste frente a la Constitución §12 requiere decisión de arquitectura/seguridad; no se reinterpretaron silenciosamente permisos ni se modificó el backend.

**Sistemas modificados:** solo archivos locales del ZIP. **GitHub, Aiven, Azure, GitHub Pages y Netlify: SIN CAMBIOS.**

## SHA-256 (archivos de código y tests)

```text
5b9037e2692e409c37164a98541d61e894a9861be1c238f69a1ea95d8aad737f  modules/ventas-fotos-mapa/ventas-fotos-mapa.js
d3ec804ad1f2dd13a4b56aa054b7ed4868685856813f15785da23e22d6842997  core/module-loader.js
b1b7353ca4bf3ee7eb1dbf7a163fc4b85ba987c017aeb26bafa7fc2dfb3ce639  index.html
5bf0440bbd8ca319ce231cad4fc6f512ba9a5be9f39894c06f5f6adcd34cba8f  tests/int10-b1-continuidad.test.js
117e87bd1b9e9793caf977b6acd476526f439912609c1ada4a9207b2b5a133ef  tests/int10-b2-resiliencia.test.js
cc2f51b3ff8fdafbeb25e24290fa86c7d279c73721427e02db5199da03450460  tests/int10-gestor-fotografias-guard.test.js
1ea466293e23dc8bf3cfecda813112507aac2fdd9f5edf7fe067b2a315a84b54  tests/int10-b3-seguridad.test.js
```
