# MODULO PANEL DE CONTROL - PRUEBA DE CARGA

**Documento:** Especificacion funcional y tecnica V001  
**Proyecto:** Mantto Gestor  
**Ubicacion funcional:** Panel de Control  
**Nombre visible propuesto:** `Prueba de Carga`  
**Nombre tecnico propuesto:** `panel-control-prueba-carga`  
**Estado:** Fases 1-5 integradas; FIX runner central/desktop only pre Fase 6 aplicado localmente. Las secciones de Fases 3-4 conservan contexto histórico; el contrato vigente está en `README_FIX_FASE_5_RUNNER_CENTRAL_DESKTOP_ONLY_PRE_FASE_6_V001.md`.
**Persistencia de resultados:** Ninguna  
**Objetivo maximo inicial:** 200 usuarios concurrentes  

## Decisiones vigentes para las fases siguientes (28/09/2026)

Estas decisiones del propietario del proyecto prevalecen sobre cualquier frase anterior de esta V001 que sugiera un tope fijo de 200 VUs:

- **200 VUs es la meta inicial de validacion, no un limite permanente.** Cada entorno define un maximo operativo positivo mediante `LOAD_TEST_MAX_VUS`. Frontend, backend y runner deben respetar ese maximo configurado, los multiplos de 10 y la duracion maxima. Ninguna prueba es ilimitada.
- El acceso administrativo a Prueba de Carga corresponde al **Programador general** mediante los permisos del catalogo ya aplicados en Aiven. No se concede por defecto a Programador United ni a Programador Corellian. La comprobacion del permiso debe referirse al actor autenticado, tambien cuando este activo el Visor de usuarios.
- La Auditoria semanal de cambios ya existe en el mismo Panel de Control. Su implementacion y sus artefactos deben preservarse en todas las fases posteriores.

### Decisiones cerradas para Fases 3 a 6

- **Runner externo:** k6 se ejecuta en otra PC, nunca dentro del proceso Node medido.
- **Credenciales vigentes:** la pantalla no recibe el token del runner. El navegador usa la sesión normal; el runner central se autentica con un secreto de servicio y reclama el trabajo mediante `runner/lease`. El backend conserva solo el hash del token efímero.
- **Identidad funcional separada:** los GET de carga usan otra identidad existente de prueba con permisos exclusivamente de lectura. El runner central obtiene su JWT mediante el login real y lo inyecta solo en el entorno de k6. El JWT del operador nunca llega al runner.
- **Target cerrado:** el backend obtiene el origen permitido de `LOAD_TEST_ALLOWED_ORIGIN`; el runner mantiene un origen confiable versionado y rechaza cualquier `TARGET_URL` que no coincida exactamente en protocolo, host y puerto. Las redirecciones se desactivan globalmente y por request.
- **Una sola instancia/proceso:** V001 exige una sola replica y un solo proceso backend. `LOAD_TEST_SINGLE_INSTANCE=true` es una confirmacion operativa obligatoria y el runtime bloquea workers de Node `cluster`. Si no puede confirmarse esta condicion, no se prepara ni inicia la prueba.
- **Una sola prueba activa:** mientras exista una sesion `LISTA`, `EJECUTANDO` o `FINALIZANDO`, no se permite otra. Al cerrarse, abortarse, fallar o expirar, puede prepararse una nueva.
- **Detencion real (Fase 4 implementada):** el boton Detener lleva la sesion a `FINALIZANDO`; el runner consulta el canal de control, confirma la orden y aborta k6 mediante `exec.test.abort()`. Cambiar solo el Map no se considera detencion.
- **Metricas en vivo (Fase 4 implementada):** se distinguen VUs objetivo, VUs activos enviados por el runner, solicitudes HTTP activas del backend, RPS backend y p95 backend. Las conexiones/requests activas no se presentan como VUs.
- **Reporte (Fase 5):** aceptar el resumen final del runner una sola vez. Si no llega, el reporte debe quedar marcado `INCOMPLETO` con motivo; nunca presentar datos parciales como prueba completa.
- **Cierre (Fase 6):** validar terminacion normal, detencion manual, aborto automatico, perdida del runner, TTL, summary duplicado, tokens, target, redirects y maximo configurado.

### Regla obligatoria de integracion: conservar la Auditoria semanal

**Las fases de Prueba de Carga parten de una version anterior a la Auditoria semanal, porque esta ultima aun no esta en un commit del repositorio.** Por eso, un archivo completo tomado de `main` o de una entrega de fase no contiene el codigo de Auditoria. Antes de integrar cada fase, tomar como referencia obligatoria el codigo local actual de este workspace. Revisar `git status --short` y el diff, y fusionar los cambios sobre esa version; **no reemplazar archivos completos con copias de `main`, de la base `37780b3` o de entregas anteriores**.

El codigo concreto que debe seguir presente en `modules/panel-control/panel-control.js` incluye el estado:

```js
auditWeek:null,
auditCompany:'',
auditModule:'',
auditType:'',
auditLayer:''
```

Y esta rama de `renderMain()`, colocada **antes** de los retornos por `state.bootLoading` y `state.error`:

```js
if(state.tab==='audit'){
  renderChangeAudit(box);
  updateSaveButton();
  return;
}
```

Debe conservarse completo el bloque que empieza en `const AUDIT_ZONE='America/Mexico_City';` y termina al cerrar `renderChangeAudit(box)`; contiene el calculo semanal, el alcance por empresa, los filtros, las tarjetas, el escape de texto y la comprobacion de version. El codigo exacto se adjunta en `implementacion/CODIGO_AUDITORIA_A_CONSERVAR_V001.md`, extraido del workspace local actual. Llevar ese archivo junto con cada entrega de fase si el ejecutor solo tiene el commit antiguo. No sustituir el bloque por el placeholder `Auditoria historica completa se integrara...`.

Las referencias del HTML deben incluir ambos artefactos, con la version de cache que el generador actualiza al SHA del despliegue:

```html
<script src="./core/build-info.generated.js?v=<SHA_DEL_DESPLIEGUE>"></script>
<script src="./core/change-audit.generated.js?v=<SHA_DEL_DESPLIEGUE>"></script>
```

