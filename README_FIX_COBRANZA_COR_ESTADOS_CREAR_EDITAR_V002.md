# FIX_COBRANZA_COR_ESTADOS_CREAR_EDITAR_V002

Fecha: 23/09/2026  
Dominio: CORELLIAN  
Agrupación: Cobranza  
Módulo: Estados de Cuenta  
Base GitHub validada: `main` @ `fb587ff35bf14aabec681b5a2a6ec345fedd9f03`

## Objetivo

Agregar al módulo existente **Cobranza COR > Estados de Cuenta**:

1. botón **+ Crear nuevo** en el Main;
2. botón **Editar** dentro del detalle de un PPNS;
3. formulario interno de alta/edición sin crear un módulo lateral nuevo;
4. edición precargada con la información actual del PPNS en `cobranza_fuente_cor` y sus relaciones de `cobranza_equipos_cor`;
5. relación de equipos contra `ins_fl` y `log_ops`, sin mezclar UNITED/Portafolio y sin reintroducir `cobranza_indice_cor`.

## Prerrequisito de BD

Este FIX **no ejecuta SQL**. Parte de los cambios de esquema que ya fueron aplicados manualmente en Aiven:

- `cobranza_fuente_cor.orden_hito`
- `cobranza_fuente_cor.fecha_programada`
- `cobranza_fuente_cor.fecha_notificada`
- `cobranza_fuente_cor.estatus_hito`
- tabla `cobranza_equipos_cor`

Si alguno de esos objetos no existe en el entorno destino, el CRUD no debe desplegarse hasta corregir el esquema.

## Comportamiento

### Main

`Cobranza COR > Estados de Cuenta`

- conserva listado, filtros y `Actualizar`;
- agrega `+ Crear nuevo`;
- el formulario continúa dentro de la ruta funcional `cobranza-estados-cuenta` mediante payload interno `mode=create`.

### Crear nuevo

- PPNS seleccionable desde `ins_fl` dentro del alcance CORELLIAN autorizado;
- solo ofrece PPNS que todavía no tengan un Estado de Cuenta activo en FUENTE;
- Proyecto y Cliente se resuelven desde `ins_fl` al crear;
- permite capturar hitos de cobranza;
- permite seleccionar equipos del PPNS y relacionarlos con `log_ops` cuando exista correspondencia;
- inserta hitos en `cobranza_fuente_cor` y relaciones en `cobranza_equipos_cor` dentro de una sola transacción.

### Editar

El botón `Editar` se muestra dentro del detalle del PPNS y abre el mismo formulario en `mode=edit`.

La carga de edición recupera:

- Proyecto, Cliente y Contractual;
- todos los hitos activos de `cobranza_fuente_cor` del PPNS;
- `%`, Condición/Hito, Año, Moneda, Subtotal, IVA, Total, Factura;
- Pago total, Estatus factura, Fecha pago;
- Fecha vencimiento, Días vencimiento, Estimado pago, Estatus vencimiento;
- Orden hito, Fecha programada, Fecha notificada, Estatus hito;
- equipos disponibles de `ins_fl`;
- relaciones activas de `cobranza_equipos_cor`;
- opciones relacionadas de `log_ops`.

Las bajas realizadas desde edición son lógicas (`activo=0`) para conservar historial.

## Seguridad y alcance

- reutiliza `COBRANZA_ESTADOS_CUENTA_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`;
- reutiliza `humanInformationGuard_gnral` con dominio `CORELLIAN` y agrupación `COBRANZA`;
- el alcance por PPNS continúa resolviéndose por `ins_fl` y el motor central de alcance;
- el Visor de Usuarios sigue siendo de solo lectura: POST/PUT son rechazados en backend;
- los IDs de hitos y equipos enviados al editar se verifican contra el PPNS activo;
- `id_ins_fl` e `id_log_ops` se validan contra el PPNS antes de guardar;
- equipos activos repetidos por `id_ins_fl` se rechazan;
- no se usa `cobranza_indice_cor`, `id_indice_cor` ni `idIndiceCor`.

## Archivos completos incluidos

Se entregan completos y conservando ruta:

- `backend/src/modules/cobranza-cor/cobranza-cor.repository.js`
- `backend/src/modules/cobranza-cor/cobranza-cor.service.js`
- `backend/src/modules/cobranza-cor/cobranza-cor.controller.js`
- `backend/src/modules/cobranza-cor/cobranza-cor.routes.js`
- `modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js` (nuevo)
- `modules/cobranza-cor/cobranza-cor-estados-cuenta-form.css` (nuevo)
- `tests/cobranza-cor-estados-cuenta-crud-form.test.js` (nuevo)

Se incluyen además consultas **solo lectura** para validación de prerrequisitos:

- `sql/00_PRECHECK_COBRANZA_COR_ESTADOS_CRUD_V002.sql`
- `sql/01_SMOKE_READ_COBRANZA_COR_ESTADOS_CRUD_V002.sql`

## Transformaciones controladas

Para no sobrescribir código vigente no relacionado, `APLICAR_FIX_LOCAL.ps1` transforma únicamente bloques exactos y previamente validados de:

- `modules/cobranza-cor/cobranza-cor-estados-cuenta.js`
  - registra el formulario bajo demanda;
  - agrega `+ Crear nuevo`;
  - agrega `Editar` al detalle;
  - conecta navegación `create/edit`;
  - conserva el detalle actual de Suministro / Instalación.
- `core/module-loader.js`
  - actualiza solo el cache-bust de Estados de Cuenta.
- `index.html`
  - actualiza solo el cache-bust de `core/module-loader.js`.

El aplicador exige el blob exacto de `main` validado para esos archivos. Si hay cambios locales o el blob cambió, se detiene antes de escribir.

## Aplicación local

Extraer el ZIP. Desde PowerShell, ubicarse en la raíz del repositorio:

```powershell
Set-Location "C:\ruta\mantto_gestor_frontend"
& "C:\ruta\FIX_COBRANZA_COR_ESTADOS_CREAR_EDITAR_V002\APLICAR_FIX_LOCAL.ps1"
```

También se puede indicar la ruta explícitamente:

```powershell
$REPO="C:\ruta\mantto_gestor_frontend"
& "C:\ruta\FIX_COBRANZA_COR_ESTADOS_CREAR_EDITAR_V002\APLICAR_FIX_LOCAL.ps1" -Repo $REPO
```

El script:

1. valida que el repo esté exactamente en el commit base;
2. valida que los archivos afectados estén limpios y coincidan con los blobs de `main`;
3. valida sintaxis de los JS entregados;
4. copia archivos completos y ejecuta transformaciones controladas;
5. ejecuta `node --check` sobre los JS afectados;
6. ejecuta el test específico de Crear/Editar;
7. ejecuta `git diff --check`;
8. audita referencias prohibidas a Índice;
9. si una validación posterior falla, restaura los archivos tocados y elimina los nuevos.

## Validación realizada antes de entregar

- inspección de `main` vigente: **sí**;
- `node --check` backend y frontend nuevo: **OK**;
- prueba de contrato específica: **6/6 OK**;
- auditoría estática de referencias a Índice en los archivos entregados: **OK**;
- prueba contra Aiven live: **NO ejecutada**;
- despliegue Azure: **NO ejecutado**;
- despliegue GitHub Pages/Netlify: **NO ejecutado**;
- validación E2E en navegador contra backend desplegado: **NO ejecutada**.

## Sistemas modificados por esta entrega

Ninguno. Este ZIP solo prepara el FIX local.

- GitHub: **sin cambios**
- Aiven: **sin cambios adicionales**
- Azure: **sin cambios**
- Netlify: **sin cambios**
