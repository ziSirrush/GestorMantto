# FIX 01.3 - Lectura flexible de proyecto con formato de fecha

## Alcance
Se modifica unicamente `core/project-name.js`.

No se modifica Portafolio, tablas, endpoints, backend, Aiven, router, detalles ni ningun modulo congelado.

## Cambio
La funcion global `ManttoFormat.projectName()` conserva su salida oficial:

`16 de Septiembre #197`

pero ahora reconoce de forma deterministica los formatos comunes que pueden llegar desde Sheets, Aiven o JSON, entre ellos:

- `197-09-16`
- `0197-09-16`
- `197-9-16`
- `0197-09-16T00:00:00.000Z`
- `16/09/0197`
- `16-09-0197`
- `16.09.0197`
- `197/09/16`
- `09/16/0197`
- `16 de septiembre de 0197`
- `16 Sep 0197`
- `September 16 0197`
- objetos `Date` validos

Los valores que no pueden interpretarse con seguridad como fecha/proyecto se devuelven sin modificar.

## Regla
El numero/anio de la fecha se interpreta como numero de proyecto; el mes y el dia se usan para construir el nombre visual.

## Validacion
- `node --check core/project-name.js`
- pruebas de formatos representativos con salida esperada.
