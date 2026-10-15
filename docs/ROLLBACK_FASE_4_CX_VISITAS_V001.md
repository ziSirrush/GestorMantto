# BLT NOW | FASE 4 CX Visitas | Rollback V001

Base: `c8923226` (Version 101526.4). Requiere que no existan nuevas ediciones de los tres archivos de F4 desde que se aplico.

## Volver de F4 a F3 (sin BD ni deploy automaticos)

Desde la raiz del repositorio:

```powershell
node tools/apply-cx-visitas-fase4-v001.cjs --rollback --check
node tools/apply-cx-visitas-fase4-v001.cjs --rollback
node --check core/app.js
node --check modules/customer-experience-visitas/customer-experience-visitas.js
git diff --check
```

**Restaura los 3 archivos COMPLETOS** a las versiones exactas de F3:
- `core/app.js`: regresa el lazy-loader del JS de Visitas a `?v=20261015-fase3-v001`.
- `index.html`: regresa el enlace de `core/app.js` a `?v=20261015-cx-visitas-fase3-v001`.
- `modules/customer-experience-visitas/customer-experience-visitas.js`: regresa al original F3, SHA256 `76319556cd518f431a104819377f77a21cdad1f555564016970e3bbf4432a45c`.

El rollback no elimina `cx_visitas`, `cx_visitas_historial`, no desactiva roles/permisos, no borra historiales, no toca Azure ni revierte Dashboard/Encuestas. El paquete en `release/cx-visitas-fase4` puede conservarse en el clon como evidencia.

Si algun archivo ya cambio por un commit posterior o una edicion manual, la operacion se BLOQUEA (fail-closed). NO sobreescribir manualmente archivos nuevos o usar un script forzado: resolver con diff en la rama de integracion.

Para apagar totalmente Visitas en Azure de inmediato, retirar la variable `CX_VISITAS_API_ENABLED` o establecer valor distinto de `true` en un cambio de configuracion AUTORIZADO. Esto hace que F2 responda HTTP 503; el modulo CX restante no se afecta.

**Rollback de F1/F2/F3 por separado**: seguir los paquetes originales. Los scripts F1 de rollback son logicos y NO borran tablas ni historico. No mezclar con F4 salvo evaluacion explicita.
