# FIX_SEPARACION_COBRANZA_COR_DASHBOARD_V001

## Objetivo
Separar completamente el Dashboard de Instalaciones (Corellian) de Cobranza United.

## Regla aplicada
- Instalaciones / Dashboard no consulta `pc`.
- Instalaciones / Dashboard no consulta rutas `/api/cobranza-uni/*`.
- Los bloques comerciales quedan referenciados exclusivamente a rutas reservadas de Cobranza Corellian.
- No se crean tablas de Cobranza Corellian en este FIX.
- No se inventan nombres de tablas futuras.
- Mientras las tablas no existan, las rutas responden `available:false` con arreglos vacíos y no consultan Aiven.

## Rutas Corellian reservadas
- `GET /api/cobranza-cor/aditivas`
- `GET /api/cobranza-cor/adeudos-contractuales`

Ambas requieren sesión (`requireAuth`). En esta fase son contratos placeholder. Cuando se creen las tablas reales de Cobranza Corellian se conectará repository/service a estas mismas rutas, evitando cambiar el contrato del Dashboard.

## Cambios Dashboard
- Se elimina `listPcForProjects_cor()` del repository.
- Se elimina el cálculo de Aditivas basado en `pc`.
- Se elimina la semántica `VENTA_ADICIONAL` del Dashboard Corellian.
- El resumen devuelve `source_domain: CORELLIAN`, `source_table: null`, `status: PENDING_COBRANZA_COR_TABLES` y la ruta futura.
- El frontend ya no muestra importes provenientes de United.
- La sección se renombra a `Resumen de Aditivas · Cobranza Corellian`.
- Adeudos Contractuales queda igualmente referenciado a su ruta Corellian futura.

## Archivos modificados
- `index.html`
- `modules/instalaciones-dashboard/instalaciones-dashboard_cor.html`
- `modules/instalaciones-dashboard/instalaciones-dashboard_cor.js`
- `backend/src/modules/instalaciones-dashboard/instalaciones-dashboard.service.js`
- `backend/src/modules/instalaciones-dashboard/instalaciones-dashboard.repository.js`
- `backend/src/routes/index.js`

## Archivos nuevos
- `backend/src/modules/cobranza-cor/cobranza-cor.routes.js`
- `backend/src/modules/cobranza-cor/cobranza-cor.controller.js`
- `backend/src/modules/cobranza-cor/cobranza-cor.service.js`

## No modificado
- Cobranza United.
- `backend/src/controllers/cobranza-uni.controller.js`.
- `backend/src/routes/cobranza-uni.routes.js`.
- Tablas de Aiven.
- SQL/permisos.
- Reporte de Instalaciones.
- Ajuste.

## Validaciones realizadas
- La base de `instalaciones-dashboard.service.js` coincide con blob Git actual `222f1db9aca8846d36b9d578288c4c49c440ade2` antes del FIX.
- La base de `instalaciones-dashboard.repository.js` coincide con blob Git actual `f1f9d485c80feff61b28c07a0c922c3e47c2b11c` antes del FIX.
- La base de `backend/src/routes/index.js` coincide con blob Git actual `35d668999b68f74ad68274287759881bafb631fe` antes del FIX.
- `node --check` aprobado en todos los JS nuevos/modificados.
- Cero referencias a `pc`, `VENTA_ADICIONAL` o `cobranza-uni` dentro del backend de `instalaciones-dashboard` después del FIX.
- Contrato placeholder de rutas Corellian validado.

## Resultado esperado
Hasta que existan las tablas de Cobranza Corellian:
- Dashboard sigue funcionando en Supervisores / Comentarios / Reporte / Proyectos / AFL / Modo Junta.
- Aditivas muestra que la fuente Corellian está pendiente, sin importes.
- Adeudos Contractuales muestra que la fuente Corellian está pendiente, sin importes.
- Ninguno de esos dos bloques utiliza datos United como sustituto.
