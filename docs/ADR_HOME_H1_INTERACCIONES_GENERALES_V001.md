# ADR - H1 Interacciones generales

**Estado:** Aprobado para implementación H1  
**Fecha:** 18/08/2026

## Decisión
Usar la tabla independiente `usuario_interacciones` como bitácora operativa de actividad del usuario. No reutilizar `auth_audit`.

La captura se divide en dos orígenes centrales:
1. **Frontend / Router:** navegación y consultas puntuales sin cambio de ruta.
2. **Backend / middleware general:** mutaciones API exitosas asociadas al usuario autenticado.

Home y la vista `activity` leen la misma tabla por `id_usuario` y orden descendente de fecha.

## Motivo
- Evita UNIONs por módulo.
- Evita mezclar autenticación con operación.
- Permite agregar módulos sin cambiar Home.
- Conserva `ruta_destino + payload_json` para reanudar contexto.
- Mantiene Aiven como fuente única.

## Seguridad y privacidad
No se persisten cuerpos de request ni credenciales. El usuario del registro se obtiene de la sesión autenticada en backend, no de un `id_usuario` enviado por frontend.

## Consecuencia
Los módulos nuevos que realicen mutaciones HTTP quedan cubiertos por el middleware general. Acciones especiales que no naveguen ni realicen una mutación HTTP deberán integrarse explícitamente con el servicio general de interacciones cuando aparezcan.
