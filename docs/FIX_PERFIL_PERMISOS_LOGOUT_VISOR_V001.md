# FIX Perfil, permisos, cierre de sesión y visor V001

## Cambios
- Retira el indicador Push del encabezado.
- Muestra el estado de GPS, cámara, micrófono y Push en Mi Perfil.
- Al pulsar la tarjeta de permisos se vuelve a validar y, cuando corresponde, se solicitan nuevamente los permisos del navegador.
- Agrega Cerrar sesión dentro del perfil y en el menú lateral móvil.
- Retira el selector global flotante de “Ver como”.
- Mueve el Visor de usuarios al Panel de Control para usuarios autorizados.
- Mantiene una franja compacta cuando el modo visor está activo.

## Notas
- El navegador conserva la autoridad final sobre los permisos. Si un permiso está bloqueado, el sistema informa que debe habilitarse desde la configuración del navegador.
- No hay cambios de base de datos ni backend.
