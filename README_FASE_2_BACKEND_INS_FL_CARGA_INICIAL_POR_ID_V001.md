# Mantto Gestor - Fase 2 Backend INS_FL - Carga inicial por ID V001

## Base verificada

- Repositorio: `ziSirrush/GestorMantto`
- Rama: `main`
- Commit base revisado: `c075f8c3447df98330b94104d62ea3bf93847965`
- Version del commit: `Version 100826.1`
- Blob base de `backend/src/controllers/ins-fl.controller.js`: `130023304e5ddc1a3f73781e226e8afa2912c992`
- Fase previa acumulada: `FASE_1_BACKEND_INS_FL_CONTRATO_30_CAMPOS_V001`

Esta entrega es **acumulativa**: el controlador incluido contiene tanto los 30 campos incorporados en Fase 1 como las protecciones de carga inicial implementadas en Fase 2.

## Objetivo

Preparar `POST /api/ins-fl/sync` para una carga inicial unica desde la sabana `FL_Res_VS`, aprovechando el `id_ins_fl` exportado de la BD cuando exista, sin permitir que un ID incorrecto sobrescriba otro registro.

Fase 2 no modifica `Send.js`. El emisor de Google Sheets se adapta despues de cerrar y validar el contrato backend.

## Causa

Despues de Fase 1, el backend ya reconoce los 30 campos nuevos, pero la sincronizacion seguia localizando registros solamente por:

```text
id_proyecto + referencia_sitio
```

La sabana preparada para la carga inicial conserva `id_ins_fl` de los registros existentes. Ignorar ese ID elimina una proteccion util para la migracion y podria permitir que una fila mal alineada termine actualizando un registro distinto al esperado.

## Archivo modificado

- `backend/src/controllers/ins-fl.controller.js`

No se modifica ningun otro archivo de aplicacion en esta fase.

## Comportamiento de Fase 2

### 1. Fila con `id_ins_fl`

`id_ins_fl` se acepta exclusivamente como **selector y validador de identidad**.

Reglas:

1. Debe ser un entero positivo.
2. Se busca primero el registro por `id_ins_fl`.
3. Si el ID no existe, la fila se rechaza con `ID_INS_FL_NOT_FOUND`.
4. Un ID proporcionado que no existe **no hace fallback a INSERT**.
5. Si el ID existe, se valida que coincidan:
   - `id_proyecto`;
   - `referencia_sitio`.
6. Si cualquiera de esas dos llaves no corresponde al registro encontrado por ID, la fila se rechaza con `ID_INS_FL_KEY_MISMATCH`.
7. Si la identidad es valida, la comparacion/UPDATE usa el registro encontrado por `id_ins_fl`.

`id_ins_fl` nunca se incluye entre las asignaciones de INSERT/UPDATE y por lo tanto no puede ser sustituido por la sabana.

### 2. Fila sin `id_ins_fl`

Se conserva la regla historica:

```text
id_proyecto + referencia_sitio
```

- Si existe, se compara y se actualiza solo cuando hay cambios.
- Si no existe, se inserta un registro nuevo y MySQL genera su `id_ins_fl` AUTO_INCREMENT.

### 3. `id_admin`

Fase 2 cierra la politica de esta carga manteniendo la proteccion vigente:

- `id_admin` puede existir en `FL_Res_VS` como referencia de la sabana;
- `id_admin` continua excluido de `SYNC_FIELDS`;
- `/sync` no lo sobrescribe.

No existe una autorizacion expresa en esta fase para sustituir el `id_admin` almacenado en Aiven, por lo que se conserva el comportamiento seguro previo.

### 4. Campos que nunca escribe este sync

- `id_ins_fl`: selector/validador solamente.
- `id_admin`: protegido.
- `created_at`: gestionado por BD.
- `updated_at`: gestionado por BD.
- `id_script`: auxiliar exclusivo de Sheets.

## Contrato acumulado de Fase 1

El archivo de esta entrega conserva los 30 campos incorporados previamente a `DB_FIELDS`:

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

Los marcadores de negocio (`-`, `.`, `N/A`, `FALTA`, etc.) conservan el comportamiento vigente de `cleanValue()`.

## Respuesta de `/sync`

Se conservan los contadores existentes:

```text
received
inserted
updated
unchanged
rejected
errors
```

Y se agregan dos contadores de diagnostico de la carga inicial:

```text
resolved_by_id
resolved_by_key
```

Los errores por fila incluyen ahora `id_ins_fl` y un `code` estable cuando aplica, por ejemplo:

