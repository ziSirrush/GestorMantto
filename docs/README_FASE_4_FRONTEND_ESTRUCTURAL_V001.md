# FASE 4 — Frontend estructural V001

## Base
Construida sobre la salida efectiva de **FASE 3 — Comercial · Optimización de llamadas V001**. Aplicar después de Fases 1, 2 y 3.

## Objetivo
Cerrar el bloque estructural acordado de la auditoría:

1. Lazy loading de módulos JS/CSS.
2. Reducir `cache:'no-store'` sin sacrificar frescura de datos operativos.
3. Consolidar el transporte de llamadas en `ManttoHttp` sin reescribir de golpe todos los módulos existentes.

## Cambios

### 1. Lazy loading real por ruta
Se agrega `core/module-loader.js` y el router espera los recursos de la ruta antes de inicializar el módulo.

- Carga inicial de scripts con `src`: **71 → 22**.
- Stylesheets iniciales: **52 → 3**.
- **50 JS de módulos** y **49 CSS de módulos** quedan registrados para carga bajo demanda.
- `home.js` y `support.js` permanecen eager porque soportan funciones globales existentes: estado ligero de notificaciones/Nori.
- El loader deduplica recursos compartidos y respeta orden de dependencias (Contacto Form, Dashboard Ventas PDF, Experimental, etc.).
- El router protege navegaciones rápidas con secuencia para evitar que un módulo anterior renderice después de cambiar de ruta.

### 2. Política de caché
Se cambió `no-store` a caché HTTP normal (`default`) **únicamente en 24 cargas de plantillas HTML estáticas de módulos**.

- Conteo `no-store` en `core/` + `modules/`: **91 → 67**.
- Las consultas API operativas/sensibles conservan `no-store` donde ya existía.
- No se cambió la política de datos de Aiven.
- No se modificaron `callcenter.js` ni `equipos-criticos.js` para evitar pisar el trabajo separado de Call Center/Críticos.

### 3. ManttoHttp como transporte central compatible
`core/http.js` queda como puente central incluso para módulos que todavía llaman `fetch()` directamente:

- agrega automáticamente headers de Auth/Device/Viewer cuando la llamada es a la API operativa;
- conserva contexto `X-Mantto-Route` / `X-Mantto-Payload`;
- deduplica GET/HEAD idénticos simultáneos a la API sin compartir un mismo body consumible (usa `Response.clone()`);
- mantiene caché TTL explícita para `ManttoHttp.get/request`;
- mantiene una sola emisión general `mantto:data-mutated` para mutaciones no administradas;
- expone `request`, `get`, `template`, `fetch`, `invalidate`, `clear` y `scopeKey`.

Los wrappers antiguos pueden seguir existiendo temporalmente por compatibilidad, pero sus llamadas operativas pasan por el puente central de `ManttoHttp` una vez cargado el core.

## Archivos estructurales principales
- `index.html`
- `core/module-loader.js` (nuevo)
- `core/router.js`
- `core/http.js`

Además se incluyen únicamente los módulos cuya carga de plantilla estática cambió de `no-store` a `default`.

## No se modifica
- Backend.
- SQL/Aiven.
- Tablas o índices.
- Permisos y alcances General/United/Corellian.
- Fórmulas KPI.
- Polling de Notificaciones de 30 s.
- Lógica interna de Críticos/MTBC.
- Lógica interna de Call Center.
- `_redirects` de Netlify.

## Validaciones realizadas
- `node --check` sobre **todos** los JS de `core/` y `modules/`: OK.
- Cobertura del manifest lazy contra el `index.html` anterior:
  - 50/50 JS diferidos cubiertos.
  - 49/49 CSS diferidos cubiertos.
- Validación de archivos de módulos modificados: la única diferencia frente a Fase 3 es `cache:'no-store'` → `cache:'default'` en plantillas estáticas.
- `index.html` conserva eager únicamente Home y Support entre los módulos.

## Validación manual recomendada antes de Netlify
1. Login / restauración de sesión.
2. Abrir Home y Nori.
3. Navegar a Portafolio, Proyectos, Instalaciones, Ventas, Cobranza y Call Center.
4. Confirmar en Network que el JS/CSS de cada módulo aparece solamente al abrirlo por primera vez.
5. Volver a un módulo ya abierto y confirmar que sus recursos no vuelven a descargarse.
6. Ejecutar una mutación normal y verificar un solo refresco funcional.
