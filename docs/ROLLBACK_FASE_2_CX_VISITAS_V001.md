# BLT NOW | Rollback Fase 2 CX Visitas V001

**Objetivo:** retirar solamente la API de CX Visitas sin tocar las tablas de Fase 1, sus permisos ni otros modulos.

1. En el entorno Azure afectado, configurar `CX_VISITAS_API_ENABLED=false` y reiniciar backend: bloquea las rutas antes de consultar Aiven, manteniendo las rutas de Dashboard/Encuestas vigentes.
2. Guardar un respaldo del clon con sus cambios locales; revisar `git status` y el diff de las rutas CX.
3. En una copia cuyo archivo fue reemplazado por este paquete y donde no existan cambios propios en esa ruta, restaurar **solo** `backend/src/modules/customer-experience/customer-experience.routes.js` desde el commit base:

   ```powershell
   git restore --source=c8923226b70f8bc63d13f14fc7390ba41599ddfc -- backend/src/modules/customer-experience/customer-experience.routes.js
   ```

   Si el archivo de rutas cambio despues del commit base, NO restaurar a ciegas: eliminar unicamente el import y montaje `visitasRoutes_cor` sobre la nueva version.
4. Quitar los CUATRO archivos nuevos `customer-experience-visitas.{routes,controller,service,repository}.js` de esta entrega; si fueron versionados, usar un commit de reversión selectiva. No borrar el directorio `customer-experience` completo: contiene Dashboard, Encuestas y sincronizaciones productivas.
5. Publicar backend y probar endpoints preexistentes CX. Mantener 503 o 404 para `/api/customer-experience/visitas` segun si el montaje sigue en el backend.
6. Las tablas `cx_visitas` y `cx_visitas_historial` **no se borran**; el historial no se modifica; los cinco permisos funcionales de Fase 1 pueden permanecer sin roles asignados. SQL de Fase 1 tiene rollback logico independiente, NO se aplica automaticamente.

No hay cambio de frontend/PWA que revertir en Fase 2. No ejecutar `git reset --hard`, `DROP TABLE` o borrado masivo.
