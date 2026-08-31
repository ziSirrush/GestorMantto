# FASE 5 — Ventas Dashboard — Logística + Activos V001

Fecha de generación: 2026-08-30
Proyecto: Gestor Mantto
Repositorio objetivo: `ziSirrush/GestorMantto`

## Dependencia

Esta fase es incremental y debe aplicarse después de Fases 1, 2, 3 y 4.

No ejecuta deploy, no modifica Aiven y no crea tablas.

## Alcance

### 7. Logística

Se reemplaza la tabla genérica del Dashboard por las 12 secciones confirmadas del Reporte de Logística, en este orden:

1. SIN PRODUCCIÓN / Documentación Pendiente
2. SIN PRODUCCIÓN / Primera Visita a Obra
3. SIN PRODUCCIÓN / Pendiente Liberación por Parte del Cliente
4. SIN PRODUCCIÓN / Programados a Producción
5. EN PRODUCCION
6. PARADOS POR CLIENTE
7. PENDIENTE PAGO LIBERACIÓN
8. PROGRAMADO
9. EN TRANSITO
10. PROGRAMA ENTREGA
11. ENTREGADO
12. ALMACENADOS

Cada sección tiene paginación independiente de 30 registros y usa exactamente los encabezados definidos por `PL_COLUMNAS_POR_ESTATUS` en el reporte fuente `module_produccion_logistica_Desarrollo(5).html`.

`Supervisor(a)` y `Asesor` no se ocultan en vista individual porque forman parte de las columnas explícitas del reporte.

`ENTREGADO` conserva la regla del reporte: solo se muestran registros cuya `Entrega real en obra` pertenece al año en curso. El año se determina con zona `America/Mexico_City` y no depende del filtro anual comercial de Cotizaciones/Ventas/Perdidos.

No se rellenan ni corrigen valores faltantes de Logística; se muestran los valores disponibles en `log_ops`.

### 8. Activos

La unidad de visualización es PROYECTO, no equipo.

Columnas:

`Proyecto | Cantidad de equipos | %OC | %M | %A | %General`

Origen: equipos activos de `ins_fl` visibles para el alcance comercial seleccionado.

Cálculo replicado del módulo vigente `modules/instalaciones-proyectos/instalaciones-proyectos.js`:

1. Para cada equipo, OC/MO/AJ se normaliza a 0–100. Un valor entre 0 y 1 se interpreta como proporción y se multiplica por 100.
2. Se calcula el promedio de todos los equipos del proyecto para OC, MO y AJ.
3. Cada promedio se redondea como entero.
4. `%General = ROUND(%OC * 0.40 + %M * 0.40 + %A * 0.20)`.
5. La tabla se ordena por `%General` de mayor a menor; en empate, por nombre de proyecto.
6. Paginación: 30 proyectos por página.

`%M` corresponde al campo real `avance_mo` y `%A` a `avance_aj`.

## Alcance y permisos

Fase 5 no crea una vía nueva de acceso. Sigue usando la selección resuelta por `ventas-dashboard.service.js` de Fase 1/3:

- vista individual: solo el usuario seleccionado, si está dentro del alcance permitido;
- `Todos`: únicamente los usuarios comerciales incluidos por el Alcance de Información efectivo;
- Activos: `ins_fl.id_asesor IN (usuarios permitidos)`;
- Logística: relación con proyectos visibles en `ins_fl` y/o `log_ops.asesor` coincidente con los usuarios permitidos.

No se convierte `Todos` en llave maestra.

## Archivos modificados

- `backend/src/modules/ventas-dashboard/ventas-dashboard.repository.js`
- `modules/ventas-dashboard/ventas-dashboard.js`
- `core/module-loader.js`

## Archivos de prueba incluidos

- `tests/fase5_activos_formula.test.js`
- `tests/fase5_dashboard_contract.test.js`

## Base verificable usada

1. GitHub `main`, `modules/instalaciones-proyectos/instalaciones-proyectos.js`: contiene `pyPromedioProyecto()` y la fórmula de avance general `OC 40% + MO 40% + AJ 20%`.
2. Reporte fuente local `module_produccion_logistica_Desarrollo(5).html`: contiene `PL_PIPELINE_ORDER` y `PL_COLUMNAS_POR_ESTATUS`.
3. Dump `SABANA270826.sql` del 2026-08-27: confirma, a esa fecha, los campos utilizados de `ins_fl` y `log_ops`. No se usa como prueba de estado vivo actual.

## Validación previa a entrega

- `node --check` sobre los JS modificados.
- prueba automática de fórmula Activos.
- prueba automática del contrato de 12 secciones/columnas de Logística.
- comparación automática contra `PL_COLUMNAS_POR_ESTATUS`: 12 secciones y 179 encabezados coincidentes exactamente.
- validación de que el dump 2026-08-27 contiene las 39 columnas de `log_ops` y las 9 columnas de `ins_fl` utilizadas.
- integridad del ZIP con `unzip -t`.

## Aplicación

Copiar los archivos conservando sus rutas sobre el código que ya tenga aplicadas Fases 1–4.

No existe SQL de Fase 5.

Después de desplegar frontend/backend, hacer recarga forzada del navegador. `core/module-loader.js` cambia la versión de `ventas-dashboard.js` a `20260830-fase5-logistica-activos-v001` para invalidar la versión anterior del módulo.
