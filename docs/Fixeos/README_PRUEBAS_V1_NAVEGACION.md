# Pruebas V1 - Ajustes de navegación base

Cambios aplicados:

- Los módulos no integrados ya no redirigen a Resumen del día.
- Si un destino todavía no existe, se muestra una vista interna de **En construcción / En desarrollo**.
- Se separó el comportamiento del usuario en barra superior:
  - Click en usuario/avatar/nombre: abre **Usuarios**.
  - Click en **Cerrar sesión**: cierra sesión.
- Se conserva el historial interno con botón de regreso.
- Regla base: al integrar un módulo no se deben alterar Header, Login, Router, Nori ni Centro de Ayuda salvo indicación explícita.

Módulos reales actualmente integrados:

- Inicio
- Resumen del día
- Centro de Ayuda
- Solicitud de soporte

Los demás quedan registrados como rutas en construcción.
