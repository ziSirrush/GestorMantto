# Proyectos V0.1.4

## Objetivo
Corregir detalle de proyecto cuando el backend responde JSON valido pero sin la estructura esperada por el frontend.

## Cambios
- `pruebas/modules/proyectos/proyectos.js`
  - Se cambia la estrategia de consulta del detalle para probar rutas en orden y validar que la respuesta realmente incluya detalle.
  - Se agrega normalizador de respuesta para soportar respuestas directas o anidadas en `data`, `detalle` o `payload`.
  - Se evita renderizar detalle vacio cuando `/api/proyectos` responde listado en lugar de detalle.

## Archivos protegidos
No se modificaron Home, Resumen del Dia, Equipos Criticos, Portafolio, CSS global ni autenticacion.
