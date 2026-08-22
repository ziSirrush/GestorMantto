# FIX V010.2 - Gestión de Crédito -> Detalle Mantenimiento Preventivo

## Alcance
Corrección mínima y acumulativa sobre `modules/cobranza-uni/cobranza-uni.js`.

## Problema
El botón `Ir a MP` enviaba `id_dmp` al router, pero `ManttoCobranza_uni.init()` ignoraba el payload y cargaba siempre la MAIN de Mantenimiento Preventivo. Además, el detalle dependía de que el registro ya existiera en `mpState_uni.rows`, por lo que un acceso directo podía fallar si la MAIN no se había visitado antes.

## Corrección
- `init_uni(route, payload)` ahora reconoce `payload.id_dmp` / `payload.id`.
- Si existe un ID de MP, abre el mismo Detalle MP ya implementado; no crea una vista paralela.
- El acceso directo ya no depende de haber cargado previamente la MAIN.
- `loadMpDetail_uni()` incorpora `payload.mantenimiento` a `mpState_uni.rows` cuando el registro todavía no existe localmente.
- Acceder a Mantenimiento Preventivo desde el sidebar, sin ID, continúa abriendo la MAIN.

## No modificado
- `index.html`
- `core/router.js`
- sidebar
- permisos
- backend
- Aiven / SQL
- otros módulos

## Flujo esperado
1. Gestión de Crédito -> Detalle.
2. `Ir a MP`.
3. Router abre `cobranza-uni-mp-pro` con `id_dmp`.
4. Se consulta `/api/cobranza-uni/detalle-mp-2026/:id_dmp` si hace falta.
5. Se renderiza el Detalle Mantenimiento Preventivo existente, con sus tablas.