En `core/module-loader.js`, la entrada `panel-control` debe cargar el CSS que contiene `.pc-change-audit` y el JS fusionado con **ambas** funciones, Auditoria y Prueba de Carga. Al cambiar esos archivos se debe renovar su `?v=` y tambien el `?v=` de `core/module-loader.js` en `index.html`; no reutilizar la version de cache de un archivo anterior.

En particular, al modificar `modules/panel-control/panel-control.js`, `modules/panel-control/panel-control.css`, `core/module-loader.js` o `index.html`:

1. Conservar la pestaña y el renderizador `renderChangeAudit`, sus filtros, alcance por empresa, resumen semanal y boton global de guardado deshabilitado.
2. Conservar la carga de `core/change-audit.generated.js` junto con `core/build-info.generated.js`, sus versiones de cache por commit y los estilos `.pc-change-audit`.
3. Conservar `audit/changes/`, `audit/change.schema.json`, `tools/generate-change-audit.js`, la generacion en GitHub Pages y Netlify, y `tests/change-audit-generator.test.js`.
4. Aplicar cambios puntuales; no volver al texto provisional de Auditoria ni revertir una funcion ajena para montar Prueba de Carga. Si una fase requiere cambiar el mismo bloque, fusionar ambos comportamientos.
5. Antes de cerrar cada fase, ejecutar `node --test tests/change-audit-generator.test.js`, `node --check modules/panel-control/panel-control.js` y `git diff --check`. Verificar en la interfaz que **Auditoria de cambios** y **Prueba de Carga** siguen abriendo desde Panel de Control.

Al revertir una fase de Prueba de Carga, revertir solamente sus cambios. No restaurar los archivos compartidos completos a un commit anterior porque se perderia la Auditoria semanal.

### Correccion de carga del Panel aplicada antes de Fase 3

La consulta `GET /api/panel-control/prueba-carga/capabilities` no debe bloquear `loadBootstrap()` ni la carga de las pestañas existentes. Primero debe terminar el bootstrap normal del Panel; despues se consulta `capabilities` de forma independiente, se actualiza la visibilidad del tab al recibir la respuesta y se vuelve a renderizar. No usar `await` de esa consulta en el camino critico del bootstrap.

Definir un tiempo maximo de espera con `AbortController` (por ejemplo, 5 segundos). En `403`, error o timeout, ocultar el tab de Prueba de Carga y conservar operativas las otras pestañas; `Recargar datos` debe poder reintentar. La falla de capacidades no debe establecer `state.error` global del Panel. Verificar respuestas rapidas, lentas, `403`, error de red y timeout, ademas de comprobar que Auditoria sigue abriendo durante esas condiciones.

---

## 1. Objetivo del modulo

Crear una herramienta interna de Mantto Gestor para ejecutar **una prueba de carga controlada por grupo de usuarios concurrentes** y mostrar, al terminar, un **reporte simple en texto** con los datos tecnicos obtenidos.

El modulo debe permitir seleccionar un grupo como:

- 10 usuarios concurrentes
- 20 usuarios concurrentes
- 30 usuarios concurrentes
- ...
- 200 usuarios concurrentes

Cada ejecucion corresponde a **un solo grupo**.

El modulo **no debe avanzar automaticamente al siguiente grupo**.

Los resultados deben existir unicamente durante la ejecucion y visualizacion de la prueba. No se deben guardar en base de datos, archivos, `localStorage`, `sessionStorage`, IndexedDB ni historicos internos.

---

## 2. Alcance

El modulo debe cubrir cuatro funciones:

1. Configurar una prueba individual.
2. Ejecutar o coordinar la carga contra Mantto Gestor.
3. Recopilar metricas del cliente de carga, backend, Node y MySQL durante la ventana de prueba.
4. Generar un reporte simple de texto para copiar manualmente.

El modulo **no debe**:

- hacer recomendaciones automaticas de optimizacion;
- determinar por si mismo cual es el cuello de botella funcional;
- guardar comparativos historicos;
- modificar datos operativos para generar carga;
- crear usuarios ficticios automaticamente;
- ejecutar pruebas contra URLs arbitrarias;
- escalar automaticamente entre grupos de VUs hasta el maximo configurado;
- generar tablas nuevas de MySQL;
- sustituir las herramientas normales de monitoreo del servidor.

---

## 3. Ubicacion en Mantto Gestor

El modulo debe incorporarse en:

```text
Panel de Control
  -> Prueba de Carga
```

Debe funcionar como una seccion administrativa independiente y no mezclarse con la operacion normal de Home, Portafolio, Call Center, Ventas, Instalaciones u otros modulos.

La implementacion debe respetar la modularidad vigente del proyecto.

---

## 4. Principio principal: datos desechables

Los resultados de una prueba son **temporales**.

### Prohibido persistir

No se debe escribir informacion de pruebas en:

```text
MySQL
Aiven
archivos .json
archivos .txt
archivos .csv
logs dedicados de resultados
localStorage
sessionStorage
IndexedDB
cookies
```

### Permitido

Durante una prueba se permite mantener informacion solamente en:

```text
memoria RAM del navegador
memoria RAM temporal del backend
memoria del proceso generador de carga
```

Al eliminar/cerrar la sesion temporal o vencer su TTL, esa informacion desaparece.

El modulo no debe crear una tabla de auditoria ni una tabla de resultados.

### Nota sobre logs de infraestructura

El modulo no debe escribir resultados en logs propios. Si el reverse proxy, sistema operativo o plataforma mantienen access logs generales, esos logs quedan fuera del contrato funcional de este modulo y no deben contener el cuerpo del reporte ni metricas agregadas de la prueba.

---

## 5. Modelo de ejecucion

La carga **no debe generarse dentro del mismo proceso Node que se esta midiendo**.

Hacerlo provocaria que el propio servidor consumiera CPU y RAM para atacarse a si mismo, contaminando la medicion.

La arquitectura debe ser:

```text
PC de prueba / Runner k6
        |
        | solicitudes HTTP reales
        v
Servidor Mantto Gestor
        |
        +-- API Node/Express
        +-- MySQL
        +-- Jobs
        +-- Storage

Panel de Control -> Prueba de Carga
        |
        +-- inicia ventana temporal de telemetria
        +-- muestra estado
        +-- recibe resumen del runner
        +-- construye reporte de texto
```

El script de carga puede formar parte permanente del repositorio. Lo que no se conserva son los resultados de sus ejecuciones.

---

## 6. Generador de carga

### Tecnologia

Usar **k6** como generador de carga externo.

