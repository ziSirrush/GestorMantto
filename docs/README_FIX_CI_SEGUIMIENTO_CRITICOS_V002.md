# FIX CI SEGUIMIENTO + CRITICOS V002

## Objetivo
Corregir el segundo fallo de GitHub Actions detectado después de aplicar `FIX_CI_SEGUIMIENTO_CRITICOS_V001`.

## Base verificada
- Repositorio: `ziSirrush/GestorMantto`
- Rama: `main`
- Commit: `e947a3b4d9e7e67e70c2d9b24c9e17b3da61903c`
- Mensaje: `Version 092926.1`
- Workflow backend: Run #406
- Resultado observado: 159 pruebas, 158 PASS, 1 FAIL.

## Causa exacta
La prueba `validation/equipo-sale-critico-fase2.test.js` conservaba una aserción válida únicamente dentro del ZIP aislado de Fase 2:

```js
assert.equal(
  fs.existsSync(path.join(ROOT, 'backend/src/services/notifications/ticket-critical-notifications_uni.service.js')),
  false
);
```

En el repositorio integrado, Fase 1 y Fase 2 deben coexistir. Por tanto el archivo de Fase 1 existe correctamente y esa aserción falla necesariamente.

## Corrección
Se reemplaza la comprobación de "el archivo no existe" por una comprobación de integración real:

- el archivo de Fase 1 debe existir;
- Fase 1 conserva `EVENT_EQUIPO_SALE_DE_CRITICO_UNI`;
- Fase 1 conserva `processAfterSync_uni`;
- Fase 2 conserva `listTimeExpiredTransitions`;
- el job de Fase 2 no incorpora `processAfterSync_uni`.

Esto valida que ambas fases conviven sin mezclar sus responsabilidades:

- Fase 1: salida de crítico causada por cambio de datos durante sync de Tickets.
- Fase 2: salida automática causada por vencimiento temporal U35.

## Archivos modificados
- `validation/equipo-sale-critico-fase2.test.js`

## Archivos NO modificados
- `backend/package.json` ya contiene las pruebas de Fase 1 y Fase 2 desde V001.
- No se modifica código productivo.
- No se modifica SQL.
- No se modifica frontend.
- No se modifica el job U35.
- No se modifica la lógica de Fase 1.

## Validación realizada
- `node --check validation/equipo-sale-critico-fase2.test.js`: PASS.
- Prueba Fase 2 en montaje integrado Fase 1 + Fase 2: 13/13 PASS.
- Reconstrucción del archivo previo y comparación por Git blob SHA: PASS.
  - SHA esperado de `main`: `c5b3752c7d649b5d012b5ee2d9ec0240fe39e4ef`.
  - SHA reconstruido al revertir únicamente este FIX: `c5b3752c7d649b5d012b5ee2d9ec0240fe39e4ef`.

## Importante
No puedo confirmar que el workflow completo de GitHub Actions termine en verde hasta aplicar este FIX y ejecutar nuevamente la suite oficial sobre el repositorio remoto. Este paquete corrige exactamente el único fallo reportado por el Run #406.
