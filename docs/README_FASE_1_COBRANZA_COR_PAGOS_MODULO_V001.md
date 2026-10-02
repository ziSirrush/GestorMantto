# FASE 1 - COBRANZA COR / MODULO PAGOS V001

**Fecha:** 2026-10-02  
**Proyecto:** Mantto Gestor  
**Dominio:** CORELLIAN / Cobranza  
**Base de codigo revisada:** `bb1294520882e02e12bf8d82cb5387ad244b16d9` (`Version 100226.3`)

## 1. Objetivo

Registrar el nuevo destino **Pagos** dentro de la agrupacion **Cobranza CORELLIAN**, dejarlo disponible en el catalogo de permisos y agregar su acceso al panel lateral.

Esta fase es deliberadamente pequena. **No implementa aun la lectura de Pagos ni la relacion Pago -> Proyecto/PPNS.**

## 2. Alcance exacto

La Fase 1 realiza solamente:

1. registro del modulo `COBRANZA_PAGOS` en el catalogo de permisos existente;
2. permiso visual independiente `COBRANZA_PAGOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`;
3. orden visual:
   - Dashboard Cobranza = 10
   - Estados de Cuenta = 20
   - Pagos = 30
   - Aditivas = 40
4. boton **Pagos** en el panel lateral de Cobranza CORELLIAN;
5. ruta frontend `cobranza-pagos` registrada con la etiqueta `Pagos`;
6. cache-bust del `core/router.js` modificado.

Hasta que la siguiente fase integre el frontend funcional, la ruta utiliza el placeholder generico existente del router: **En construccion / En desarrollo**.

## 3. Lo que NO hace esta fase

No crea, migra ni altera tablas operativas.

No modifica:

- `cobranza_pagos_cor`
- `cobranza_facturas_cor`
- `cobranza_rel_pagos`
- `cobranza_fuente_cor`
- `ins_fl`

No ejecuta:

- `CREATE TABLE`
- `ALTER TABLE`
- backfill de Pagos
- relacion Pago -> Proyecto
- relacion Pago -> Factura
- endpoints backend nuevos
- asignaciones automaticas a roles/usuarios

Las unicas escrituras SQL de la fase son sobre el **catalogo de permisos existente**: `perm_modulos`, `perm_elementos`, `perm_subelementos` y `perm_subelemento_acciones`, ademas del ajuste de orden del modulo Aditivas. La accion central `ACCESO_VISUAL` se reutiliza y no se modifica.

## 4. Archivos de la entrega

```text
FASE_1_COBRANZA_COR_PAGOS_MODULO_V001.patch

database/
  00_PRECHECK_FASE_1_COBRANZA_COR_PAGOS_MODULO_V001.sql
  01_APLICAR_FASE_1_COBRANZA_COR_PAGOS_MODULO_V001.sql
  02_SMOKE_FASE_1_COBRANZA_COR_PAGOS_MODULO_V001.sql
  99_ROLLBACK_FASE_1_COBRANZA_COR_PAGOS_MODULO_V001.sql

docs/
  README_FASE_1_COBRANZA_COR_PAGOS_MODULO_V001.md
```

El patch modifica exclusivamente:

```text
index.html
core/router.js
```

Se entrega como patch contra el `main` verificado para evitar reemplazar archivos completos que puedan contener cambios posteriores en la copia local. Antes de aplicarlo se exige `git apply --check`.

## 5. Orden de aplicacion

### A. Verificar la copia local

Desde la raiz del repositorio:

```powershell
git status
git rev-parse HEAD
```

La base contra la que se genero esta fase es:

```text
bb1294520882e02e12bf8d82cb5387ad244b16d9
```

Si la copia local contiene cambios posteriores, no hacer reset destructivo. Primero revisar que los dos hunks sigan siendo compatibles.

### B. Validar y aplicar frontend

```powershell
git apply --check ".\FASE_1_COBRANZA_COR_PAGOS_MODULO_V001.patch"
```

Solo si el check devuelve exit code 0:

```powershell
git apply ".\FASE_1_COBRANZA_COR_PAGOS_MODULO_V001.patch"
```

### C. Base de datos

Ejecutar manualmente y en este orden:

```text
00_PRECHECK_FASE_1_COBRANZA_COR_PAGOS_MODULO_V001.sql
01_APLICAR_FASE_1_COBRANZA_COR_PAGOS_MODULO_V001.sql
02_SMOKE_FASE_1_COBRANZA_COR_PAGOS_MODULO_V001.sql
```

Si el PRECHECK no muestra una unica agrupacion `COBRANZA` activa de CORELLIAN, o no muestra exactamente una accion central activa `ACCESO_VISUAL`, detener la aplicacion.

## 6. Permiso

Permiso nuevo:

```text
COBRANZA_PAGOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL
```

La fase **no lo asigna automaticamente** a ningun rol ni usuario.

Despues de aplicar el SQL debe asignarse desde el flujo normal autorizado del Panel de Control al rol/usuario que deba ver el modulo.

Sin permiso efectivo, el boton debe permanecer oculto.

## 7. Comportamiento esperado

Con permiso efectivo:

```text
Cobranza
  Dashboard Cobranza
  Estados de Cuenta
  Pagos
  Aditivas
```

Al abrir `Pagos` durante Fase 1:

```text
Pagos
En construccion / En desarrollo
```

Eso es intencional. La lectura de `cobranza_pagos_cor` pertenece a la siguiente fase.

## 8. Rollback

El SQL `99_ROLLBACK...sql` realiza rollback **logico**:

- desactiva permiso, subelemento, elemento y modulo Pagos;
- restaura Aditivas a orden 30;
- no borra catalogos ni asignaciones historicas.

El frontend se revierte con Git sobre los dos archivos modificados o aplicando el patch inverso:

```powershell
git apply -R --check ".\FASE_1_COBRANZA_COR_PAGOS_MODULO_V001.patch"
git apply -R ".\FASE_1_COBRANZA_COR_PAGOS_MODULO_V001.patch"
```

## 9. Validaciones realizadas al generar la entrega

- `main` GitHub revisado en `bb1294520882e02e12bf8d82cb5387ad244b16d9`.
- anclas de los hunks de `index.html` verificadas contra ese commit.
- ancla de `core/router.js` verificada contra ese commit.
- `git apply --check` y aplicacion del patch sobre fixture estatico construido con las anclas exactas verificadas de `main`: PASS.
- `git diff --check` posterior a esa aplicacion estatica: PASS.
- SQL revisado para no contener `CREATE TABLE`, `ALTER TABLE`, `DROP TABLE`, `TRUNCATE`, ni escrituras sobre tablas operativas de Cobranza.
- el APPLY no crea ni modifica la accion compartida `ACCESO_VISUAL`; solo la referencia.
- el router vigente confirma que una ruta sin modulo cargado cae en el placeholder generico de construccion.
- el module-loader vigente confirma que una ruta sin entrada en `ROUTES` no genera error y permite continuar al router.

## 10. Validaciones NO ejecutadas

No se ejecutaron:

- SQL contra Aiven real;
- `git apply` sobre la copia local del usuario;
- despliegue GitHub Pages;
- despliegue Netlify;
- despliegue Azure;
- prueba E2E de permisos/sesion.

## 11. Sistemas modificados por la generacion de esta entrega

Ninguno externo.

No se escribio en:

```text
GitHub
Aiven
Azure
Netlify
Google Sheets
NetSuite
```