Archivos V001:

```text
scripts/load-test/mantto-gestor-load-test.config.js
scripts/load-test/mantto-gestor-load-test.k6.js
scripts/load-test/iniciar-mantto-load-test.ps1
```

El launcher técnico recibe solamente un `session-id` no secreto por linea de comandos. El runner central usa credenciales de host para la identidad funcional, obtiene su JWT por el login real y lo inyecta solo en el entorno de k6. No solicita ni recibe JWT del Programador general.

El token efimero de runner **no** se entrega a la pantalla ni por argumentos de PowerShell. El runner central lo obtiene mediante `runner/lease` y lo inyecta en el entorno del proceso k6.

El runner no acepta un target arbitrario. Su origen de Mantto Gestor esta versionado y debe coincidir con `LOAD_TEST_ALLOWED_ORIGIN` devuelto por el backend. Si existe `TARGET_URL` y apunta a otro origen, la ejecucion se rechaza antes de enviar autenticacion.

Las redirecciones HTTP quedan desactivadas globalmente y por solicitud. Un `3xx` no debe sacar la prueba del origen autorizado.

## 7. Grupos permitidos

La interfaz debe construir los grupos a partir de la configuracion efectiva del entorno. La meta inicial de validacion usa 10, 20, 30, ... hasta 200 VUs, pero si `LOAD_TEST_MAX_VUS` aumenta en el futuro, la misma interfaz y el runner deben permitir los nuevos grupos sin cambiar codigo.

Ejemplo inicial:

```text
10
20
30
...
190
200
```

Ejemplo futuro con `LOAD_TEST_MAX_VUS=1000`:

```text
10
20
30
...
990
1000
```

El backend debe imponer siempre el maximo configurado, independientemente del frontend.

### Regla dura

```text
VUS_MIN = LOAD_TEST_MIN_VUS
VUS_MAX = LOAD_TEST_MAX_VUS
VUS_STEP = LOAD_TEST_VUS_STEP
```

No existe un tope fijo de 200 en V001. Se rechaza cualquier valor mayor al `LOAD_TEST_MAX_VUS` vigente o que no respete el paso configurado.

No debe existir una opcion como `Ilimitado` o `Maximo posible`.

---

## 8. Una prueba = un grupo

Una ejecucion solamente puede representar un grupo.

Ejemplo:

```text
Prueba actual: 70 usuarios concurrentes
Duracion: 120 segundos
```

Al concluir, el modulo termina y entrega el reporte correspondiente a esos 70 usuarios.

No debe ejecutar automaticamente:

```text
70 -> 80 -> 90
```

Para probar otro grupo se crea una nueva ejecucion manual.

---

## 9. Duracion de la prueba

La duracion debe ser configurable dentro de limites controlados.

### Valores propuestos V001

```text
Minimo: 30 segundos
Default: 120 segundos
Maximo: 300 segundos
```

La interfaz puede ofrecer presets:

```text
30 s
60 s
120 s
180 s
300 s
```

No debe permitirse una prueba indefinida.

---

## 10. Tipo de trafico

V001 debe utilizar **trafico de lectura** para evitar modificar Produccion durante la prueba.

Permitido en escenarios funcionales:

```text
GET
HEAD
```

No deben utilizarse para generar carga operativa:

```text
POST
PUT
PATCH
DELETE
```

La unica excepcion son los endpoints administrativos internos del propio modulo utilizados para crear/cerrar la sesion efimera de telemetria.

---

## 11. Escenarios

El modulo debe manejar escenarios definidos por codigo y no permitir escribir una URL libre.

### V001

Se propone iniciar con:

```text
SALUD
HOME
CALL_CENTER
MIXTO_LECTURA
```

Los endpoints concretos de cada escenario deben declararse en un catalogo tecnico versionado y solo pueden agregarse despues de verificar que existan en `main` y sean seguros para lectura.

### Endpoints actualmente confirmados que pueden formar parte del catalogo

```text
/api/health
/api/home/bootstrap
/api/home/snapshot
/api/operacion/dashboard-call-center/inicial
```

La inclusion definitiva de cada endpoint debe respetar sus permisos y requerimientos de autenticacion.

### MIXTO_LECTURA

Debe simular navegacion alternando endpoints autorizados de lectura con tiempos de espera realistas entre solicitudes.

No debe ejecutar todos los endpoints en un bucle sin pausa, salvo que se seleccione expresamente un escenario tecnico de estres de endpoint.

---

## 12. Autenticacion de la prueba

La prueba utiliza **dos identidades distintas**:

1. **Programador general propietario de la sesion:** autentica `runner-claim` e inicio/cierre administrativo.
2. **Identidad funcional de prueba:** realiza exclusivamente los GET/HEAD del escenario y debe tener los permisos de lectura necesarios.

El modulo no crea usuarios automaticamente ni guarda credenciales.

### runner-claim de un solo uso

Flujo V001:

```text
Pantalla prepara sesion -> LISTA
PC externa inicia launcher
launcher solicita JWT operador + JWT prueba mediante prompt seguro
k6 -> POST runner-claim autenticado como propietario
backend valida actor + permiso + propiedad + single-instance
backend genera token efimero
backend guarda solo SHA-256(token)
backend devuelve token una sola vez a k6
k6 -> POST start
k6 genera GET/HEAD con JWT funcional + headers de prueba
```

Si el claim ya fue consumido, no se emite un segundo token. Debe limpiarse la sesion y prepararse otra.

Ningun token debe aparecer en comandos impresos, logs propios del modulo o reportes.

## 13. Cabecera de identificacion de trafico

Toda solicitud generada por la herramienta debe incluir una cabecera tecnica, por ejemplo:

```http
X-Mantto-Load-Test: <session-id>
```

Ademas, V001 exige:

```http
X-Mantto-Load-Test-Token: <token-efimero>
X-Mantto-Load-Test-Instance: <process-instance-id>
```

El backend valida token e instancia antes de permitir que la solicitud marcada alcance una ruta de negocio. Esto permite detectar trafico que haya llegado a otro proceso cuando V001 exige single-instance.

Esto permite que el backend distinga trafico de prueba del trafico humano sin cambiar el contrato de los endpoints operativos.

La cabecera no concede permisos funcionales. La autenticacion normal del Gestor sigue aplicando.

---

## 14. Sesion temporal de telemetria

