# BLT NOW | Fix offline de Guard, barra lateral y shell V001

**Fecha:** 20-oct-2026  
**Estado:** aplicado localmente; pendiente de E2E en navegador/PWA y de despliegue.

## Hallazgo

Al arrancar sin API, `core/user-viewer.js` vaciaba el catálogo y los permisos de sesión. La barra lateral ocultaba la ruta abierta y podía enviar al usuario a Inicio antes de que `core/offline-navigation.js` verificara el snapshot local. El Service Worker, además, solo garantizaba los recursos estáticos de Resumen del Día e Instalaciones · Proyectos.

El catálogo visual permite seleccionar todos los módulos autorizados, pero el backend local solo tiene dos exportadores de datos completos:

- `operacion-resumen-dia` (UNITED).
- `instalaciones-proyectos` (CORELLIAN).

Por ello, el código anterior no constituye respaldo de datos de todos los módulos. Tampoco existe todavía un almacén de vistas previas de imágenes; los binarios se excluyen expresamente de ambos manifests.

## Corrección aplicada

- Se conserva un snapshot del Guard de sesión por actor y usuario efectivo.
- El snapshot solo se puede restaurar junto con la capability offline vigente de la misma identidad y dentro de su TTL.
- Un `401` o `403` elimina el snapshot; no se reutiliza una autorización revocada.
- En modo restaurado solo se aceptan acciones de lectura (`VER`, `ACCESO_VISUAL`, `CONSULTAR`, `LISTAR`). Edición y códigos desconocidos fallan cerrados.
- La barra lateral limita inmediatamente las rutas a módulos que el backend marcó `EXPORTADOR_COMPLETO`; la verificación asíncrona de IndexedDB sigue decidiendo cuáles poseen una copia íntegra visible.
- Durante un respaldo se solicita al Service Worker guardar JS, CSS y plantillas HTML de todos los módulos autorizados conocidos por los cargadores. No se guardan respuestas `/api`, documentos ni imágenes originales en Cache Storage.
- La versión del Service Worker y las URLs de los scripts modificados se renovaron para evitar que la PWA conserve el código anterior.

## Alcance real después del fix

Una ruta con exportador, permiso/capability vigente y snapshot íntegro puede permanecer en la barra lateral y montar la pantalla normal sin red. Hoy esa garantía aplica únicamente a los dos datasets anteriores.

Para cumplir “todos los módulos” todavía se requiere un contrato de manifest/páginas/adaptador por cada módulo faltante. Para imágenes en vista previa se necesita un almacén de medios separado, particionado por identidad y alcance; no se debe reutilizar el caché público del Service Worker ni guardar originales.

## Validación local

- Sintaxis JavaScript de los archivos modificados.
- Suite offline: 159 pruebas correctas.
- Pruebas nuevas: restauración por identidad, revocación `403`, bloqueo de escritura y enumeración del shell autorizado.
- Pendiente: prueba E2E real en PWA, corte físico de red, cuota de almacenamiento, Azure/Aiven y vista previa de imágenes.
