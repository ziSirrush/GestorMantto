# FIX BACKEND COTIZACIONES EQUIPOS MULTIPLES V001

## Alcance
Integra la tabla hija `ventas_cotizaciones_equipos_cor` al backend actual de Cotizaciones.

## Archivos modificados
- `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.service.js`
- `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.repository.js`

## Contrato de entrada
Los endpoints existentes `POST /api/ventas/cotizaciones` y `PUT /api/ventas/cotizaciones/:id` aceptan opcionalmente:

```json
{
  "equipos": [
    { "tipo_equipo": "Elevador", "cantidad": 2 },
    { "tipo_equipo": "Montacargas", "cantidad": 1 }
  ]
}
```

Tipos permitidos:
- Elevador
- Montacargas
- Escalera
- Rampa
- Plataformas/Otros

## Reglas
- No se permiten tipos duplicados.
- Cada cantidad debe ser un entero mayor a cero.
- Se permiten como máximo cinco tipos.
- `orden` se asigna según la posición del arreglo.
- `numero_equipos` se calcula como suma de cantidades.
- `tipo_equipos` se conserva como resumen para compatibilidad.
- Si `equipos` no se envía, el backend conserva el flujo anterior.
- Si `equipos` se envía vacío al editar, elimina las relaciones y establece total 0.

## Respuesta
`GET /api/ventas/cotizaciones/:id`, creación y edición devuelven la cotización con:

```json
{
  "equipos": [
    {
      "id_cotizacion_equipo": 1,
      "id_cotizacion": 1669,
      "tipo_equipo": "Elevador",
      "cantidad": 2,
      "orden": 1,
      "activo": 1
    }
  ]
}
```

## Transacción
La cotización y sus filas de equipos se guardan dentro de la misma transacción existente. Si falla la operación, se ejecuta rollback.

## Validaciones realizadas
- `node --check` en service y repository: correcto.
- Validador estructural: los cuatro archivos del módulo Cotizaciones aparecen `[OK]`.
- El comando global termina con faltantes de frontend ya existentes, porque el ZIP recibido contiene solo backend.

## Despliegue
Solo requiere desplegar backend. La tabla hija ya debe existir en Aiven.
