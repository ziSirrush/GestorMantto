# Fórmulas oficiales de MTBC

Fuera de Operación → Informes y de los módulos `experimental-*`, que se conservan sin cambios por decisión funcional, el sistema reconoce únicamente dos alcances (equipo y proyecto) y dos ventanas (Año Actual y U365). Solo cuentan tickets cuya responsabilidad contiene `BLT`. Si el denominador es cero, el resultado es `null`/`N/A`. Los resultados numéricos se redondean a un máximo de tres decimales.

## Equipo

- Año Actual: `días transcurridos desde el 1 de enero, inclusive / fallas BLT del equipo en el año`.
- U365: `365 / fallas BLT del equipo en las últimas 365 fechas`.

## Proyecto

- Año Actual: `(días transcurridos desde el 1 de enero × equipos activos con al menos una falla BLT en el año) / total de fallas BLT del proyecto en el año`.
- U365: `(365 × equipos activos con al menos una falla BLT en U365) / total de fallas BLT del proyecto en U365`.

U365 incluye hoy y los 364 días anteriores. Un equipo activo sin fallas BLT en la ventana no participa en el numerador del MTBC de proyecto.
