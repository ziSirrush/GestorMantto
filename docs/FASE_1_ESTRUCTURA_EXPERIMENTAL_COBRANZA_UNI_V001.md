# Fase 1 — Estructura Experimental y Cobranza United

Fecha: 05/08/2026  
Versión: V001

## Cambios realizados

- Se agregó la agrupación **Experimental** antes de **Operación**.
- Se agregaron siete accesos independientes:
  - Atención Prioritaria.
  - Resumen del Día.
  - Entregas Recientes.
  - Equipos Críticos.
  - Dashboard Call Center.
  - Equipos Críticos Original.
  - Proyectos Críticos.
- Se agregó una agrupación **Cobranza** específica de United inmediatamente después de **Portafolio**.
- Cobranza United incluye inicialmente:
  - Dashboard Cobranza.
  - Estados de Cuenta.
  - Aditivas.
- Se crearon contenedores y rutas independientes para los diez destinos.
- Se agregaron pantallas base responsivas que indican el estado de integración de cada módulo.
- Se agregó una migración SQL para registrar Cobranza United, sus módulos y sus permisos visuales.
- La migración también asegura la posición de Experimental respecto de Operación.

## Reglas respetadas

- No se crean tablas nuevas.
- No se modifican tablas operativas.
- No se reutilizan rutas de los módulos funcionales actuales.
- Los módulos experimentales usan nombres internos `_EXP` y rutas `experimental-*`.
- Los módulos de Cobranza United usan nombres internos `_UNI` y rutas `cobranza-uni-*`.
- La fuente operativa futura seguirá siendo Aiven.
- Los permisos no se asignan automáticamente a roles o usuarios.

## Orden de ejecución SQL

1. `20260805_FASE_0_EXPERIMENTAL_PERMISOS.sql`
2. `20260805_FASE_1_ESTRUCTURA_EXPERIMENTAL_COBRANZA_UNI.sql`

Después de ejecutar ambos scripts, los permisos visuales deben activarse desde Panel de Control para los roles o usuarios autorizados.

## Archivos modificados o agregados

- `index.html`
- `core/router.js`
- `modules/experimental/experimental.css`
- `modules/experimental/experimental.js`
- `modules/cobranza-uni/cobranza-uni.css`
- `modules/cobranza-uni/cobranza-uni.js`
- `backend/sql/20260805_FASE_1_ESTRUCTURA_EXPERIMENTAL_COBRANZA_UNI.sql`
- `docs/FASE_1_ESTRUCTURA_EXPERIMENTAL_COBRANZA_UNI_V001.md`

## Validaciones realizadas

- Sintaxis JavaScript del frontend completo: correcta.
- Sintaxis JavaScript del backend completo: correcta.
- Existencia única de las nuevas rutas, vistas, grupos e identificadores HTML: correcta.
- Coincidencia entre códigos SQL, `data-permission` y rutas frontend: correcta.
- Orden del sidebar validado: Experimental → Operación → Portafolio → Cobranza United.
- El SQL no contiene `CREATE TABLE` ni `ALTER TABLE`.
- Integridad del entregable: únicamente archivos modificados o agregados.

La migración SQL no fue ejecutada contra Aiven desde este entorno; requiere validación posterior mediante las consultas incluidas al final del script.

## Fuera de alcance

- Copiar lógica, consultas, tablas visuales o cálculos de los HTML de Desarrollo.
- Crear endpoints backend.
- Crear tablas operativas.
- Asignar permisos automáticamente.
- Implementar el PDF de Proyectos Críticos.
