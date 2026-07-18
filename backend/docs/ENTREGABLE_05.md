# Entregable 05 — Dashboard Operativo

## Objetivo

Extraer la consulta de servicios preventivos por supervisor desde `src/controllers/data.controller.js` hacia un módulo independiente, manteniendo el contrato HTTP existente.

## Archivos incluidos

```text
backend/
├── docs/
│   └── ENTREGABLE_05.md
└── src/
    ├── modules/
    │   └── dashboard-operativo/
    │       ├── dashboard-operativo.controller.js
    │       ├── dashboard-operativo.repository.js
    │       ├── dashboard-operativo.routes.js
    │       └── dashboard-operativo.service.js
    └── routes/
        └── data/
            └── dashboard-operativo.routes.js
```

## Ruta conservada

```text
GET /api/servicios-preventivos/resumen-supervisor?mes=YYYY-MM
```

La ruta conserva `requireAuth`, los códigos HTTP y la forma de la respuesta:

```json
{
  "ok": true,
  "source": "aiven",
  "mes": "YYYY-MM",
  "data": []
}
```

## Integración

Copiar la carpeta `backend/` de este entregable sobre la carpeta raíz del proyecto y permitir reemplazar únicamente los archivos coincidentes.

No eliminar todavía `getPreventivosSupervisor` de `src/controllers/data.controller.js`. Primero validar que el backend, la ruta y el frontend funcionen correctamente usando el módulo nuevo.

## Validación recomendada

```powershell
npm run check
npm start
```

Después validar con una sesión autenticada:

```text
GET /api/servicios-preventivos/resumen-supervisor?mes=2026-07
```

Finalmente revisar el Dashboard Operativo en el frontend.
