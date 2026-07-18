# Dashboard Call Center - Reparacion de navegacion V003

## Causa encontrada
La reparacion V002 reemplazo el enlazado oficial `ManttoDetails.bindLinks()` por listeners propios dentro de Call Center. Esto altero la navegacion que ya funcionaba para Proyecto, Equipo y Ticket.

## Cambio aplicado
- Se restauro el uso directo de `ManttoDetails.bindLinks(root)`.
- Se conservaron la distribucion 6-6-4, los paneles U365D, No Funcionando y el formato visual recuperado.
- Se actualizo la version de cache del modulo en `index.html`.

## Archivos modificados
- `modules/callcenter/callcenter.js`
- `index.html`

## Validaciones
- Sintaxis JavaScript validada con `node --check`.
- Confirmado que las tablas dinamicas invocan `bindDetailLinks()` despues de cada render.
- Confirmado que Proyecto, Equipo y Ticket reutilizan el handler global oficial.
- Sin cambios en backend, rutas, consultas ni calculos.
