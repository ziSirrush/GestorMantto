# Nori / Soporte

**Proyecto:** Mantto Gestor  
**Fase:** 0 — Catálogo vivo del sistema  
**Fuente revisada:** `backend(10).zip` y reglas vigentes del proyecto  
**Fecha de corte documental:** 18/07/2026  

> Este documento describe el estado actual conocido. La estructura física objetivo todavía no implica que el código ya esté separado. Cuando el módulo continúa dentro de controladores heredados, se indica expresamente.

## 1. Propósito

Operar el asistente guiado, FAQ, avisos y solicitudes de soporte.

## 2. Dominio y empresa

- **Dominio:** Compartido
- **Estado actual:** Activo / desacoplado
- **Estado de congelación:** Aplican las reglas generales del proyecto.

## 3. Propietario físico actual

`src/routes/support.routes.js` + `src/controllers/support.controller.js`

## 4. Propietario físico objetivo

```text
src/modules/nori/
├── nori.routes.js
├── nori.controller.js
├── nori.service.js
├── nori.repository.js
├── nori.contract.js
├── nori.validator.js
├── nori.constants.js
├── README.md
└── CHANGELOG.md
```

## 5. Endpoints actuales confirmados

- `GET /api/support/menu`
- `GET /api/support/node/:id_nodo`
- `GET /api/support/faq`
- `GET /api/support/avisos`
- `GET /api/support/tickets`
- `POST /api/support/tickets`
- `PATCH /api/support/tickets/:id`
- `GET /api/support/notificaciones`

## 6. Dependencias de base de datos identificadas

- `sup_nodos`
- `sup_opciones`
- `sup_faq`
- `sup_faq_categorias`
- `sup_avisos`
- `sup_tickets`
- `sup_ticket_categorias`
- `sup_notificaciones`

## 7. Reglas arquitectónicas

- El módulo será propietario de sus rutas y contratos.
- Las rutas no contendrán SQL ni reglas de negocio.
- El acceso a MySQL se concentrará en Repository.
- El Service construirá reglas de negocio y contratos.
- No se importarán Controllers de otros módulos.
- Se conservarán aliases de endpoints mientras exista frontend dependiente.
- Los permisos deberán validarse en backend, no solo en frontend.

## 8. Dependencias y fronteras

- Puede consumir utilidades de `shared/` e infraestructura común.
- Las dependencias con otros módulos deberán documentarse explícitamente.
- No deberá modificar contratos de módulos en Nevera.
- La empresa activa y los permisos deberán respetarse cuando aplique.

## 9. Pendientes de Fase 0

- Confirmar consumidores exactos del frontend contra la versión oficial vigente.
- Capturar ejemplos reales de request/response para `*.contract.js`.
- Confirmar permisos granulares en Panel de Control.
- Registrar owner técnico y responsable funcional.
- Incorporar el módulo en los mapas `ENDPOINTS`, `DATABASE_DEPENDENCIES` y `DEPENDENCY_GRAPH`.

## 10. Criterio de migración

La migración deberá realizarse sin cambiar inicialmente URLs ni contratos. Primero se extraerán Repository y Service; después Controller y Routes. Cualquier diferencia entre documentación y código deberá reportarse antes de modificar el sistema.