Al iniciar una prueba el backend debe crear un contexto **en memoria**, nunca en MySQL.

Ejemplo conceptual:

```js
{
  id: "load_xxx",
  createdAt: 0,
  expiresAt: 0,
  vus: 50,
  durationSeconds: 120,
  scenario: "MIXTO_LECTURA",
  counters: {},
  serverSamples: [],
  querySamples: []
}
```

Este objeto desaparece cuando:

- termina la prueba y se libera manualmente;
- el usuario pulsa `Limpiar`;
- vence el TTL;
- se reinicia el proceso Node.

### TTL propuesto

```text
15 minutos despues de finalizada la prueba
```

El TTL solo existe para permitir que el usuario copie el reporte antes de eliminarlo.

---

## 15. Una sola prueba activa

V001 debe permitir **una sola prueba activa por servidor**.

Si existe una prueba en curso y otro usuario intenta iniciar otra:

```text
HTTP 409
LOAD_TEST_ALREADY_RUNNING
```

Esto evita mezclar resultados y evita duplicar accidentalmente la carga.

---

## 16. Metricas del runner

El generador de carga debe entregar como minimo:

```text
usuarios concurrentes configurados
usuarios concurrentes alcanzados
inicio
fin
duracion real
requests totales
requests exitosos
requests fallidos
requests por segundo
bytes recibidos
bytes enviados
latencia minima
latencia media
p50
p90
p95
p99
latencia maxima
timeouts
errores de conexion
HTTP 2xx
HTTP 3xx
HTTP 4xx
HTTP 5xx
```

Tambien debe agrupar resultados por endpoint.

---

## 17. Metricas del backend

Durante la ventana de prueba deben recopilarse en memoria:

```text
requests activos
maximo de requests simultaneos observados
requests terminados
requests con error
latencia del backend
p50 backend
p95 backend
p99 backend
```

El middleware de telemetria solo debe medir solicitudes marcadas con `X-Mantto-Load-Test`.

No debe agregar sobrecarga significativa al trafico normal.

---

## 18. Metricas Node.js

Recopilar durante la prueba:

```text
RSS actual
RSS maximo
heapUsed actual
heapUsed maximo
heapTotal
external memory
CPU del proceso
Event Loop Delay
Event Loop Delay p95
uptime
```

Para Event Loop Delay debe utilizarse una API soportada por Node, por ejemplo `perf_hooks.monitorEventLoopDelay()`.

---

## 19. Metricas del host

Cuando el sistema operativo lo permita, incluir:

```text
CPU host promedio
CPU host maximo
RAM total
RAM usada
RAM usada maxima
load average
```

Si una metrica no puede obtenerse de forma confiable debe aparecer como:

```text
N/D
```

Nunca se debe inventar un valor.

---

## 20. Metricas MySQL

El modulo debe intentar obtener informacion de MySQL sin modificar datos.

Metricas deseables:

```text
Threads_connected
Threads_running
Connections
Aborted_connects
Questions / Queries
Slow_queries
```

Si el usuario de MySQL no tiene privilegios suficientes para alguna metrica, esa metrica debe reportarse como `N/D`.

No se deben elevar privilegios automaticamente para este modulo.

---

## 21. Pool MySQL de Node

El modulo debe instrumentar el pool de manera soportada por nuestra propia capa de acceso, sin depender de propiedades privadas no documentadas de `mysql2`.

Metricas objetivo:

```text
consultas iniciadas
consultas finalizadas
consultas activas
maximo simultaneo observado
tiempo total de consulta
p50 consulta
p95 consulta
p99 consulta
consultas lentas
errores SQL
```

Si se instrumenta `getConnection()`, tambien:

```text
adquisiciones de conexion
conexiones en uso observadas
tiempo esperando conexion
```

La instrumentacion debe ser temporal y asociada exclusivamente a la sesion de carga.

---

## 22. Consultas lentas

El backend actual ya cuenta con observabilidad central de consultas y fingerprint SQL en:

```text
backend/src/config/db.js
```

El modulo debe reutilizar esa idea y agregar un colector efimero para la prueba.

Para cada consulta lenta se permite conservar temporalmente:

```text
fingerprint
operation
duration_ms
sql_shape anonimizado
cantidad de apariciones
max duration
p95 aproximado si existe muestra suficiente
```

No deben almacenarse parametros SQL ni valores sensibles.

---

## 23. Metricas por endpoint

El reporte debe identificar, como minimo, los endpoints con mayor latencia.

Para cada endpoint utilizado:

```text
metodo
ruta normalizada
requests
errores
p50
p95
p99
max
```

Las rutas con IDs deben normalizarse para no generar cientos de entradas distintas.

Ejemplo:

```text
/api/tickets/123
/api/tickets/456
```

pueden agruparse conceptualmente como:

```text
/api/tickets/:id
```

si la ruta de prueba llegara a utilizar detalles.

---

## 24. Protecciones de Produccion

Aunque el modulo se utiliza para encontrar limites, V001 debe incluir protecciones para evitar una ejecucion claramente destructiva.

### Limites operativos

```text
maximo LOAD_TEST_MAX_VUS del entorno
maximo 300 s
una prueba simultanea
solo escenarios registrados
solo mismo backend Mantto Gestor
sin URLs externas arbitrarias
sin escritura operativa
```

`200 VUs` es la meta inicial de validacion, no un limite duro del codigo.

### Boton de emergencia

Debe existir siempre:

```text
[ DETENER PRUEBA ]
```

Debe detener nuevas iteraciones del runner y cerrar la ventana de telemetria.

### Abortos de emergencia propuestos

El runner puede detener la prueba si existe una condicion severa sostenida, por ejemplo:

```text
backend inaccesible repetidamente
tasa de HTTP 5xx >= 10 % durante una ventana sostenida
p95 >= 5 s durante una ventana sostenida
fallos de conexion masivos
```

Estos abortos son mecanismos de proteccion, no una evaluacion final del rendimiento.

Fase 4 implementa en backend umbrales configurables mediante `LOAD_TEST_PROTECTION_MIN_REQUESTS`, `LOAD_TEST_PROTECTION_5XX_PERCENT` y `LOAD_TEST_PROTECTION_P95_MS`. Al dispararse, la sesion entra a `FINALIZANDO` con fuente `AUTOMATIC` y el runner recibe la misma orden `ABORT` que en una detencion manual.

