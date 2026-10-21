# BLT NOW | FIX API/Aiven y retiro del job legacy de Almacen | V001

Fecha: 21/10/2026 (America/Mexico_City).
Identificador: `BLTNOW-FIX-API-AIVEN-ALMACEN-LEGACY-V001`.
Base verificada: `5648d8bf2ad04dffc6d3b2e1472e7c94ce0c6f78` (`Version 102126.2`).
Estado: cambio local aplicado y validado; sin commit, push, despliegue ni escrituras en Azure/Aiven.

## Resultado local

Se retiro del arranque y del cierre ordenado de la API el job
`almacenCierreIncorrecto`, que dependia del motor Excel y consultaba la tabla
retirada `almacen_fuente_excel`. El router activo de Almacen ya usa los
servicios `almacen.ns-*`, por lo que el cambio no modifica las rutas NetSuite,
los Guards, la auditoria vigente ni las notificaciones generales.

No se modificaron `backend/src/config/db.js`, el limite del pool, la cola, el
endpoint de salud ni `core/auth.js`. El incidente de capacidad SQL no se declara
resuelto: cualquier ajuste del pool sigue condicionado a medir conexiones,
instancias, latencia y carga real en Aiven/Azure.

## Archivos de la entrega

- `backend/src/bootstrap.js`: elimina la importacion, el inicio y la parada del
  job Excel obsoleto.
- `backend/src/jobs/almacenCierreIncorrecto.job.js`: eliminado.
- `tests/almacen_cierre_incorrecto_notification.test.js`: eliminado porque
  validaba exclusivamente la alerta Excel retirada.
- `tests/db_connection_emergency_cap.test.js`: elimina el mock legacy y agrega
  contratos para impedir que el job regrese y comprobar el cierre de los jobs
  activos restantes.
- `tests/fase3_backend_cdmx_contract.test.js`: deja de exigir el archivo del job
  eliminado; conserva los contratos horarios de Portafolio y Logistica.

Los servicios Excel antiguos que no son consumidores del router activo se
mantienen intactos. Su posible retiro corresponde a una limpieza independiente
y requiere revisar cada consumidor. La variable de ejemplo
`ALMACEN_CIERRE_ALERT_ENABLED` se conserva por trazabilidad de configuraciones
existentes, aunque el codigo activo ya no la consume.

## Validacion ejecutada

```powershell
node --check backend/src/bootstrap.js
node --check tests/db_connection_emergency_cap.test.js
node --check tests/fase3_backend_cdmx_contract.test.js
node --test tests/db_connection_emergency_cap.test.js tests/fase3_backend_cdmx_contract.test.js
npm.cmd test --prefix backend
git diff --check
```

Resultados locales:

- Sintaxis: correcta.
- Pruebas focalizadas: 20/20 aprobadas.
- Suite activa del backend: 217/217 aprobadas.
- Sin conexiones reales a MySQL ni cambios de datos durante las pruebas.

## Pendiente operativo obligatorio

Antes de declarar recuperada la API se debe confirmar el commit desplegado y
medir en Azure/Aiven: numero de instancias, `Threads_connected`,
`Threads_running`, `Max_used_connections`, limites globales y por usuario,
espera/cola del pool, consultas lentas y percentiles HTTP. Despues del despliegue
autorizado, validar `/api/health`, renovacion de sesion y ausencia sostenida de
`ER_NO_SUCH_TABLE` y `DB_POOL_QUEUE_FULL` bajo una ventana representativa.

No ejecutar `DROP`, `CREATE`, `ALTER`, `TRUNCATE`, `KILL`, cambios de capacidad,
reinicios o despliegues como parte automatica de esta entrega.
