# INT-10 | FASE 2 de 3 | Fotografias: integracion CORELLIAN + UNITED | V001

Fecha: 16/10/2026. Entrega: ZIP con **archivos completos**. Estado: **preparado, no aplicado ni desplegado**.

## Fuentes verificadas

- Origen funcional del mapa: `JIVMBLT/updated_code`, `main`, SHA `70186ce81f5bf4c5d94d80caae088f6d1596538b`.
- Base del Gestor principal: `ziSirrush/GestorMantto`, `main`, SHA `d2eb24514c2ee5726ee215d6c9fb36daadd66bb3`.
- **Prerequisito**: `FASE_1_INT10_FOTOGRAFIAS_MAPA_ESTADOS_V001.zip`, aplicado a la copia local (la Fase 2 sustituye su JS COMPLETO, conservando el mapa y recursos de la Fase 1).
- Contratos leidos del backend principal: `backend/src/modules/ventas-fotos-mapa/ventas-fotos-mapa.controller.js`, `ventas-fotos-mapa.routes.js` y `backend/src/controllers/ins-fl-read-cor.controller.js`.
- Referencia **no productiva** de estructura/valores: `Sabana Estrutura 071026.sql` y `Sabana 071026.sql` (07/10/2026). Aiven actual sigue siendo la fuente operativa oficial; **no se consulto la BD en vivo**.
- Norma de desarrollo: `PROJECT_CONSTITUTION.md` v2.0, apartados 2, 7, 8, 9, 11, 12, 16, 17, 19 y 23.

## Objetivo operacional

El Gestor principal **ya tenia** los endpoints, datos y equivalencias CORELLIAN/UNITED antes de esta fase. Por tanto, NO se duplica el backend del LAB. La Fase 2 corrige los puntos concretos que impedian que el nuevo mapa representara fielmente esos datos y asegura sincronizacion selectiva.

### A. Estados de los datos reales (correccion necesaria)

- `ins_fl.estado` utiliza codigos (entre ellos `JAL`, `ROO`, `NLE`, `PUE`, `YUC`, `BCS`, `EDO`), mientras `portafolio.estado` utiliza nombres como `Ciudad de México`, `Nuevo León` o `Coahuila`.
- Se agregan equivalencias explicitas de codigos CORELLIAN con los 32 estados del mapa. No se modifica ningun dato de Aiven.
- **El codigo `MEX` es ambiguo en el respaldo de `ins_fl`**: entre los proyectos con foto aparecieron 38 con ciudad `CDMX` y uno con `Huixquilucan`. Se usa la ciudad documentada para determinar `cmx` o `mex`; si falta el dato o es desconocido se conserva en **Sin estado reconocido**, evitando ubicarlo falsamente.
- El codigo `EDO` se reconoce como Estado de Mexico, de acuerdo con los registros de referencia.
- Se agrega `ciudad` al modelo visual de proyectos, desde las columnas **ya devueltas** por el backend.
- En el respaldo del 07/10/2026 se identificaron **184 filas CORELLIAN con fotografias** y **2 UNITED**. Son cifras de una copia historica: **no son conteos confirmados de Aiven hoy**.

### B. Lectura de las dos fuentes sin corte silencioso

- El catalogo original consultaba `limit=5000` una sola vez por origen. Ahora se solicita en paginas de 500, con `offset` y orden estable, hasta completar ambos conjuntos.
- La lectura se mantiene en `ins_proyecto_fotos` + `ins_fl` (CORELLIAN), y `portafolio_proyecto_fotos` + `portafolio` + `proyecto_equivalencias` (UNITED).
- La navegacion hacia cada dominio tambien se consulta paginada; conserva sus Guards existentes. Si una puerta no puede verificarse se ocultan sus botones, sin ampliar permisos.
- Limite de seguridad: 100 paginas de 500 filas por origen (50,000). Si se supera o la API no confirma el offset, **se informa error en lugar de presentar resultados parciales como completos**.
- El endpoint **existente** `GET /api/ventas/fotos-mapa/catalogo-general/fotografias` conserva `data.corellian`, `data.united` y los valores por defecto previos; se añaden campos `limit`, `offset` y `filters`.
- Se agrega `offset` al endpoint **existente** `GET /api/ventas/fotos-mapa/catalogo-general/navegacion-united`, manteniendo sus Guards de CORELLIAN/UNITED sin cambios.

### C. Equivalencias, fotos y sincronizacion

- La union CORELLIAN+UNITED sigue exigiendo el registro explicito de `proyecto_equivalencias`; no se unen proyectos solo porque tengan nombre parecido.
- Una equivalencia que apunte a un **nombre CORELLIAN ambiguo** no fusiona automaticamente fichas distintas. Los enlaces CORELLIAN se determinan por ID cuando este esta disponible (no por coincidencia de nombre).
- Se preservan las **7 fotografias por origen**, el carrusel combinado hasta 14, su foto principal y los botones de navegacion por permiso/alcance de origen.
- Tras `agregar`, `eliminar` o `cambiar principal` (operaciones confirmadas por el backend en `core/details.js`) se relee **solo ese proyecto CORELLIAN** con `?core_project=<id>`; se actualizan foto de portada, mapa, indicadores y mosaicos, incluso si se elimina la ultima foto.
- Se conserva el carrusel/edicion del Gestor principal; **NO se reemplaza `core/details.js`**.
- El filtro `?core_project` retorna solo fotos CORELLIAN del ID pedido y no ejecuta una lectura global UNITED. El equivalente `?united_project` tiene el mismo contrato para UNITED.

