# Equipos Criticos - Pruebas V0.3.2

Esta version corrige el problema donde al seleccionar **Equipos criticos** se actualizaba el contexto superior, pero el contenido seguia mostrando una vista bugueada de Resumen del Dia.

## Integracion recomendada

1. Reemplazar `pruebas/core/router.js`.
2. Mantener los archivos del modulo Equipos Criticos de la V0.3.1.
3. Limpiar cache del navegador o probar con recarga forzada.

## Resultado esperado

Al dar clic en **Equipos criticos**:

- La vista de Resumen del Dia debe ocultarse totalmente.
- Debe aparecer una pantalla con titulo **Equipos Criticos**.
- Deben mostrarse las tablas de Equipos Criticos y Proyectos Criticos o, si el backend no responde, errores dentro de las tablas del modulo.
