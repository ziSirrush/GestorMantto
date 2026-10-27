# BLT NOW | Experimental NS | Fase 1

Fecha: 26/10/2026.
Fuente: GitHub `ziSirrush/GestorMantto`, rama `main`, commit `aaa1f1ed30798716d0885dee1692ce56b1583402`.
Estado: entrega para aplicación **local**. No se ha hecho commit, push, despliegue ni escritura en Aiven.

## Objetivo

Crear la agrupación lateral independiente **Experimental NS** con tres destinos:

- Resumen del Día: `experimental-ns-resumen-dia`.
- Equipos Críticos: `experimental-ns-equipos-criticos`.
- Proyectos de Mantenimiento: `experimental-ns-proyectos-mantenimiento`.

En F1 se crea únicamente la navegación y la maqueta "En construcción" de cada módulo. Los módulos originales (incluidos los de Nevera) no se tocan.

## Control de acceso de Fase 1

Por seguridad, el grupo está oculto para usuarios que no tienen un rol efectivo `Programador`, `Programador United` o `Programador Corellian`. El router impide incluso la navegación directa hacia el cascarón si falta ese rol. **No es un permiso de datos**; al no existir API nueva en F1, no se expone información operativa. No debe usarse esta validación visual para autorizar endpoints futuros.

En F2 deberán registrarse en el catálogo real los permisos de módulo y la puerta de información para agrupación `EXPERIMENTAL_NS`, y protegerse los endpoints con los Guards centrales, ámbito UNITED y validación territorial, antes de consultar datos. Esta operación de BD **no se incluye** ni ejecuta en F1.

## Tablas aprobadas para F2 (sin acceso en F1)

- `ns_portafolio_pruebas`.
- `ns_tickets_pruebas` (incluyendo la columna propuesta `custeventblt_mot_det`, previa verificación real).

## Archivos

Archivos de nueva creación incluidos completos:
- `modules/experimental-ns/experimental-ns.js`.
- `modules/experimental-ns/experimental-ns.css`.
- `tests/experimental-ns-fase1.test.js`.
- `docs/EXPERIMENTAL_NS_FASE1.md`.

Archivos existentes modificados **en el repositorio local al pegar los comandos PowerShell**:
- `index.html` (solo menú, vistas y recursos estáticos).
- `core/router.js` (solo tres nombres y rama de navegación de F1).

El flujo de aplicación produce archivos completos a partir de la versión Git exacta. Se detiene si hay cambios locales en los archivos de destino, marcadores inesperados o SHA distinto; guarda copias y revierte si fallan las pruebas. No usa `.patch` ni modifica archivos de otros módulos.

## Comprobaciones

- `node --check modules/experimental-ns/experimental-ns.js`
- `node --check core/router.js`
- `node --test tests/experimental-ns-fase1.test.js`
- `git diff --check`

**Limitación:** estas son verificaciones locales y estáticas. No equivalen a validación E2E de navegación o permisos en Azure, Netlify, GitHub Pages ni Aiven. El acceso por permiso funcional/alcance en la capa backend corresponde a F2.

## Aplicación

1. Guardar el ZIP en Descargas.
2. Leer y pegar los comandos del archivo `COMANDOS_POWERSHELL.txt` en PowerShell.
3. Verificar `git diff` y el menú de forma local. **No ejecutar `git push` ni publicar sin autorización.**
