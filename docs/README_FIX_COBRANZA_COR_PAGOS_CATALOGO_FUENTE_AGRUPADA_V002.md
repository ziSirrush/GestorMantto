# FIX COBRANZA COR · PAGOS · CATALOGO FUENTE AGRUPADA V002

**Fecha:** 2026-10-02  
**Proyecto:** Gestor Mantto  
**Modulo:** Cobranza CORELLIAN > Pagos  
**Base revisada en GitHub main:** `8addea56c10a85f417e9aab2f941e6412c1077af`

## Motivo

El frontend estaba solicitando:

```text
/api/cobranza-cor/pagos/proyectos?limit=2000
```

mientras el backend desplegado rechazaba valores superiores a 50.

Este FIX elimina por completo ese limite artificial para el catalogo de proyectos.

## Regla aplicada

El list de proyectos se alimenta **exclusivamente de `cobranza_fuente_cor`** y devuelve la agrupacion real de sus registros por:

```text
id_proyecto_origen / PPNS
```

Un PPNS aparece una sola vez en el list, aunque Fuente tenga multiples Hitos/registros para ese proyecto.

El catalogo conserva:

```text
PPNS
Proyecto
Cliente
```

con Proyecto y Cliente consolidados desde los registros activos de Fuente.

## Cambios

- frontend deja de enviar `limit=2000`;
- backend deja de validar/recibir `limit` para este catalogo;
- repository devuelve toda la agrupacion de Fuente, sin `LIMIT`;
- se conserva la asignacion individual y masiva creada en V001.

## Archivos modificados

```text
backend/src/modules/cobranza-cor/cobranza-cor-pagos-modulo.repository.js
backend/src/modules/cobranza-cor/cobranza-cor-pagos-modulo.service.js
modules/cobranza-cor/cobranza-cor-pagos.js
tests/cobranza-cor-pagos-catalogo-fuente-agrupada-v002.test.js
```

No se regeneran archivos que no cambiaron.

## No modifica

- tablas;
- columnas;
- permisos;
- rutas;
- relaciones existentes;
- reglas de asignacion masiva;
- Estado de Cuenta;
- Facturas.

No contiene SQL ni `.patch`.

## Validacion

```text
node --check: PASS
Pruebas dirigidas: 4/4 PASS
Origen catalogo: cobranza_fuente_cor
Agrupacion: id_proyecto_origen
LIMIT artificial catalogo: eliminado
Parametro ?limit= del frontend: eliminado
```

No se realizo deploy ni escritura sobre GitHub, Aiven, Azure o Netlify durante la generacion del FIX.
