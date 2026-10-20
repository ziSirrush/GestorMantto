# ADR — BLT NOW · Navegación Offline Fase 3 · Proyectos de Instalaciones
Fecha: 2026-10-20 · Estado: implementación preparada, pendiente prueba real.

## Contexto
La vista normal de `instalaciones-proyectos` consulta `GET /api/ins-fl?limit=5000`; la copia CORELLIAN ya existe en IndexedDB con exportación histórica paginada y alcance de personas. El usuario requiere conservar el módulo y el diseño nativos sin conexión. No se debe alterar Modo Offline: sirve únicamente para generar y administrar copias.

## Decisión
Agregar un puente JavaScript aislado que solo responde lecturas certificadas del dataset `instalaciones-proyectos` mientras Fase 1 identifica desconexión y confirma firma de alcance, actor/efectivo y copia íntegra. Reutilizar `ManttoInstalacionesProyectos` y `ManttoDetails`, sin crear una pantalla paralela ni modificar archivos originales del módulo. Al reconectar, las peticiones regresan a Aiven. Proteger mutaciones y endpoints no respaldados con rechazo explícito.

## Reglas cerradas
- Módulo `INSTALACIONES_PROYECTOS`, dominio `CORELLIAN`, dataset `instalaciones-proyectos` solamente.
- No aceptar datos de otra firma, usuario, empresa o generación; validación local fail-closed. Revocaciones sin conexión no se pueden verificar al instante.
- No recortar artificialmente la copia local por el `limit=5000` de la consulta online.
- Expediente unificado: solo `ins_fl` certificado; no simular información UNITED. Fotos, archivos, bitácoras, comentarios y logística no integrados al respaldo siguen no disponibles offline.
- No registrar confirmaciones ficticias ni enviar escrituras offline desde esta fase.
- No almacenar respuestas API autenticadas en el service worker; solo precachear recursos estáticos de la pantalla certificada.
- Si cambia la identidad, borrar inmediatamente la vista montada; la copia de datos es gestionada por el módulo de almacenamiento oficial.

## Consecuencias y próximos pasos
No cambia la estructura MySQL ni los módulos nativos. El nuevo service worker requiere actualizarse online. El render de historiales enormes sigue limitado por memoria del navegador; se documenta su validación pendiente. Fase 4 incorporará operaciones permitidas en la cola desde pantallas normales y Fase 5 la validación final integral.

## Validaciones
102/102 pruebas simuladas más prueba específica del worker: PASS. Sin pruebas E2E contra Azure/Aiven/PWA. Aplicación y despliegue no autorizados ni realizados.
