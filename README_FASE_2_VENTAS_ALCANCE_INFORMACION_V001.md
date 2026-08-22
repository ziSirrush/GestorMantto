# FASE 2 - VENTAS - ALCANCE DE INFORMACION V001

## Base

- Repositorio: `ziSirrush/GestorMantto`
- Base revisada: `main` commit `9f3bdd05f525ae2989d9479a27795017ddb9e3f5`
- Esta fase debe aplicarse DESPUES de `FASE_1_VENTAS_GUARD_GENERAL_V001`.

## Objetivo

Hacer que las peticiones humanas de la agrupacion Ventas que ya pasaron por `humanInformationGuard_gnral` utilicen exactamente el alcance resuelto por ese Guard:

- Propio
- REPORTA_A
- REL_ADMIN
- Usuarios adicionales
- Dominio CORELLIAN completo cuando corresponda

La fuente autoritativa pasa a ser `req.informationAccess`.

## Cambio principal

`backend/src/modules/ventas/ventas-visibility.service.js` ahora:

1. Detecta el `informationAccess` generado por el Guard General.
2. Si existe y corresponde a CORELLIAN, NO vuelve a resolver el alcance.
3. Si `acceso_dominio_completo = true`, entrega `mode = ALL`.
4. En alcance restringido, usa directamente `usuarios_visibles` como IDs permitidos.
5. El resultado del Guard es autoritativo incluso si `INFORMATION_SCOPE_MODE=LEGACY`.
6. Conserva el resolver/fallback previo solo para integraciones o consumidores que todavia no pasan por Guard General.

Los repositories actuales siguen recibiendo el arreglo bajo el nombre compatible `advisorIds`, pero su contenido proviene directamente de `usuarios_visibles`; no se recalcula REPORTA_A ni REL_ADMIN dentro de Ventas.

## Controladores actualizados

Se propaga `req.informationAccess` al `actionContext` en:

- Cotizaciones
  - Cotizaciones
  - Vendidos
  - Perdidos
  - Proyeccion
  - comentarios, archivos y detalle
- Clientes
- Contactos de Cliente
- Prospeccion
  - listado
  - KPIs
  - Mapa Prospeccion
  - detalle/comentarios/archivos
- Asignacion a Redes
- Historial de Cotizaciones

## Archivos modificados

- `backend/src/modules/ventas/ventas-visibility.service.js`
- `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.controller.js`
- `backend/src/modules/ventas-clientes/ventas-clientes.controller.js`
- `backend/src/modules/ventas-clientes-contactos/ventas-clientes-contactos.controller.js`
- `backend/src/modules/ventas-prospeccion/ventas-prospeccion.controller.js`
- `backend/src/modules/ventas-redes/ventas-redes.controller.js`
- `backend/src/modules/ventas-cotizaciones-historial/ventas-cotizaciones-historial.controller.js`

## No modificado en esta fase

- SQL / esquema Aiven
- Frontend
- Rutas de integracion / sync
- Dashboard Ventas (casos especiales de Fase 3)
- Fotos Mapa (caso especial de Fase 3)
- Logistica, Instalaciones o Cobranza

## Validaciones realizadas

- `node --check` en todos los JS entregados: OK.
- Todos los controladores humanos incluidos propagan `req.informationAccess`: OK.
- El resolver Ventas prioriza el contexto del Guard antes de `runInformationScopeWithFallback_gnral`: OK.
- Alcance completo CORELLIAN mantiene `ALL`: OK.
- Alcance restringido usa `usuarios_visibles`: OK.
- Prueba sintetica: una peticion con Guard NO ejecuta fallback/LEGACY y conserva `[10,20,30]` como IDs visibles: OK.
- Sin archivos `APLICAR_*.js`: OK.

## Validacion funcional pendiente

De acuerdo con el flujo acordado, el check funcional completo se realizara al finalizar las fases de Ventas. Esta fase no se declara validada en runtime hasta ese momento.
