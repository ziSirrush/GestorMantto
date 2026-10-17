# FIX INT-10 | Gestor de Fotografías: carga y edición desde Catálogo General | V001

**Fecha:** 17/10/2026
**Repositorio de origen:** `ziSirrush/GestorMantto`, `main`
**Commit base verificado:** `76f5cbee37bd30ffcc04e7e89e5d116526340bc4` (`Version 101726.2`)
**Estado:** entrega preparada; **NO** integrada al repositorio, **NO** desplegada ni probada en producción.
**Formato:** un ZIP con los archivos completos modificados y sus rutas originales. Sin `.patch`, `.diff`, ejecutores ni instaladores.

## 1. Causa y corrección

La Fase 3 de INT-10 utilizó `canOpenCorellian` —la autorización de **navegación** mediante una puerta de Ventas— para determinar si un usuario podía **Agregar Foto**, **Eliminar Foto** o **Seleccionar Foto Principal** desde el Catálogo General. El usuario podía tener el rol **Gestor de Fotografías** y acceso real al proyecto a través de Instalaciones, pero una puerta de navegación diferente dejaba la foto marcada como no administrable o escondía los controles.

Este FIX separa **navegar** de **administrar fotografías** sin eliminar los guards. La nueva consulta de solo lectura `GET /api/ins-fl/proyectos/fotografias-gestion` devuelve únicamente IDs CORELLIAN dentro del alcance efectivo. El backend exige sesión, permiso y puerta de **Instalaciones**, rol **Gestor de Fotografías** y utiliza el mismo constructor de alcance CORELLIAN (`buildInsFlScopeSql_gnral`) que las rutas POST/DELETE/PATCH. Un 403, error de consulta o revocación impide mostrar botones de gestión en el catálogo; nunca concede permisos por defecto.

La carga, eliminación y selección de foto principal siguen sujetas a los guards del backend y a los límites existentes. El rol Gestor de Fotografías sigue siendo el rol funcional de escritura tanto para CORELLIAN como para UNITED **en sus respectivos proyectos autorizados**; UNITED se sigue administrando desde su detalle de Portafolio, **no** desde el carrusel combinado de Catálogo General.

## 2. Alcance e invariantes

- Se conserva el Catálogo General de solo lectura, el mapa y los enlaces de navegación por cada dominio.
- Se mantienen las fotografías de **Instalaciones / CORELLIAN** y **Mantenimiento / UNITED** separadas por origen, con **7 fotografías máximo por origen** y **hasta 14 en un mismo carrusel por equivalencia existente**.
- No se cambia el motor de subida/almacenamiento de fotografías, Azure Blob Storage, los campos de Aiven, los roles existentes ni la gestión de fotografías UNITED.
- No se añaden tablas, columnas, índices ni migraciones SQL.

## 3. Archivos completos en el ZIP

| Ruta relativa | Acción |
|---|---|
| `backend/src/controllers/ins-fl-read-cor.controller.js` | Añade controlador de consulta paginada y limitada a los IDs CORELLIAN realmente gestionables |
| `backend/src/routes/ins-fl.routes.js` | Añade GET protegido por guard Instalaciones y rol Gestor de Fotografías |
| `modules/ventas-fotos-mapa/ventas-fotos-mapa.js` | Separa autorización de navegación de autorización de edición; consulta alcance efectivo y habilita los controles únicamente para proyectos autorizados |
| `core/module-loader.js` | Actualiza versión del JS del catálogo para invalidar caché |
| `index.html` | Actualiza versión del cargador de módulos para invalidar caché |
| `tests/int10-gestor-fotografias-guard.test.js` | Añade pruebas locales de permisos, paginación, rechazo y preservación 7+7 |
| `README_FIX_INT10_GESTOR_FOTOGRAFIAS_V001.md` | Esta documentación |

**Solo estos cinco archivos existentes se modifican;** uno de pruebas y este README son nuevos. No se incluyen otros componentes del repositorio ni archivos temporales.

## 4. Verificaciones realizadas

- Se reconstruyeron los **cinco archivos originales completos desde GitHub `main`** y se verificó que su Git blob SHA coincidía exactamente con el repositorio antes de aplicar el FIX.
- Sintaxis `node --check` de los **cinco JS** del paquete: **PASS**.
- `node --test tests/int10-gestor-fotografias-guard.test.js`: **6/6 PASS**.
- Prueba controlada con DB simulada: IDs y `LIMIT/OFFSET` correctos; filtro de alcance incluido; error en resolver alcance responde error y no ejecuta SELECT (**PASS**).
- Integridad de los archivos y del ZIP: comprobada antes de entregar.
- **NO REALIZADO:** carga/eliminación de imágenes reales, conexión a Aiven productivo, prueba autenticada E2E, despliegue Azure/GitHub Pages/Netlify, verificación de permisos asignados a usuarios reales.

## 5. Incorporación y validación (manual)

1. Comprobar que la copia local del repositorio esté limpia y corresponda al commit base señalado. Si `main` avanzó, **comparar/reconciliar antes de sobrescribir**; no aplicar el ZIP ciegamente a otra versión.
2. Extraer el ZIP **sobre la raíz del repositorio local**, respetando exactamente la jerarquía de rutas del paquete.
3. Comprobar sintaxis de los archivos JS, ejecutar `node --test tests/int10-gestor-fotografias-guard.test.js`, la regresión global del proyecto y revisar `git diff`.
4. Publicar el **backend en Azure primero**, ya que el nuevo frontend necesita el endpoint `GET /api/ins-fl/proyectos/fotografias-gestion`.
5. Comprobar el frontend en **Local → GitHub Pages**. Solo después de las pruebas y autorización, publicar **manualmente** a **Netlify**.
6. Probar con usuarios reales: (a) sin rol —sin acciones de edición—; (b) con rol + Instalaciones —agregar/eliminar/principal en CORELLIAN autorizado—; (c) con rol + Portafolio —las mismas acciones desde el detalle UNITED—; (d) con acceso a ambos —control independiente por origen y carrete combinado 7+7—; (e) fuera de alcance —sin edición y respuesta backend denegada—.

**Despliegue:** una sola **entrega ZIP**, pero **dos pasos de despliegue coordinados** (Azure y frontend); no son dos entregas de código.

## 6. Sistemas y reversión

Este trabajo **solo generó archivos locales de entrega**. GitHub, Aiven, Azure, Netlify y GitHub Pages permanecen **sin modificar**.

Para revertir tras una eventual integración, restaurar únicamente los cinco archivos originales desde el commit base `76f5cbee37bd30ffcc04e7e89e5d116526340bc4` y retirar el nuevo archivo de pruebas. Si hubiera cambios posteriores al commit base, preservar esos cambios y revertir **solo las diferencias del FIX**. No hay migración SQL ni reversión de datos.
