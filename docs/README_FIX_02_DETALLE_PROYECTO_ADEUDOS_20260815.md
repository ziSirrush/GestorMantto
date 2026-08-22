# FIX 02 - Detalle Proyecto / Adeudos

Fecha: 15/08/2026
Base auditada Produ: `ziSirrush/GestorMantto` @ `cf6b876e08e88fa19c0ba2befffbe461d2ba3485`.
Base local verificada: `Ver Local 0814 0743hra(1).zip`.

## Objetivo
Agregar al Detalle Proyecto United los indicadores financieros acordados sin crear una vista paralela:

- Adeudo MP.
- Adeudo VA.
- Adeudo Total = Adeudo MP + Adeudo VA.
- Los tres indicadores abren el Detalle estandar de Gestion de Credito cuando existe un registro relacionado.

## Regla de calculo
- Adeudo MP = suma de `pendiente_corriente + pendiente_vencido` de todos los registros de `detalle_mp_2026` cuyo `proyecto` coincide con el proyecto United.
- Adeudo VA = suma de `pc.adeudo` de todos los registros de Venta Adicional del mismo proyecto.
- Adeudo Total = Adeudo MP + Adeudo VA.
- La relacion se resuelve por `proyecto`, siguiendo la regla vigente de Cobranza United V014.

## Navegacion
El backend devuelve el menor `id_gc` disponible del mismo proyecto como `gestion_credito_id`.
Si existe, los tres KPI navegan a la ruta estandar existente:

`cobranza-uni-estados-cuenta`

con `id_gc`, por lo que el modulo existente abre su Detalle Gestion de Credito. No se crea una vista nueva.

## Archivos modificados
- `backend/src/modules/proyectos/proyectos.service.js`
- `core/details.js`

## No modifica
- Base de datos / esquema.
- `gestion_credito`, `detalle_mp_2026` ni `pc`.
- Rutas ni controladores.
- Dashboard Portafolio / FIX 01.
- Conversiones.
- Notificaciones / Data Sync.
- Instalaciones.

## Validacion tecnica
- Comparacion de blobs Local vs Produ antes del cambio: ambos archivos eran identicos.
- `node --check backend/src/modules/proyectos/proyectos.service.js`.
- `node --check core/details.js`.
- La consulta de adeudos se realiza una sola vez al cargar el Detalle Proyecto; no hay fetch por KPI ni por fila.

## Validacion posterior al deploy
1. Reiniciar backend y confirmar `/api/health`.
2. Abrir un proyecto United con MP y VA conocidos.
3. Confirmar que Adeudo MP coincide con la suma de `pendiente_corriente + pendiente_vencido`.
4. Confirmar que Adeudo VA coincide con la suma de `pc.adeudo`.
5. Confirmar que Adeudo Total = MP + VA.
6. Pulsar cualquiera de los tres KPI y comprobar que abre el Detalle estandar de Gestion de Credito del mismo proyecto.
7. Revisar Network: la apertura de Proyecto mantiene una sola solicitud de detalle de proyecto; los KPI no generan solicitudes adicionales hasta que el usuario navega a Gestion de Credito.