---

## 25. Interfaz propuesta

### Encabezado

```text
Prueba de Carga
Pruebas temporales de concurrencia contra Mantto Gestor.
Los resultados no se almacenan.
```

### Configuracion

```text
Entorno:         Produccion / host detectado (solo lectura)
Escenario:       [ MIXTO_LECTURA v ]
Usuarios:        [ 50 v ]
Duracion:        [ 120 s v ]

[ Preparar prueba ]
```

No debe existir un campo editable libre para URL de destino.

---

## 26. Estado de preparacion

Al preparar una prueba:

```text
Sesion: LOAD-XXXX
Usuarios: 50
Duracion: 120 s
Escenario: MIXTO_LECTURA
Estado: LISTA
```

El modulo debe mostrar el comando o configuracion necesaria para ejecutar el runner externo sin revelar secretos permanentes.

Ejemplo conceptual:

```powershell
$env:VUS="50"
$env:DURATION="120s"
k6 run .\mantto-gestor-load-test.k6.js
```

Los valores sensibles deben inyectarse por variables y no imprimirse en pantalla si contienen credenciales.

---

## 27. Vista durante la prueba

Mostrar un panel compacto:

```text
PRUEBA EN CURSO

Usuarios objetivo:     50
Usuarios activos:      50
Tiempo:                 00:48 / 02:00
Requests:               4,826
RPS:                    101.2
p95 actual:             612 ms
Errores:                0.15 %
CPU Node:               38 %
RAM Node:               412 MB
MySQL Threads_running:  6

[ DETENER PRUEBA ]
```

No es necesario graficar en V001.

La prioridad es entregar cifras claras y poco ruido visual.

---

## 28. Reporte final

El resultado debe ser **texto plano copiable**.

No PDF.

No Excel.

No archivo JSON visible al usuario.

No registro historico.

### Formato obligatorio propuesto

```text
=== MANTTO GESTOR - PRUEBA DE CARGA ===

Grupo: 50 usuarios concurrentes
Escenario: MIXTO_LECTURA
Duracion configurada: 120 s
Duracion real: 120.4 s
Estado de ejecucion: COMPLETADA

TRAFICO
Requests totales: 12,184
Requests/s: 101.2
Exitosos: 12,160
Fallidos: 24
Errores: 0.20 %

LATENCIA GLOBAL
Min: 42 ms
Media: 188 ms
p50: 141 ms
p90: 382 ms
p95: 514 ms
p99: 890 ms
Max: 1,442 ms

HTTP
2xx: 12,160
3xx: 0
4xx: 18
5xx: 6
Timeouts: 0

SERVIDOR
CPU Node promedio: 34 %
CPU Node maximo: 58 %
RAM Node inicial: 280 MB
RAM Node maxima: 436 MB
Event Loop p95: 21 ms
CPU host maxima: 64 %
RAM host maxima: 42 %

MYSQL
Threads_connected max: 12
Threads_running max: 7
Consultas: 28,510
Consultas lentas: 4
Errores SQL: 0

ENDPOINTS MAS LENTOS POR p95
1. GET /api/operacion/dashboard-call-center/inicial - 1,204 ms
2. GET /api/home/bootstrap - 611 ms
3. GET /api/home/snapshot - 428 ms

QUERIES LENTAS
1. fingerprint: 8bd25f1c... | 1,120 ms max | 3 ejecuciones
   SQL: SELECT ...
2. fingerprint: 47cfe8a1... | 861 ms max | 1 ejecucion
   SQL: SELECT ...

PROTECCION
Abortada automaticamente: NO
Motivo de aborto: N/A

=== FIN REPORTE ===
```

Los numeros anteriores son exclusivamente un ejemplo del formato y no representan mediciones reales.

---

## 29. Botones del reporte

Al finalizar:

```text
[ Copiar reporte ]
[ Limpiar ]
```

No debe existir en V001:

```text
Guardar
Historial
Exportar a BD
Exportar CSV
Comparar pruebas
```

`Limpiar` elimina la sesion temporal y deja el modulo listo para una nueva prueba.

---

## 30. Estados del modulo

Estados funcionales de la implementacion incremental:

```text
IDLE / sin sesion
LISTA
EJECUTANDO
FINALIZANDO
FINALIZADA
ABORTADA_MANUAL
ABORTADA_AUTOMATICA
ABORTADA_RUNNER
ABORTADA_SIN_CONFIRMACION
```

`LISTA`, `EJECUTANDO` y `FINALIZANDO` bloquean otra prueba simultanea. Los estados terminales liberan el bloqueo. Fase 5 agregara la clasificacion final del reporte usando el summary de k6.

### Metricas vivas de Fase 4

La pantalla diferencia explicitamente la fuente de cada valor:

```text
VUs objetivo             = configuracion de sesion
VUs activos k6           = muestra enviada por runner
Requests activos backend = telemetria Express
RPS backend              = solicitudes completadas / tiempo observado
p95 backend              = latencia medida por Express
```

No se usa el numero de requests activos como sustituto de VUs. El summary y el p95 final vistos por k6 se incorporan en Fase 5.

---

## 31. Endpoints de Prueba de Carga

Todos bajo Panel de Control.

### Administrativos implementados hasta Fase 4

```text
GET    /api/panel-control/prueba-carga/capabilities
POST   /api/panel-control/prueba-carga/session
GET    /api/panel-control/prueba-carga/session/:id
POST   /api/panel-control/prueba-carga/session/:id/runner-claim
POST   /api/panel-control/prueba-carga/session/:id/start
POST   /api/panel-control/prueba-carga/session/:id/stop
DELETE /api/panel-control/prueba-carga/session/:id
```

Estos endpoints usan la autenticacion normal del Gestor y los permisos efectivos del actor autenticado.

### Canal efimero del runner implementado en Fase 4

```text
GET    /api/panel-control/prueba-carga/session/:id/runner-control
POST   /api/panel-control/prueba-carga/session/:id/runner-sample
POST   /api/panel-control/prueba-carga/session/:id/runner-stop-ack
POST   /api/panel-control/prueba-carga/session/:id/runner-abort
POST   /api/panel-control/prueba-carga/session/:id/runner-finish
```

El canal runner se autentica mediante el token efimero obtenido por `runner-claim`; el backend conserva unicamente su hash. No se reenvia el JWT del Programador general en cada heartbeat.

