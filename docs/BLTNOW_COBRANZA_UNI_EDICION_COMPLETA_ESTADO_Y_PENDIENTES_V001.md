# Cobranza UNI Administración — edición completa: estado y pendientes

Fecha: 2026-10-23. Estado: **implementación incompleta; no presentar la edición ampliada como lista para producción**.

## Decisiones confirmadas por el usuario

| Tabla | Editables solicitados | Protegidos |
| --- | --- | --- |
| `pc` / VA | 15 campos de captura del contrato | `id_pc`, `id_proyecto_cobranza` y 14 derivados automáticos |
| `detalle_mp_2026` / MP | 11 campos de captura del contrato | `id_dmp`, `id_proyecto_cobranza` y 7 derivados automáticos |
| `detalle_mp_2026_zona_1` | 124 columnas de datos, generales y de factura | Solo `id_mp_zona_1`, `id_dmp`, `created_at`, `updated_at` |

Los resultados automáticos deben persistirse en Aiven porque otros módulos los consumen. Una edición de `idns` en MP **no debe modificar automáticamente Zona 1**. Los IDs de control y de Cobranza permanecen protegidos.

## Aplicado en esta pasada

- Se preparó `mp-zone1-derived-write.js`: propaga únicamente los seis campos BUSCARV documentados de Zona 1 a MP. Para `iguala`, calcula además `monto_anual` con aritmética decimal exacta. Utiliza la conexión transaccional recibida, `SELECT ... FOR UPDATE` y confirma exactamente un `UPDATE`. **Todavía no está conectado a los endpoints**.
- La auditoría de Zona 1 admite registrar `derived_changes` cuando se conecte la propagación.
- Se preparó una comprobación posterior al cambio de `proyecto` en VA y MP para rechazar un proyecto que rompa alcance o identidad oficial. Hoy esas ramas no se ejecutan porque `proyecto` aún no pertenece a las listas de edición activas.
- Se agregaron tres pruebas unitarias del propagador: campos permitidos, cálculo monetario y rechazo de escritura no confirmada.

Se revirtieron las ampliaciones iniciales de listas de edición y la apertura por defecto de Zona 1: habilitarlas antes de completar la cascada habría permitido datos manuales nuevos con derivados viejos. La aplicación conserva por ahora los límites previos: VA 8 campos seguros, MP 5, Zona 1 108 celdas de factura sujetas a sus tres banderas de corte. No se escribió en Aiven.

Verificación local: **1244 pruebas pasan, 0 fallan**, incluyendo las tres nuevas. No se hizo una prueba E2E contra Aiven ni se desplegó.

## Pendiente para completar el requisito

1. Crear un orquestador transaccional para derivados VA. Después de editar una captura, recalcular y escribir los 8 derivados locales y los 6 relacionales; actualizar los dos acumulados en todas las ventas del proyecto afectado. Si cambia `proyecto`, recalcular también el proyecto anterior. Rechazar relaciones ambiguas o incompletas sin inventar resultados.
2. Conectar Zona 1 → MP mediante el propagador preparado y extender MP → VA para `condiciones_pago`, `z_oper`, `estado` y `estatus_cartera`, además de cambios de proyecto/cliente que afecten las relaciones. Origen, derivados y auditorías deben confirmar o revertirse juntos.
3. Resolver la edición independiente de `proyecto`, `idns` y `cliente`: hoy Zona 1 solo muestra filas cuyo proyecto e `idns` coinciden con MP. Si el usuario edita solo MP, la fila vinculada puede desaparecer de esa vista. Se necesita un flujo de reparación explícito, limitado por FK `id_dmp`, permisos y alcance, sin propagar a la otra tabla de forma oculta.
4. Diseñar la actualización de `dias_vencimiento`/`estatus` cuando cambia el día en CDMX, aun sin edición humana. Como deben quedar persistidos, la vista previa en GET por sí sola no satisface el contrato.
5. Aplicar límites de carga: agrupar lotes por proyecto, calcular cada proyecto una sola vez por transacción, evitar N+1 y barridos de 50 000 registros; verificar índices y un límite explícito de filas afectadas. Preparar conciliación/backfill gradual de derivados ya almacenados antes del corte.
6. Solo entonces ampliar validadores, contrato de acceso y editor Excel a 15/11/124 campos; mantener PK/FK/timestamps y derivados protegidos. Actualizar textos, versiones de assets y pruebas de permisos, concurrencia, rollback, relación desajustada, fórmulas, lote y rendimiento.
7. Validar con datos de Aiven en modo solo lectura primero, luego probar escrituras controladas en un entorno no productivo y revisar la conciliación. No activar los nuevos permisos ni quitar las banderas existentes hasta que esa verificación sea satisfactoria.

## Criterio de liberación

No dar Vo. Bo. a la edición completa hasta que cada cambio humano que afecta fórmulas persista todos sus derivados dependientes en la misma transacción, con auditoría, sin romper los guards ni producir consultas no acotadas. El hecho de que la suite local pase valida que **el alcance actual se conservó**, no que la nueva edición esté terminada.
