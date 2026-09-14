# FIX_COBRANZA_COR_SIN_INDICE_TOTAL_V002

## Objetivo

Eliminar la dependencia funcional y fisica de `cobranza_indice_cor` para que Cobranza COR opere por PPNS y la tabla INDICE pueda retirarse sin borrar accidentalmente Comentarios o Archivos.

Este FIX fue preparado contra `main` commit:

`1e54c9b1a21925585f828915f0c62158ba85b58e`

No ejecuta SQL, no hace push y no despliega Azure/Netlify.

## Dependencias encontradas en la estructura recibida

La estructura `Dump20260914.sql` contiene cuatro FK hacia `cobranza_indice_cor`:

- `cobranza_fuente_cor.id_indice_cor`
- `cobranza_aditivas_cor.id_indice_cor`
- `cobranza_comentarios_cor.id_indice_cor`
- `cobranza_archivos_cor.id_indice_cor`

Las dos ultimas usan `ON DELETE CASCADE`; por eso NO se debe borrar INDICE antes de migrar su relacion de proyecto.

## Nuevo contrato

- Llave funcional de proyecto Cobranza COR: PPNS.
- FUENTE: `cobranza_fuente_cor.id_proyecto_origen`.
- ADITIVAS: `cobranza_aditivas_cor.pp_ns`.
- COMENTARIOS: nuevo campo `cobranza_comentarios_cor.ppns`.
- ARCHIVOS: nuevo campo `cobranza_archivos_cor.ppns`.
- SUP / Asesor: `ins_fl` por `id_proyecto = PPNS`.
- Administrativo: `usuarios_rel_admin` a partir del Asesor.
- Estados de Cuenta: `GET /api/cobranza-cor/estados-cuenta/:ppns`.
- Se elimina el endpoint runtime `/api/cobranza-cor/carga/indice`.
- Aditivas deja de exponer/consumir `id_indice_cor`, `vinculo_indice` e `indice`; usa `vinculo_ppns` y `ppns_referencia`.

## Archivos de codigo completos

El instalador copia completos estos archivos:

- `backend/src/modules/cobranza-cor/cobranza-cor.repository.js`
- `backend/src/modules/cobranza-cor/cobranza-cor.service.js`
- `backend/src/modules/cobranza-cor/cobranza-cor.controller.js`
- `backend/src/modules/cobranza-cor/cobranza-cor.routes.js`
- `modules/cobranza-cor/cobranza-cor-estados-cuenta.js`

`modules/cobranza-cor/cobranza-cor-aditivas.js` se transforma de forma controlada sobre el blob exacto de `main` (`6fd635669b964c26939da290e9dcf7b27197460b`) para conservar el resto del modulo sin reescribir funcionalidad ajena al cambio. Si el archivo no coincide con ese blob, el instalador aborta.

## Aplicacion local del codigo

Desde PowerShell:

```powershell
$FIX="$env:USERPROFILE\Downloads\FIX_COBRANZA_COR_SIN_INDICE_TOTAL_V002"
& "$FIX\APLICAR_FIX_LOCAL.ps1"
```

El script:

1. exige HEAD `1e54c9b1a21925585f828915f0c62158ba85b58e`;
2. valida los blobs base de los seis archivos afectados;
3. aborta si hay cambios locales en ellos;
4. copia los cinco archivos completos;
5. transforma Aditivas a PPNS;
6. corre `node --check`;
7. corre `git diff --check`;
8. ejecuta una auditoria `git grep` en JS/HTML/JSON y aborta si queda una referencia runtime a INDICE.

## SQL - orden obligatorio

### 0. Precheck de estructura y datos

`sql/00_PRECHECK_COBRANZA_COR_SIN_INDICE_TOTAL_V002.sql`

Solo lectura. Muestra:

- todas las FK reales hacia INDICE;
- Comentarios cuyo PPNS no puede recuperarse;
- Comentarios con PPNS contradictorios;
- Archivos cuyo PPNS no puede recuperarse;
- calidad de PPNS en FUENTE/Aditivas;
- PPNS de FUENTE sin relacion activa en `ins_fl`.

Si aparecen contradicciones o registros que no pueden recuperar PPNS, deben corregirse antes de la eliminacion fisica.

### 1. Crear las columnas de reemplazo

`sql/01_FASE_1_COLUMNAS_PPNS_V002.sql`

Cambio aditivo. No borra INDICE.

- agrega `cliente` y `contractual` a FUENTE solo si no existen;
- agrega `ppns` a COMENTARIOS;
- agrega `ppns` a ARCHIVOS;
- agrega indices PPNS a ambas tablas.

No crea tablas nuevas.

### 2. Migrar relaciones existentes

`sql/02_FASE_2_MIGRAR_VINCULOS_A_PPNS_V002.sql`

Backfill de PPNS:

- Comentarios: FUENTE -> ADITIVA -> INDICE.
- Archivos: FUENTE -> ADITIVA -> COMENTARIO -> INDICE.

El SQL no migra automaticamente una fila cuando encuentra candidatos de PPNS contradictorios.

### 3. Validar antes del DROP

`sql/03_VALIDACION_PRE_DROP_INDICE_V002.sql`

Los tres campos `BLOQUEADOR_*` deben ser **0**.

No ejecutar la fase final si alguno es distinto de cero.

### 4. Retiro fisico final

`sql/04_FASE_3_ELIMINAR_DEPENDENCIAS_Y_TABLA_INDICE_V002.sql`

Requiere respaldo actual verificado.

Retira, en este orden:

1. FK y `id_indice_cor` de FUENTE;
2. FK y `id_indice_cor` de ADITIVAS;
3. FK y `id_indice_cor` de COMENTARIOS;
4. FK y `id_indice_cor` de ARCHIVOS;
5. `cobranza_indice_cor` solo cuando no quede ninguna FK externa.

El SELECT final debe devolver:

- `tabla_indice_restante = 0`
- `columnas_id_indice_restantes = 0`
- `fk_hacia_indice_restantes = 0`

## Importante sobre integraciones externas

El repositorio deja de aceptar `/carga/indice`. Si existe un Google Apps Script, SuiteScript u otro emisor externo que todavia llame ese endpoint, esa llamada tambien debe retirarse. Este paquete no modifica scripts externos que no estan en el repositorio revisado.

No puedo confirmar que no exista un emisor externo adicional sin revisar su codigo fuente.

## Reversion

Antes de la Fase 3 fisica debe existir un respaldo actual.

- Antes del DROP: se puede restaurar codigo y dejar las columnas PPNS agregadas sin perdida.
- Despues del DROP: reconstruir INDICE y los antiguos `id_indice_cor` requiere restaurar el respaldo. El PPNS nuevo no reconstruye de forma confiable el ID numerico historico de INDICE.

## Validacion realizada al generar el paquete

- `node --check` sobre los cinco JS completos: OK.
- Backend entregado: cero referencias a `cobranza_indice_cor`, `id_indice_cor`, `/carga/indice`, `TABLES_COR.indice` y aliases `vinculo_indice`.
- Main de Estados de Cuenta usa PPNS.
- El instalador incluye auditoria de runtime para detectar dependencias adicionales en el repo local antes de considerar el cambio listo.
- SQL NO fue ejecutado contra Aiven.
- No se realizo prueba E2E ni deploy.