### Reservados para Fase 5

```text
POST   /api/panel-control/prueba-carga/session/:id/runner-summary
GET    /api/panel-control/prueba-carga/session/:id/report
```

Ningun endpoint de este conjunto persiste resultados. `DELETE` elimina el contexto temporal cuando la sesion ya no esta ejecutando/finalizando.

---

## 32. Seguridad de los endpoints

Todos los endpoints administrativos requieren autenticacion normal de Mantto Gestor.

Ademas deben usar permisos funcionales especificos.

Codigos propuestos:

```text
PANEL_CONTROL_PRUEBA_CARGA_ACCESO_VISUAL_MODULO.ACCESO_VISUAL
PANEL_CONTROL_PRUEBA_CARGA_EJECUCION.EJECUTAR
PANEL_CONTROL_PRUEBA_CARGA_EJECUCION.DETENER
```

No se debe depender unicamente de ocultar botones en frontend.

Los permisos deben validarse en backend utilizando el sistema de permisos existente.

No se crean tablas nuevas para permisos.

---

## 33. Token de runner

La sesion debe producir un token efimero distinto al JWT normal del usuario.

Caracteristicas:

```text
uso exclusivo para identificar una prueba
TTL corto
asociado a session-id
asociado a escenario
asociado al limite de VUs
autorizado solo para enviar telemetria/resumen de esa prueba
no concede permisos de negocio
```

El runner sigue necesitando autenticacion normal para acceder a endpoints protegidos.

---

## 34. Proteccion contra uso como herramienta de ataque

El modulo no debe aceptar:

```text
https://google.com
https://otraempresa.com
IP arbitraria
puerto arbitrario
ruta arbitraria escrita por el usuario
```

El target se deriva de la configuracion oficial del propio Gestor.

Los escenarios son una allowlist versionada.

Esto evita convertir el modulo en un generador de trafico contra terceros.

---

## 35. Middleware de telemetria

Se propone un middleware especializado que solo se active cuando exista:

```http
X-Mantto-Load-Test
```

Responsabilidades:

1. validar session-id;
2. incrementar requests activos;
3. registrar `hrtime` de inicio;
4. observar `finish/close` de la respuesta;
5. agrupar status HTTP;
6. agrupar latencia por ruta;
7. decrementar requests activos;
8. actualizar maximos;
9. no escribir en disco ni BD.

No debe almacenar cuerpos de request ni response.

---

## 36. Colector de sistema

Durante `EJECUTANDO` debe iniciarse un timer temporal, por ejemplo cada 1 segundo.

Muestra:

```text
CPU Node
RSS
heapUsed
Event Loop Delay
CPU host
RAM host
MySQL Threads_connected
MySQL Threads_running
```

Al finalizar se cancela el timer.

Las muestras quedan unicamente en memoria hasta construir el reporte.

---

## 37. Colector SQL temporal

La capa `backend/src/config/db.js` ya observa `query` y `execute` y calcula:

```text
duration_ms
operation
fingerprint
sql_shape
```

La implementacion del modulo debe extender esa observabilidad de forma desacoplada para que, cuando exista una sesion de carga activa, pueda alimentar un acumulador temporal.

No debe sustituir el comportamiento vigente de DB observability ni cambiar los resultados de las queries.

---

## 38. Consumo de memoria del propio modulo

Para evitar que la telemetria cause el problema que intenta medir, no se debe guardar una fila por request.

Se deben utilizar acumuladores:

```text
count
sum
min
max
histograma/reservoir para percentiles
conteo por status
conteo por endpoint
conteo por fingerprint
```

Los detalles deben tener limites.

Ejemplo:

```text
max endpoints conservados: 100
max fingerprints conservados: 100
max muestras sistema: 600
```

Con esto el consumo del modulo permanece acotado.

---

## 39. Percentiles

Deben mostrarse como minimo:

```text
p50
p90
p95
p99
```

La implementacion puede utilizar histogramas o muestras acotadas.

No se debe calcular un percentil falso a partir de un promedio.

Si no existe suficiente informacion para calcularlo, mostrar `N/D`.

---

## 40. Integridad de la medicion

La prueba debe distinguir:

```text
latencia vista por k6
latencia observada dentro de Express
latencia de MySQL
```

Esto permite saber si el tiempo se consume en:

```text
red
reverse proxy
Node
MySQL
```

El modulo no necesita diagnosticar automaticamente el cuello de botella; solo debe entregar los datos necesarios.

---

## 41. Diferencia de relojes

Los tiempos internos de backend deben medirse con reloj monotono (`process.hrtime.bigint()` o equivalente), no solamente con `Date.now()`.

Las fechas de inicio/fin pueden utilizar UTC ISO para referencia humana.

---

## 42. Errores

El reporte debe distinguir:

```text
HTTP 4xx
HTTP 5xx
timeout
connection refused
connection reset
DNS/error de red
error de runner
error SQL
```

Un 401/403 no debe mezclarse con un 500.

---

## 43. Cancelacion - Fase 4 implementada

Cuando el usuario pulsa `DETENER PRUEBA`:

1. la sesion pasa de `EJECUTANDO` a `FINALIZANDO`;
2. el backend publica `ABORT` en el canal temporal de control;
3. VU 1 del runner consulta periodicamente ese canal;
4. el runner confirma la orden mediante `runner-stop-ack`;
5. k6 ejecuta `exec.test.abort()` y deja de iniciar nuevas iteraciones;
6. `teardown()` intenta confirmar el cierre mediante `runner-finish`;
7. el backend espera durante `LOAD_TEST_DRAIN_TIMEOUT_SECONDS` las operaciones HTTP/SQL/pool que ya estaban en vuelo;
8. la sesion termina como `ABORTADA_MANUAL` y queda con integridad `PENDIENTE_RESUMEN` hasta Fase 5;
9. si el runner no confirma dentro de `LOAD_TEST_FINALIZATION_TIMEOUT_SECONDS`, termina `ABORTADA_SIN_CONFIRMACION` con integridad `INCOMPLETO` y se libera el bloqueo de nueva prueba.

Al entrar a `FINALIZANDO`, el middleware deja de admitir nuevas solicitudes funcionales marcadas. Las solicitudes ya admitidas pueden cerrar su telemetria durante el drenaje.

---

## 44. Perdida de conexion del Panel

La prueba no debe depender de que la pestana permanezca constantemente renderizando.

