# Mantto Gestor - Fase 1 Backend INS_FL - Contrato 30 campos V001

## Base verificada

- Repositorio: `ziSirrush/GestorMantto`
- Rama: `main`
- Commit base: `c075f8c3447df98330b94104d62ea3bf93847965`
- Version del commit: `Version 100826.1`
- Archivo base verificado por blob SHA: `130023304e5ddc1a3f73781e226e8afa2912c992`

Esta fase fue preparada sobre el archivo vigente de `main`. El archivo completo modificado se entrega conservando su ruta original.

## Objetivo

Ampliar el contrato backend de `POST /api/ins-fl/sync` para reconocer y persistir los 30 campos que ya fueron incorporados al esquema de `ins_fl` para la sabana de migracion de FL.

Esta fase NO implementa todavia la logica especial de carga inicial por `id_ins_fl`. Esa proteccion/seleccion corresponde a Fase 2.

## Causa

La tabla `ins_fl` ya contempla los 30 campos nuevos, pero el controlador vigente de backend no los tenia declarados en `DB_FIELDS`. Como `SYNC_FIELDS` se deriva de `DB_FIELDS`, el endpoint `/api/ins-fl/sync` no los incorporaria a INSERT, UPDATE, comparacion de cambios ni normalizacion de entrada.

## Archivo modificado

- `backend/src/controllers/ins-fl.controller.js`

No se modifica ningun otro archivo de aplicacion en esta fase.

## Campos incorporados al contrato

1. `tipo_equipo`
2. `numero_equipo_fabrica`
3. `marca`
4. `modelo`
5. `carpeta_fisica`
6. `recepcion_carpeta`
7. `numero_contrato`
8. `meses_mantenimiento_gratuito`
9. `meses_garantia_actas`
10. `meses_garantia_sitio`
11. `meses_garantia_restantes`
12. `semanas_instalacion`
13. `funcionamiento`
14. `nomenclatura`
15. `contacto_cliente_sitio`
16. `estado_localizacion`
17. `direccion_proyecto`
18. `ph_ns`
19. `ov_ns`
20. `cliente_ns`
21. `estatus_completo`
22. `supervisor_nombre`
23. `correo_supervisor`
24. `proyeccion_entrega`
25. `presupuesto_mantenimiento_cem`
26. `costo_mensual_mantenimiento_cem`
27. `categoria`
28. `codigo_mantenimiento`
29. `equipos_mojados`
30. `sup_1`

## Comportamiento resultante de Fase 1

Al agregarse los campos a `DB_FIELDS`, pasan automaticamente al contrato `SYNC_FIELDS` vigente y por ello quedan cubiertos por:

- `normalizeIncomingRow()`;
- `rowChanged()`;
- `SELECT` de comparacion del registro existente;
- `INSERT INTO ins_fl`;
- `UPDATE ins_fl`.

Los 30 campos son `TEXT` en el esquema suministrado, por lo que esta fase los procesa con `cleanValue()` y no fuerza conversion numerica ni de fecha. Esto conserva marcadores operativos como `-`, `.`, `N/A`, `FALTA` y textos equivalentes conforme al comportamiento actual del sincronizador.

## Protecciones que NO cambian en esta fase

- `id_admin` permanece excluido de `SYNC_FIELDS`.
- `id_ins_fl` no forma parte de `DB_FIELDS/SYNC_FIELDS` y no se usa todavia para seleccionar el registro de carga inicial.
- `created_at` no se acepta desde el sync.
- `updated_at` no se acepta desde el sync.
- `id_script` no se acepta desde el sync; sigue siendo auxiliar de Sheets.
- La llave vigente de busqueda continua siendo `id_proyecto + referencia_sitio`.
- Se conservan `SAVEPOINT` y rollback por registro.
- Se conserva `REQUIRED_FIELDS = proyecto, id_proyecto, referencia_sitio`.
- No se modifican rutas ni autenticacion M2M.
- No se modifica la lectura humana de Instalaciones.
- No se modifica el modulo de fotografias.

La politica de `id_ins_fl` y `id_admin` para la carga inicial se resolvera expresamente en Fase 2, sin anticiparla en esta entrega.

## SQL

No se incluye SQL en esta fase.

Los campos de esquema ya fueron agregados antes de preparar este backend. Esta entrega no crea, altera ni elimina tablas o columnas.

## Validaciones realizadas

### Base de codigo

Se verifico que `main` continuaba en:

`c075f8c3447df98330b94104d62ea3bf93847965` (`Version 100826.1`)

El archivo base reconstruido para preparar el fix produjo el mismo blob SHA que GitHub:

`130023304e5ddc1a3f73781e226e8afa2912c992`

### Sintaxis

Ejecutado:

```bash
node --check backend/src/controllers/ins-fl.controller.js
```

Resultado: PASS.

### Validacion estatica del contrato

Resultado:

```text
DB_FIELDS=93
SYNC_FIELDS=92
NEW_FIELDS_IN_DB=30/30
NEW_FIELDS_IN_SYNC=30/30
ID_ADMIN_SYNC=EXCLUDED
ID_SCRIPT_SYNC=EXCLUDED
VM_CONTRACT_TEST=PASS
```

Tambien se verifico:

- 30 campos nuevos sin faltantes;
- sin duplicados dentro de `DB_FIELDS`;
- `id_ins_fl`, `created_at`, `updated_at` e `id_script` fuera de `DB_FIELDS`;
- `id_admin` presente en `DB_FIELDS` pero excluido del contrato de escritura vigente.

## Validaciones NO realizadas

Esta fase no se ha:

- desplegado en Azure;
- ejecutado contra Aiven mediante `/sync`;
- probado E2E con Google Sheets;
- usado para una carga real de FL;
- commiteado ni enviado a GitHub.

Por lo tanto, el alcance validado es estatico/local sobre el archivo modificado.

## Instalacion

Aplicar el ZIP desde la raiz del repositorio preservando carpetas. El archivo que debe reemplazarse es:

```text
backend/src/controllers/ins-fl.controller.js
```

Antes de aplicar, confirmar que el repositorio local corresponde al commit base indicado o revisar las diferencias si `main` avanzo.

Despues de copiar, revisar el cambio y validar sintaxis:

```powershell
git diff -- backend/src/controllers/ins-fl.controller.js
node --check .\backend\src\controllers\ins-fl.controller.js
```

Si el proyecto local dispone de sus dependencias instaladas, ejecutar tambien las validaciones generales habituales del backend antes de commit/deploy.

## Sistemas modificados por esta entrega

- Archivos locales del paquete: SI.
- GitHub: NO.
- Aiven: NO.
- Azure App Service: NO.
- GitHub Pages: NO.
- Netlify: NO.
- Google Sheets: NO.

Preparar este ZIP no equivale a aplicar ni desplegar el cambio.