## Archivos incluidos (unicamente archivos completos modificados)

```
backend/src/modules/ventas-fotos-mapa/ventas-fotos-mapa.controller.js
modules/ventas-fotos-mapa/ventas-fotos-mapa.js
README_FASE_2_INT10.md
```

**No se incluyen** `.patch`, `.diff`, `.ps1`, ejecutores, instaladores, datos ficticios, migraciones LAB, scripts SQL de escritura ni archivos de otros modulos.

## Dependencias y orden manual al integrar

1. Comprobar que la copia local parte del commit de referencia y que se aplico **Fase 1 INT-10**. Si `main` ha avanzado, comparar primero; no sobreescribir cambios recientes.
2. Incorporar los **dos archivos completos** de este ZIP respetando rutas y estructura.
3. En cualquier entorno donde se compruebe Fase 2, usar **primero el backend actualizado** (Azure u otro backend autorizado para pruebas) y despues el nuevo JS: el cliente verifica expresamente el contrato paginado y falla cerrado ante un backend anterior.
4. Seguir flujo normativo de pruebas `Local -> GitHub Pages -> Netlify`, con promocion a Netlify **manual y autorizada**. Esto es una instruccion de integracion futura, **no un deploy ejecutado**.
5. **Fase 3 pendiente**: permisos efectivos, acceso/alcance, cache bust global (`core/module-loader.js`, `index.html`), PWA y ruta de primer acceso. En esta fase no se cambia el menu ni los permisos.

El ZIP **no es autonomo sin la Fase 1**. No elimina ni reemplaza `mexico-estados.js`, `ventas-fotos-mapa-mexico.css` o `ventas-fotos-mapa.html` incluidos en Fase 1.

## Validaciones ejecutadas

| Validacion | Resultado | Alcance |
|---|---|---|
| `node --check` de ambos JS | PASS | Sintaxis, no navegador |
| Controlador Express con DB simulada | PASS | SQL `SELECT`, paginado, filtros selectivos, respuestas viejas compatibles |
| Navegacion por dominios en VM | PASS | Apertura condicionada por IDs/permiso; si 403 UNITED, sin enlaces UNITED |
| Frontend con API simulada y 5102 proyectos | PASS | Recuperacion completa por 11 paginas, no truncamiento en 5000 |
| Equivalencias y carrete 7+7 | PASS | 14 fotos de ambas fuentes, colisiones de nombre no fusionadas |
| Mutaciones desde callback del carrusel | PASS | Recarga solo del ID afectado, ultima foto eliminada, fuente UNITED preservada |
| Mapa y codigos de estado en VM | PASS | 32 entidades, alias Aiven, distincion MEX/CDMX/Estado de Mexico |
| Contrato obsoleto sin `offset` | PASS | Cliente rechaza lectura potencialmente incompleta |
| Aiven real | NO EJECUTADO | Sin acceso a conexion productiva |
| Navegador autenticado / responsive / PWA / E2E | NO EJECUTADO | Pendiente de pruebas posteriores, no se cuenta como fase operacional |

**No confundir pruebas simuladas o de sintaxis con validacion E2E ni con funcionamiento confirmado en Produccion.**

## Riesgos y decisiones NO alteradas

- Se conserva el contrato GENERAL existente que permite consultar el conjunto fotografico CORELLIAN+UNITED, y los Guards por dominio solo gobiernan la navegacion al proyecto. Su compatibilidad definitiva con el apartado 12 de la Constitucion queda **pendiente de auditoria de Fase 3**; no se amplian permisos de manera silenciosa.
- Se conserva el `limit=5000` maximo por llamada de backend para clientes antiguos; la nueva interfaz usa 500 por pagina.
- Los datos pueden cambiar durante varias lecturas; no se crea una transaccion de snapshot entre peticiones. Antes de publicar hay que probar volumen real y rendimiento.
- La pagina inicial de Fase 2 necesita la nueva version del JS; la invalidacion global de cache sigue pendiente de Fase 3. Una recarga forzada puede ser necesaria en las pruebas previas.
- No se crean tablas, indices, relaciones, columnas, roles, permisos, banderas nuevas ni motores de alcance.

## Sistemas modificados

- GitHub: **NO**.
- Aiven MySQL: **NO**.
- Azure: **NO**.
- GitHub Pages: **NO**.
- Netlify: **NO**.
- Unicamente se crearon **archivos de entrega locales dentro de este ZIP**.

## Reversion manual

- Si se integro Fase 2 en la copia de trabajo, volver a poner **solo** `modules/ventas-fotos-mapa/ventas-fotos-mapa.js` desde el ZIP aprobado de **Fase 1** y `backend/src/modules/ventas-fotos-mapa/ventas-fotos-mapa.controller.js` desde el `main` base en SHA `d2eb24514c2ee5726ee215d6c9fb36daadd66bb3`.
- No ejecutar cambios en Aiven ni en datos de negocio. Se mantienen intactos los 2 recursos nuevos de Fase 1.

## SHA256 de los dos archivos de codigo

- `modules/ventas-fotos-mapa/ventas-fotos-mapa.js`: `739703cc05f036148b6845f0a2ea78d74f88fdb677bdb9cc3cfe6cd7012abd96`.
- `backend/src/modules/ventas-fotos-mapa/ventas-fotos-mapa.controller.js`: `c06bb1f72107d5219faa58a5a46dfa4c6e222ae6948484fbe988845cdf9bf620`.

**Proximo bloque operacional: Fase 3 (permisos, carga global, cache y navegacion).** Las pruebas posteriores al desarrollo NO constituyen una cuarta fase.