El estado temporal principal vive en RAM del backend y runner mientras la prueba esta activa.

Sin embargo, debido a la regla de no persistencia, una recarga del frontend puede perder la referencia visual si no se conserva el `session-id`.

V001 debe priorizar no persistir y puede mostrar la advertencia:

```text
No recargues o cierres esta pantalla durante una prueba.
Los resultados son temporales.
```

---

## 45. Frontend propuesto

Para mantener modularidad:

```text
modules/panel-control-prueba-carga/
  panel-control-prueba-carga.js
  panel-control-prueba-carga.css
```

El Panel de Control principal solamente debe registrar/abrir el modulo.

Debe evitarse aumentar innecesariamente el ya grande archivo:

```text
modules/panel-control/panel-control.js
```

---

## 46. Backend propuesto

Estructura recomendada:

```text
backend/src/modules/panel-control-prueba-carga/
  panel-control-prueba-carga.routes.js
  panel-control-prueba-carga.controller.js
  panel-control-prueba-carga.service.js
  panel-control-prueba-carga.telemetry.js
  panel-control-prueba-carga.registry.js
  panel-control-prueba-carga.contract.js
  panel-control-prueba-carga.constants.js
```

No necesita Repository porque V001 no persiste en base de datos.

Si necesita consultar metricas MySQL, esas lecturas tecnicas pueden encapsularse en un archivo especializado, por ejemplo:

```text
panel-control-prueba-carga.mysql-metrics.js
```

sin guardar resultados.

---

## 47. Integracion de rutas

La ruta debe montarse bajo el namespace existente de Panel de Control.

El archivo actual confirmado es:

```text
backend/src/routes/panel-control.routes.js
```

La integracion debe ser minima y delegar al nuevo modulo.

---

## 48. Script k6 V001

Archivos:

```text
scripts/load-test/mantto-gestor-load-test.config.js
scripts/load-test/mantto-gestor-load-test.k6.js
scripts/load-test/iniciar-mantto-load-test.ps1
```

Responsabilidades implementadas hasta Fase 4:

```text
leer VUs/duracion/escenario obtenidos por el launcher desde la sesion preparada
validar VUs <= LOAD_TEST_MAX_VUS recibido desde capabilities
validar pasos de LOAD_TEST_VUS_STEP
reclamar token efimero una sola vez
usar identidad operadora solo para claim/start
usar identidad de prueba separada para GET/HEAD funcionales
validar catalogo runner/backend
usar target Mantto versionado
rechazar TARGET_URL externo
desactivar redirecciones globalmente y por request
inyectar session-id, token e instance-id
respetar duracion
publicar muestras temporales de VUs activos desde el runner
consultar periodicamente el canal de control
confirmar orden de cancelacion y ejecutar exec.test.abort()
notificar abortos propios del runner
confirmar cierre mediante teardown -> runner-finish
```

El script no debe contener ni persistir:

```text
passwords
JWT permanentes
API keys permanentes
token efimero del runner
URLs arbitrarias de terceros
```

`handleSummary()` y el envio del resumen definitivo pertenecen a Fase 5. El canal de cancelacion real, ACK, muestras vivas del runner y `runner-finish` quedaron implementados en Fase 4.

## 49. Contrato del resumen del runner

Ejemplo conceptual:

```json
{
  "session_id": "LOAD-XXXX",
  "vus_configured": 50,
  "vus_max": 50,
  "duration_ms": 120400,
  "requests": 12184,
  "failed": 24,
  "rps": 101.2,
  "latency": {
    "min": 42,
    "avg": 188,
    "p50": 141,
    "p90": 382,
    "p95": 514,
    "p99": 890,
    "max": 1442
  },
  "http": {
    "2xx": 12160,
    "3xx": 0,
    "4xx": 18,
    "5xx": 6
  }
}
```

Este JSON solo viaja en memoria/HTTP para construir el reporte y no se persiste.

---

## 50. Pruebas del propio modulo

El modulo debe incluir tests que validen como minimo:

```text
rechaza VUs superiores a LOAD_TEST_MAX_VUS
no permite VUs no multiplos de 10
no permite dos pruebas simultaneas
no permite escenarios desconocidos
no permite target externo
no persiste resultados
elimina la sesion al limpiar
expira la sesion por TTL
calcula conteos HTTP correctamente
calcula percentiles correctamente
no captura cuerpos ni parametros sensibles
solo mide requests marcados con la sesion
rechaza runner token invalido
manual stop pasa por FINALIZANDO y requiere ACK/cierre del runner
FINALIZANDO bloquea una segunda prueba
timeout sin confirmacion libera la sesion como INCOMPLETO
VUs activos del runner no se confunden con HTTP activos
proteccion 5xx solicita aborto automatico
proteccion p95 backend solicita aborto automatico
canal runner exige token efimero valido
runner contiene exec.test.abort y no handleSummary en Fase 4
```

---

## 51. Criterios de aceptacion V001

El modulo se considera funcional cuando:

1. aparece en Panel de Control solo para usuarios autorizados;
2. permite seleccionar VUs dentro de LOAD_TEST_MIN_VUS / LOAD_TEST_MAX_VUS respetando LOAD_TEST_VUS_STEP;
3. ejecuta solamente un grupo por prueba;
4. no escala automaticamente;
5. utiliza un runner externo;
6. la carga funcional es de solo lectura;
7. recopila metricas de latencia, errores, Node y MySQL disponibles;
8. entrega un reporte simple por grupo;
9. existe boton `Copiar reporte`;
10. existe boton `Detener prueba` y produce una orden real de aborto atendida por el runner;
11. existe boton `Limpiar`;
12. no crea tablas;
13. no guarda resultados en MySQL;
14. no guarda resultados en archivos;
15. no utiliza almacenamiento web persistente;
16. limita estrictamente al maximo configurado por LOAD_TEST_MAX_VUS, sin tope fijo de 200;
17. no puede utilizarse contra un host externo arbitrario;
18. las credenciales nunca aparecen en el reporte;
19. al limpiar/expirar desaparecen los datos temporales;
20. no modifica contratos funcionales de los demas modulos;
21. VUs activos k6 y requests activos backend se muestran como metricas distintas;
22. si el runner no confirma el cierre, la ejecucion no se presenta como completa;
23. `LISTA`, `EJECUTANDO` y `FINALIZANDO` impiden una segunda prueba simultanea.

