# FIX Visor de Usuarios - Alcance comercial efectivo V009

## Problema encontrado

El Visor sustituía correctamente la identidad de lectura por el usuario visualizado, pero el servicio común de visibilidad de Ventas solo resolvía:

1. acceso total;
2. gerentes mediante `usuarios.reporta_a`;
3. usuario propio.

No consultaba `usuarios_rel_admin`, por lo que un Auxiliar Administrativo visualizado terminaba con alcance propio y no veía la información de sus asesores relacionados.

## Corrección

Se actualiza únicamente:

`backend/src/modules/ventas/ventas-visibility.service.js`

El alcance comercial queda resuelto en este orden:

1. Si el usuario efectivo aparece como `usuarios_rel_admin.id_admin`, obtiene los usuarios activos relacionados en `usuarios_rel_admin.id_asesor` y usa modo `ADMIN_REL`.
2. Si no tiene relaciones administrativas y posee acceso total, conserva modo `ALL`.
3. Si es gerente comercial, conserva sus registros y los usuarios activos cuyo `usuarios.reporta_a` apunta al gerente.
4. Los demás usuarios conservan alcance propio.

En modo Visor, `actionContext.user.id_SB` corresponde al usuario visualizado para solicitudes GET, por lo que la consulta de `usuarios_rel_admin` y `reporta_a` usa la identidad efectiva y no la identidad real del Programador.

## Módulos alcanzados

La corrección aplica a los módulos que consumen el servicio común de visibilidad de Ventas:

- Cotizaciones.
- Clientes y contactos.
- Vendidos, Perdidos y Proyección cuando consultan Cotizaciones.
- Prospección y Mapa Prospección.
- Asignación a Redes.
- Historial de Cotizaciones.

## Sin cambios

- No modifica el token ni las rutas del Visor.
- No modifica frontend.
- No modifica `usuarios`, `usuario_roles`, `usuarios_rel_admin` ni permisos.
- No requiere SQL.
- Mantiene el modo de solo lectura del Visor.
- Mantiene la lógica de gerentes por `reporta_a`.

## Despliegue

Desplegar únicamente el backend y reiniciar la API.

## Validación funcional recomendada

1. Abrir el Visor con un Auxiliar Administrativo que tenga relaciones en `usuarios_rel_admin`.
2. Confirmar que Cotizaciones, Clientes, Prospección y Redes muestren registros de los asesores relacionados.
3. Confirmar que no aparezcan registros de asesores no relacionados.
4. Abrir el Visor con un Gerente Comercial y confirmar que sigue viendo sus registros y los de usuarios con `reporta_a` igual a su ID.
5. Abrir el Visor con un Asesor y confirmar que mantiene alcance propio.