```text
INVALID_ID_INS_FL
MISSING_REQUIRED_FIELDS
ID_INS_FL_NOT_FOUND
ID_INS_FL_KEY_MISMATCH
ROW_SYNC_ERROR
```

## Protecciones que se conservan

- `REQUIRED_FIELDS = proyecto, id_proyecto, referencia_sitio`.
- `SAVEPOINT` por fila.
- `ROLLBACK TO SAVEPOINT` ante error individual.
- Transaccion general con commit al finalizar el lote.
- Autenticacion M2M existente en `/api/ins-fl/sync`.
- Rutas y permisos humanos sin cambios.
- Lecturas de Instalaciones sin cambios.
- Fotografias de proyecto sin cambios.
- Sin tablas, columnas, indices ni relaciones nuevas.

## SQL

No se incluye SQL en esta fase.

La ampliacion de columnas de `ins_fl` fue realizada previamente. Fase 2 solo modifica logica backend.

## Validaciones realizadas

### Sintaxis

Ejecutado:

```bash
node --check backend/src/controllers/ins-fl.controller.js
```

Resultado: `PASS`.

### Validacion estatica del contrato

Resultado:

```text
DB_FIELDS=93
NEW_FIELDS_IN_DB=30/30
ID_ADMIN_WRITE=PROTECTED
ID_INS_FL_WRITE=PROTECTED_SELECTOR_ONLY
ID_INS_FL_KEY_GUARD=PRESENT
FALLBACK_BY_KEY=PRESENT_WHEN_ID_EMPTY
STATIC_PHASE2_CONTRACT=PASS
```

### Pruebas locales dirigidas del `syncInsFl`

Se ejecuto el controlador con mocks de conexion/BD cubriendo siete escenarios:

1. ID existente y llaves correctas, sin cambios.
2. ID existente con cambio en un campo nuevo (`marca`) -> UPDATE.
3. ID existente pero `id_proyecto` incorrecto -> rechazo `ID_INS_FL_KEY_MISMATCH`.
4. ID proporcionado inexistente -> rechazo `ID_INS_FL_NOT_FOUND`, sin INSERT de fallback.
5. Sin ID, registro existente por llave -> resolucion por `id_proyecto + referencia_sitio`.
6. Sin ID, llave nueva -> INSERT sin escribir `id_ins_fl` ni `id_admin`.
7. ID invalido -> rechazo `INVALID_ID_INS_FL` antes de iniciar el SAVEPOINT de esa fila.

Resultado:

```text
PHASE2_SYNC_TESTS=7/7 PASS
```

Tambien se verifico que `id_admin` no aparece en el UPDATE/INSERT y que `id_ins_fl` solo se utiliza en la clausula de seleccion/WHERE correspondiente.

## Validaciones NO realizadas

Esta fase no se ha:

- desplegado en Azure;
- ejecutado contra Aiven mediante `/api/ins-fl/sync`;
- probado E2E con Google Sheets;
- usado para la carga inicial real de FL;
- commiteado ni enviado a GitHub.

Por lo tanto, el alcance validado es **estatico/local con mocks**, no una prueba sobre infraestructura productiva.

## Instalacion

Aplicar el ZIP desde la raiz del repositorio preservando carpetas. Reemplazar:

```text
backend/src/controllers/ins-fl.controller.js
```

Esta Fase 2 es acumulativa y puede sustituir directamente el controlador del commit base indicado; no exige aplicar el ZIP de Fase 1 por separado si aun no se aplico localmente.

Antes de copiar, confirmar que el repositorio local corresponda al commit base indicado o revisar diferencias si `main` avanzo.

Despues de aplicar:

```powershell
git diff -- backend/src/controllers/ins-fl.controller.js
node --check .\backend\src\controllers\ins-fl.controller.js
```

Si las dependencias del backend estan instaladas, ejecutar tambien sus validaciones generales habituales antes del commit/deploy.

## Siguiente fase

Fase 3 corresponde a QA/cierre backend. Despues de cerrar la backend, se adapta `Send.js` al contrato definitivo de `FL_Res_VS` y se realiza una prueba controlada antes de la carga unica completa.

## Sistemas modificados por esta entrega

- Archivos locales del paquete: SI.
- GitHub: NO.
- Aiven: NO.
- Azure App Service: NO.
- GitHub Pages: NO.
- Netlify: NO.
- Google Sheets: NO.

Preparar este ZIP no equivale a aplicarlo, desplegarlo ni ejecutar una carga de datos.
