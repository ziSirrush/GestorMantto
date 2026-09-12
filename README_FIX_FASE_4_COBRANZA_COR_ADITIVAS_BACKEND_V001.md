# FIX FASE 4 - COBRANZA COR - ADITIVAS / CONTRATO BACKEND V001

## Base verificada

- Repositorio: `ziSirrush/GestorMantto`
- Rama: `main`
- Estado verificado: commit `210111b9dd5bc6e993f58ac3d4061b95b7101126` (`Version 091126.23 - Edo Cta`).
- En ese `main` ya están integrados:
  - `FASE_3_COBRANZA_COR_ADITIVAS_BACKEND_V001`.
  - `FASE_4_COBRANZA_COR_ADITIVAS_V002`.

## Objetivo

Corregir exclusivamente la FASE 4 de `Cobranza > Aditivas` para consumir el contrato real de la FASE 3 backend.

No modifica backend, SQL, tablas ni permisos.

## Problema corregido

La FASE 4 V002 consultaba `GET /api/cobranza-cor/aditivas` sin parámetros y después filtraba/paginaba localmente únicamente los registros recibidos. El backend V001 pagina por defecto y por tanto ese comportamiento podía ocultar registros fuera de la primera página y desalinear el resumen con los filtros visuales.

También abría el detalle reutilizando la fila del listado en vez de consultar el endpoint funcional de detalle.

## Contrato respetado

### MAIN

`GET /api/cobranza-cor/aditivas`

El frontend ahora envía al backend:

- `q`
- `anio`
- `departamento`
- `categoria`
- `firma_cot`
- `estatus_trabajos`
- `estatus_cobranza`
- `sup`
- `moneda`
- `solo_pendientes=1` cuando aplica
- `page`
- `page_size=30`

El frontend consume directamente:

- `data`
- `paginacion.pagina`
- `paginacion.tamano`
- `paginacion.total_registros`
- `paginacion.total_paginas`
- `resumen.registros`
- `resumen.con_pendiente`
- `resumen.vinculadas_indice`
- `resumen.sin_vinculo_indice`
- `resumen.por_moneda`
- `catalogos.anios`
- `catalogos.departamentos`
- `catalogos.categorias`
- `catalogos.firmas_cot`
- `catalogos.estatus_trabajos`
- `catalogos.estatus_cobranza`
- `catalogos.supervisores`
- `catalogos.monedas`

No vuelve a calcular filtros o paginación sobre una página parcial en el navegador.

### DETALLE

Al seleccionar una Aditiva, el frontend consulta:

`GET /api/cobranza-cor/aditivas/:idAditivaCor`

Y renderiza `response.aditiva`, incluyendo la referencia `indice` cuando existe.

## KPI

Se eliminaron los KPI locales de "Proyectos" y "Cotizaciones", porque una página paginada no puede calcularlos de manera autoritativa para todo el resultado filtrado.

Ahora se muestran exclusivamente valores entregados por `resumen`:

- Registros.
- Vinculadas a INDICE.
- Sin vínculo INDICE.
- Con pendiente.

## Resumen financiero

Se consume únicamente `resumen.por_moneda` del backend. No se mezclan MXN, USD ni otras monedas y el frontend no recalcula totales financieros globales.

## Archivos modificados completos

- `core/module-loader.js`
  - Sólo actualiza el cache-buster del JS de Aditivas para obligar a cargar este FIX.
- `modules/cobranza-cor/cobranza-cor-aditivas.js`
  - Sustituye la lectura local de V002 por el contrato server-side de FASE 3.

No se modifica el CSS porque el estilo actual soporta los controles adicionales mediante el mismo grid.

## Instalación

Copiar los archivos del ZIP sobre la raíz del repo conservando exactamente las rutas.

PowerShell:

```powershell
$REPO="C:\Users\T14s\Downloads\mantto_gestor_frontend"
$FIX="$env:USERPROFILE\Downloads\FIX_FASE_4_COBRANZA_COR_ADITIVAS_BACKEND_V001"

Set-Location $REPO
Copy-Item "$FIX\core\module-loader.js" ".\core\module-loader.js" -Force
Copy-Item "$FIX\modules\cobranza-cor\cobranza-cor-aditivas.js" ".\modules\cobranza-cor\cobranza-cor-aditivas.js" -Force

git status --short
git diff --check
git diff -- core/module-loader.js modules/cobranza-cor/cobranza-cor-aditivas.js
```

## Validación recomendada tras deploy

1. Abrir `Cobranza > Aditivas` con usuario de dominio completo.
2. Confirmar que el contador coincide con `paginacion.total_registros` / `resumen.registros`.
3. Cambiar cada filtro y verificar en Network que se envía como query param al backend.
4. Cambiar de página y verificar `page=2`, `page=3`, etc.
5. Usar búsqueda para un registro que no esté en la primera página sin filtros y confirmar que aparece.
6. Seleccionar una fila y verificar llamada `GET /api/cobranza-cor/aditivas/{id}`.
7. Confirmar que los montos permanecen separados por moneda.
8. Probar un usuario de alcance limitado y confirmar que el backend mantiene el recorte por `id_indice_cor`.

## No realizado

- No se hizo deploy.
- No se escribió en GitHub/Aiven/Azure/Netlify.
- No se ejecutó E2E contra el App Service real.
