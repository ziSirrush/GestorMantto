# BLT NOW · Navegación normal sin conexión · Fase 2 V001

**Base revisada:** `ziSirrush/GestorMantto`, rama `main`, commit `857f52b8f38062f3171c3198568466b83e7805ac` (Versión `102026.8`, 20-oct-2026). Requiere tener aplicada la **nueva Fase 1 de Navegación Offline**, entregada como `BLTNOW_FIX_NAVEGACION_OFFLINE_FASE_1_V001.zip`.

## Propósito

Hacer que **Operación → Resumen del Día** abra **su interfaz normal**, con tablas, filtros, gráficos, búsqueda y fechas, usando exclusivamente el respaldo completo UNITED de IndexedDB cuando BLT NOW no esté conectado a la API. **Modo Offline sigue siendo exclusivamente la configuración y administración de respaldos.**

La pantalla y la fuente Aiven quedan intactas cuando existe conexión. No se agrega una copia visual paralela de Resumen.

## Archivos completos incluidos (nuevos y modificados)

- `core/offline-resumen-dia.js` **NUEVO**: adaptador local solo para solicitudes GET de Resumen del Día y detalles de tickets incluidos en el respaldo, con verificación de identidad, empresa, firma territorial y generación íntegra. Marca las fuentes no respaldadas como no disponibles; nunca inventa datos.
- `core/offline-navigation.js` **MODIFICADO**: conserva la Fase 1 y carga el adaptador de lectura sin alterar el index ni la barra lateral.
- `service-worker.js` **MODIFICADO**: nueva versión de caché; precachea el adaptador y **JS/CSS originales de Resumen** para que la vista se abra por primera vez estando sin conexión. Las API no se almacenan en Cache Storage.
- `tests/offline-navegacion-fase2-resumen.test.js` **NUEVO**: pruebas de lectura de copia, autorización, fuente online, detalles, integridad, concurrencia, rutas, writes y caché.
- `tests/pwa-app-update.test.js` **MODIFICADO**: expectativa de nueva versión del service worker, compatible con el control de actualización existente.
- `docs/ADR_20261020_NAVEGACION_OFFLINE_FASE_2_V001.md` **NUEVO**: decisión de adaptación temporal y límites explícitos.

Incluye SHA-256 de los archivos fuente de entrega. No contiene instalaciones, scripts de aplicación, `.patch`, migraciones SQL, comandos Git ni commits.

## Funcionamiento

1. La Fase 1 comprueba `/api/health` y habilita `resumen` solo si existen identidad, permiso cacheado vigente y respaldo **UNITED** completo con firma de alcance válida.
2. Al solicitar `GET /api/operacion/resumen-dia/inicial`, el adaptador responde **solo en modo offline**, leyendo la copia local completa, con el formato que consume la pantalla original. **No** responde a solicitudes POST/PATCH, ni a datos de CORELLIAN.
3. En el detalle habitual de Ticket permite consultar la ficha si ese ticket está incluido en el respaldo y se abrió desde el módulo Resumen. El histórico de interacciones, las preferencias y la lista oficial de Equipos Críticos **no forman parte de este exportador**: no se representan falsamente como datos reales (el indicador no respaldado aparece como `—`).
4. Vo.Bo. y comentarios desde pantallas normales no se confirman localmente en esta fase. Su integración con la cola existente requiere la **Fase 4**; la captura normal se mantiene bloqueada sin conexión.
5. Al volver la API y revalidar permisos, recupera la fuente Aiven y recarga la pantalla abierta sin cambiar de ruta.

### Seguridad y límites

- Los datos son del **actor/usuario efectivo** y del motor de alcance **UNITED**. No se aceptan respaldos de otra empresa, firmas diferentes, copias parciales ni cambios de identidad durante la lectura.
- Solo se expone información ya autorizada dentro de la copia local; la validación de permisos revocados mientras no hay conexión es imposible hasta volver a comunicarse con el servidor.
- Las credenciales y respuestas del servidor siguen fuera del Cache Storage. El respaldo permanece en IndexedDB bajo los controles existentes.
- La vista normal puede necesitar memoria para renderizar historiales grandes: **no hay corte artificial del respaldo**, pero la capacidad real del dispositivo limita el tamaño renderizable. No se ha validado el rendimiento físico para historiales masivos.
- No hay soporte offline para vistas enlazadas sin exportador certificado (p. ej. otros módulos de Portafolio); no se finge que están respaldadas.
- La Fase 3 se ocupará de **Proyectos de Instalaciones CORELLIAN** dentro de su pantalla habitual.

## Validaciones

- `node --check` de los cuatro archivos JS incluidos: **PASS**.
- **71/71 pruebas simuladas** de la Fase 1, adaptador Fase 2, almacenamiento, lectura, programador y cambios visuales, ejecutadas en un árbol de pruebas con dependencias de las fases anteriores: **PASS**.
- Prueba independiente del adaptador F2: **15/15 PASS**.
- **No puedo confirmar** comportamiento E2E con Azure/Aiven, una PWA desplegada o dispositivos reales sin esas pruebas. No se realizaron.

## Sistemas no modificados

**Sin aplicación ni publicación.** GitHub, Azure, Aiven, Netlify y la estructura MySQL permanecieron intactos. La entrega es exclusivamente código completo preparado para incorporar localmente según los controles del proyecto.
