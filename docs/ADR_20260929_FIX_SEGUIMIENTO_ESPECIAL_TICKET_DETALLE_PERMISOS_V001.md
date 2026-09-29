# ADR 20260929 — FIX Seguimiento Especial · Detalle Ticket · permisos V001

## Estado
Aceptado para este FIX.

## Base verificada
- Repositorio: `ziSirrush/GestorMantto`
- Rama: `main`
- Commit: `30ffa976c96857f04aba46a6ba6f8fb278c94a83`
- Versión visible reportada: `GITHUB_PAGES · Version 092926.1 · 30ffa97`
- Backend del mismo commit: GitHub Actions Run #407 = SUCCESS.

## Problema
El control de Seguimiento Especial del Detalle Ticket estaba implementado, pero `mountDetailControl()` terminaba antes de consultar el endpoint cuando `canManage()` era `false`.

Eso mezclaba dos capacidades diferentes:
1. consultar el estado personal de Seguimiento Especial;
2. modificar ese estado.

El backend ya separa correctamente ambas capacidades:
- `GET /api/tickets/:ticket/seguimiento-especial`: permiso de lectura (`ACCESO_VISUAL` o `GESTIONAR_SEGUIMIENTO`);
- `PUT /api/tickets/:ticket/seguimiento-especial`: permiso de gestión (`GESTIONAR_SEGUIMIENTO`).

Además existía una condición de carrera: si el Detalle abría antes de terminar el snapshot local de permisos, el montaje podía abortar y no recuperarse cuando el backend confirmaba acceso.

## Decisión
El frontend queda alineado al contrato del backend:
- un Detalle Ticket autenticado intenta el GET exacto; el backend decide si puede leer;
- un GET exitoso confirma acceso de lectura y permite montar la tarjeta;
- si el permiso de gestión está explícitamente denegado, la tarjeta permanece visible en modo `Solo lectura`;
- si el estado local del permiso de gestión todavía no está cargado, se permite intentar el cambio y el backend sigue siendo la autoridad final del PUT;
- un PUT rechazado con 403 revierte el switch y convierte la tarjeta a `Solo lectura`;
- modo Visor sigue sin poder gestionar estado personal;
- al confirmarse acceso después del arranque, el Detalle se remonta automáticamente.

## Seguridad
Este FIX no concede permisos y no elimina guards.
El backend conserva la decisión final para GET y PUT.
No se crean permisos, roles, tablas ni columnas.

## Compatibilidad
Proyecto y Equipo conservan los mismos endpoints y reglas. El cambio corrige la frontera lectura/gestión del control global compartido y, por tanto, no duplica un control exclusivo para Ticket.
