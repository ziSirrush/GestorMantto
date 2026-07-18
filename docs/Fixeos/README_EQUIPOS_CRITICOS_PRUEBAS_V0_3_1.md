# Equipos Críticos - Pruebas V0.3.1

Versión correctiva sobre V0.3.

## Qué corrige

El botón/panel `Equipos críticos` debe abrir `view-criticos` y no dejar una vista vacía ni mostrar Resumen del Día deformado.

La carga del HTML del módulo ahora tiene fallback interno en `equipos-criticos.js`.

## Prueba rápida

1. Copia los archivos indicados en `ARCHIVOS_MODIFICADOS.md`.
2. Abre el proyecto con Live Server o Netlify.
3. Da clic en `Equipos críticos`.
4. Debe mostrarse el título `Equipos Críticos`, filtros de Equipos y filtros de Proyectos.
5. Si el backend no está activo, las tablas deben mostrar error de backend, pero la vista debe abrir correctamente.

## Importante

No se tocó Resumen del Día.