---

## 52. Fuera de alcance V001

Se deja explicitamente fuera:

```text
historial de pruebas
comparacion automatica 10 vs 20 vs 30
recomendaciones automaticas
IA dentro del modulo
PDF
Excel
CSV
persistencia de resultados
graficas historicas
pruebas de escritura
creacion automatica de 200 usuarios
stress ilimitado
chaos testing
pruebas distribuidas desde multiples regiones
```

Estas funciones solo se evaluarian en otra version y previa autorizacion.

---

## 53. Compatibilidad con la arquitectura actual

La documentacion y codigo actual del repositorio confirman:

- backend Node.js + Express;
- MySQL mediante `mysql2/promise`;
- pool de conexiones central en `backend/src/config/db.js`;
- Panel de Control backend actual en `backend/src/routes/panel-control.routes.js`;
- frontend actual de Panel de Control en `modules/panel-control/`;
- observabilidad SQL existente en `backend/src/config/db.js`;
- autenticacion mediante `requireAuth`;
- permisos efectivos centralizados en `backend/src/services/permissions/effective-permission.service.js`.

El modulo debe reutilizar estas piezas y no crear un segundo sistema paralelo de autenticacion o permisos.

---

## 54. Dependencias de BD

**V001 no requiere tablas nuevas.**

Solo se permite:

- leer metricas tecnicas MySQL disponibles;
- utilizar las tablas actuales necesarias para autenticar/permisos de acceso al modulo;
- incorporar, si hacen falta, los codigos funcionales del modulo al catalogo de permisos ya existente mediante el mecanismo vigente del proyecto.

No se guarda ningun resultado de prueba en MySQL.

---

## 55. Nombre del reporte

No existe archivo fisico.

El encabezado del texto sera:

```text
MANTTO GESTOR - PRUEBA DE CARGA
```

Y cada reporte identifica claramente su unico grupo:

```text
Grupo: 10 usuarios concurrentes
Grupo: 20 usuarios concurrentes
...
Grupo: 200 usuarios concurrentes
```

---

## 56. Regla final del modulo

> El modulo Prueba de Carga es una herramienta de diagnostico efimera. Ejecuta un unico grupo de concurrencia, recopila datos tecnicos durante esa ejecucion y entrega un reporte simple de texto. No conserva historial, no decide automaticamente el siguiente grupo y no modifica informacion operativa para generar carga.

---

## 57. Fuentes tecnicas revisadas

Repositorio oficial revisado:

```text
ziSirrush/GestorMantto
rama: main
commit de referencia revisado durante el diseno: 962c5d0cdba46586c98d6fae1eb4d883afc46ed1
```

Archivos actuales utilizados como referencia de arquitectura:

```text
backend/src/config/db.js
backend/src/middleware/auth.middleware.js
backend/src/middleware/information-access-gnral.middleware.js
backend/src/services/permissions/effective-permission.service.js
backend/src/routes/panel-control.routes.js
backend/src/modules/dashboard-callcenter/dashboard-callcenter.routes.js
backend/src/modules/dashboard-callcenter/dashboard-callcenter.repository.js
backend/src/modules/home/home.routes.js
backend/src/modules/home/home.service.js
modules/panel-control/panel-control.js
modules/panel-control/panel-control.css
docs/BACKEND_ARQUITECTURA/Catalogo/modules/panel-control.md
```

---

**FIN DEL DOCUMENTO - MODULO PANEL DE CONTROL / PRUEBA DE CARGA V001**

---

## 58. Implementacion Fase 5 - Reporte final efimero

La Fase 5 queda cerrada con estas reglas:

1. `handleSummary(data)` envia al backend un resumen normalizado de k6 al terminar el ciclo de prueba.
2. El envio usa `MANTTO_LOAD_TEST_RUNNER_TOKEN` inyectado en el entorno de k6 por el runner central tras `runner/lease`; la pantalla nunca recibe ese token.
3. `POST /api/panel-control/prueba-carga/session/:id/runner-summary` acepta el resumen una sola vez y lo liga a la sesion.
4. El backend valida `session_id`, VUs configurados y consistencia basica de los conteos antes de aceptar el summary.
5. El summary se conserva solo en RAM y se transforma inmediatamente en reporte de texto.
6. `GET /api/panel-control/prueba-carga/session/:id/report` requiere autenticacion normal, permiso de acceso y propiedad de la sesion.
7. Si el summary no llega dentro de `LOAD_TEST_SUMMARY_TIMEOUT_SECONDS`, la sesion pasa de `PENDIENTE_RESUMEN` a `INCOMPLETO` y genera reporte parcial con motivo `RUNNER_SUMMARY_TIMEOUT`.
8. Un reporte incompleto no sustituye metricas k6 faltantes con cifras del backend; esos campos se muestran como `N/D`.
9. El reporte distingue latencia de k6 de latencia backend Express.
10. El reporte conserva el estado tecnico real (`FINALIZADA`, `ABORTADA_MANUAL`, `ABORTADA_AUTOMATICA`, `ABORTADA_RUNNER`, `ABORTADA_SIN_CONFIRMACION`) y agrega por separado la integridad `COMPLETO` o `INCOMPLETO`.
11. La interfaz presenta exclusivamente `Copiar reporte` y `Limpiar sesion`; no agrega Guardar, Historial, CSV, PDF ni persistencia.
12. Mientras la sesion esta en `PENDIENTE_RESUMEN`, la UI continua consultando estado y no permite limpiar prematuramente la sesion.
13. `LOAD_TEST_MAX_VUS` continua siendo el maximo operativo configurable; 200 VUs sigue siendo solo la meta inicial y no un limite duro.
14. No se crean tablas ni se persisten resultados en MySQL, archivos, LocalStorage, SessionStorage o IndexedDB.

### Endpoint Fase 5

```text
POST /api/panel-control/prueba-carga/session/:id/runner-summary
GET  /api/panel-control/prueba-carga/session/:id/report
```

### Estado de integridad

```text
PENDIENTE_RESUMEN -> COMPLETO
PENDIENTE_RESUMEN -> INCOMPLETO (timeout/perdida de summary)
```

Una ejecucion abortada puede tener integridad `COMPLETO` si k6 entrega correctamente su resumen final. El estado de ejecucion y la integridad del reporte no son equivalentes.
