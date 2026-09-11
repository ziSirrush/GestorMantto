# FASE 1 - COBRANZA COR - BACKEND DE CARGA V001

## Objetivo

Implementar exclusivamente el backend de carga inicial/manual de Cobranza Corellian hacia Aiven.

Tablas destino:

- `cobranza_indice_cor`
- `cobranza_fuente_cor`
- `cobranza_aditivas_cor`

Esta fase NO implementa Dashboard, Estados de Cuenta, Cobranza Admin, comentarios, adjuntos ni frontend.

## Base revisada

Se reviso el modulo vigente en `main`:

- `backend/src/modules/cobranza-cor/cobranza-cor.routes.js`
- `backend/src/modules/cobranza-cor/cobranza-cor.controller.js`
- `backend/src/modules/cobranza-cor/cobranza-cor.service.js`

Tambien se tomo como referencia el flujo M2M vigente de Ventas.

## Credenciales de integracion

Por instruccion del proyecto, Cobranza COR reutiliza las mismas claves de Ventas:

- `INTEGRATION_VENTAS_ID`
- `INTEGRATION_VENTAS_SECRET`

No se crean nuevas variables de entorno.

Cuando `INTEGRATION_AUTH_ENABLED=true`, las rutas usan HMAC mediante el middleware central existente.
Cuando esta deshabilitado, se conserva el mismo fallback de Ventas: sesion autenticada + `CFFAA_HISTORICAL_SYNC_ENABLED`.

## Rutas nuevas

```text
POST /api/cobranza-cor/carga/indice
POST /api/cobranza-cor/carga/fuente
POST /api/cobranza-cor/carga/aditivas
```

Aceptan cualquiera de estas formas:

```json
[
  { "PROYECTO": "Ejemplo" }
]
```

```json
{
  "registros": [
    { "PROYECTO": "Ejemplo" }
  ]
}
```

```json
{
  "records": [
    { "PROYECTO": "Ejemplo" }
  ]
}
```

## Reglas de carga

- Maximo por peticion: 5,000 registros.
- Procesamiento interno: bloques de 300.
- Transaccion por bloque.
- Savepoint por registro para aislar errores de una fila.
- La respuesta reporta filas insertadas y rechazadas.
- La carga es `insert_only`.
- Repetir el mismo lote puede generar duplicados porque las fuentes FUENTE/ADITIVAS no tienen una llave unica de fila confirmada en esta fase.
- No se inventa una llave unica ni un UPSERT sin evidencia de la fuente.

## Vinculo con INDICE

### FUENTE

El backend intenta resolver `id_indice_cor` usando coincidencia exacta de:

```text
PROYECTO + ANO DEL PROYECTO
```

Si no llega el ano, usa solo PROYECTO.

Solo se asigna `id_indice_cor` cuando existe exactamente una coincidencia activa.
Si hay cero o mas de una, se guarda `NULL` y la respuesta informa el caso.

`ID PROYECTO` de FUENTE se conserva en `id_proyecto_origen`; NO se asume que sea el PK interno de Aiven.

### ADITIVAS

El backend intenta resolver `id_indice_cor` con los valores disponibles de:

```text
PROYECTO + PP NS
```

Si solo existe uno de los dos valores, se usa ese valor, pero siempre se exige una sola coincidencia para vincular.

## Encabezados

El backend acepta los encabezados originales de las hojas y tambien los nombres normalizados de BD.
La normalizacion es tolerante a mayusculas/minusculas, espacios y acentos.

Para fechas se aceptan:

- `YYYY-MM-DD`
- ISO (`YYYY-MM-DDTHH:mm:ss...`)
- `DD/MM/YYYY`

Los porcentajes enviados como texto con `%` se convierten a fraccion decimal. Ejemplo: `16%` -> `0.16`.

## Archivos de la fase

Modificados completos:

- `backend/src/modules/cobranza-cor/cobranza-cor.routes.js`
- `backend/src/modules/cobranza-cor/cobranza-cor.controller.js`
- `backend/src/modules/cobranza-cor/cobranza-cor.service.js`

Nuevo:

- `backend/src/modules/cobranza-cor/cobranza-cor.repository.js`

No se modifica `backend/src/routes/index.js` porque `/api/cobranza-cor` ya esta montado en el `main` vigente.
No se modifica `integration-auth.middleware.js` porque las credenciales de Ventas ya estan soportadas por el middleware central.

## Instalacion local

Copiar el contenido del ZIP sobre la raiz del repositorio conservando la estructura de carpetas.

Ejemplo en PowerShell, si se descomprime en Descargas:

```powershell
$REPO="C:\Users\T14s\Downloads\mantto_gestor_frontend"
$FASE="$env:USERPROFILE\Downloads\FASE_1_COBRANZA_COR_BACKEND_CARGA_V001"

Copy-Item "$FASE\backend\*" "$REPO\backend" -Recurse -Force
Set-Location $REPO

git status
git diff -- backend/src/modules/cobranza-cor
```

## Validacion realizada al entregable

- Revision contra `main` vigente antes de generar la fase.
- Validacion estatica de sintaxis con `node --check` sobre los 4 archivos JS.
- Validacion de estructura del ZIP.

No se realizo:

- escritura en GitHub;
- despliegue a Azure;
- escritura de prueba en Aiven;
- prueba E2E;
- carga real desde Google Sheets.

Esas validaciones quedan pendientes para las siguientes fases/pruebas controladas.
