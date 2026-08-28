# Mantto Gestor - Fase 4 Seguridad por Modulos V001

Base obligatoria: `4270448f0242df1b17ffe5073b59e0185a62bd1f`

## Objetivo

Integrar el Guard General de Fase 3 en rutas humanas y consultas operativas sin cambiar contratos HTTP, sin mezclar integraciones M2M y sin convertir el frontend en autoridad de seguridad.

Regla efectiva aplicada:

`Permiso funcional AND Acceso General AND (Alcance automatico OR Usuario adicional)`

Cuando el usuario tiene `DOMINIO_COMPLETO`, el filtro individual de usuarios no se aplica dentro de ese dominio, pero los permisos funcionales siguen siendo obligatorios.

## Alcance implementado

### General

No se globaliza informacion personal. Home/Tareas, Interacciones, Notificaciones, Mis Solicitudes y Mi Perfil conservan sus reglas de usuario actual/participante.

### United

- Tickets humanos: listado, detalle, interacciones, comentarios y Vo.Bo.
- Portafolio: filtros, dashboard, movimientos, equipos, proyectos, detalles y lote de tickets.
- Proyectos United: listados, filtros y detalle.
- Dashboard Operativo: Servicios preventivos por supervisor.
- Criticos: equipos, proyectos, historiales, MTBC, U365 y criticidad corporativa.
- Experimental:
  - Atencion Prioritaria.
  - Resumen del Dia.
  - Entregas Recientes.
  - Dashboard Call Center.
  - Equipos Criticos.
  - Proyectos Criticos.

### Corellian

- Ventas > Clientes: Guard de VENTAS, preservando su resolver moderno existente.
- Ventas > Prospeccion: Guard de VENTAS, preservando su resolver moderno existente.
- Ventas > Asignacion a Redes: Guard de VENTAS, preservando su resolver moderno existente.
- Instalaciones > Proyectos / ins_fl: Guard de INSTALACIONES, preservando el filtro existente por `id_asesor`, `id_sup`, `id_admin`.
- Instalaciones > Reporte: filtro real de `ins_fl` por alcance.
- Instalaciones > PM&M 03-PM / 04-M: hereda el mismo filtro del Reporte.

## Separacion de empresas

- El detalle Corellian por `proyecto|||referencia_sitio` deja de consultar Portafolio United dentro de ese mismo handler.
- Los accesos cruzados Corellian -> United deben pasar por el flujo global autorizado correspondiente; no se conceden por coincidencia implicita dentro de este detalle.

## Snapshots semanales de Portafolio

Los cortes semanales almacenan JSON historico ya materializado. No se intenta filtrar ese JSON parcialmente porque podria producir una vista historica incompleta o engañosa.

Por ello:

- `GET /portafolio/movimientos-semanales/catalogo`
- `GET /portafolio/movimientos-semanales`

requieren `DOMINIO_COMPLETO UNITED`, ademas del permiso funcional correspondiente.

## Integraciones M2M

No pasan por el Guard humano y no se modifican:

- Tickets sync.
- Portafolio sync.
- ins_fl sync.

Siguen usando sus credenciales de integracion actuales.

## Archivos grandes parcheados por el aplicador

El script `APLICAR_FASE_4_SEGURIDAD_MODULOS.js` modifica sobre la base exacta:

1. `backend/src/controllers/data.controller.legacy.js`
2. `backend/src/modules/proyectos/proyectos.service.js`
3. `backend/src/modules/instalaciones-reporte/instalaciones-reporte.service.js`
4. `backend/src/modules/portafolio/portafolio-comercial_uni.js`
5. `backend/src/modules/criticos/criticos.service.js`
6. `backend/src/modules/experimental-atencion-prioritaria/experimental-atencion-prioritaria.service.js`
7. `backend/src/modules/experimental-entregas-recientes/experimental-entregas-recientes.service.js`

El aplicador se detiene antes de modificar si:

- `HEAD` no es exactamente la base esperada;
- uno de esos siete archivos tiene cambios locales o staged;
- falta un ancla esperada;
- el archivo resultante no pasa `node --check`.

## Limitaciones verificadas

### Comentarios de Tickets

El catalogo actual no contiene una accion funcional independiente `AGREGAR_COMENTARIO` para Tickets. No se inventa una. La ruta exige permiso real de lectura/detalle de Ticket + alcance del registro.

### Cobranza Corellian

La backend actual de Cobranza Corellian declara sus fuentes `Aditivas` y `Adeudos contractuales` como pendientes y sin `source_table`. Esta fase no inventa una relacion de datos ni un filtro de propietario para tablas que todavia no existen.

### Relacion de Portafolio con usuarios

Portafolio almacena `supervisor_zona` y `superintendente` como identidad textual, no como FK de usuario. El filtro utiliza las identidades existentes del usuario (`nombre`, `iniciales`, `correo`) para resolver esos campos. Debe validarse con usuarios reales representativos para detectar diferencias de escritura; una diferencia puede restringir de mas, pero la implementacion no abre acceso por ausencia de coincidencia.

## Como aplicar

Desde la raiz del repositorio:

```powershell
git rev-parse HEAD
```

Debe devolver:

```text
4270448f0242df1b17ffe5073b59e0185a62bd1f
```

1. Extraer el ZIP directamente sobre la raiz del repositorio conservando `backend/...`.
2. Ejecutar:

```powershell
node .\APLICAR_FASE_4_SEGURIDAD_MODULOS.js
```

3. Revisar:

```powershell
git status
```

4. Validacion recomendada:

```powershell
cd backend
npm run check
cd ..
```

5. Commit sugerido:

```powershell
git add backend
git add README_FASE_4_SEGURIDAD_MODULOS_V001.md
git add ADR_FASE_4_GUARD_POR_MODULOS_V001.md
git commit -m "Implementacion de Norma 081926.7 - Guard General por Modulos"
git push
```

El aplicador puede eliminarse localmente despues de aplicar; no es necesario versionarlo.

## Matriz minima de QA despues del deploy

1. Sin permiso funcional + con alcance: 403.
2. Con permiso funcional + sin Acceso General: 403.
3. Acceso por agrupacion + usuario automatico autorizado: solo registros correspondientes.
4. Usuario adicional dentro de area autorizada: acceso ampliado solo a esa persona.
5. Detalle de Ticket/Equipo/Proyecto fuera de alcance: 404.
6. `DOMINIO_COMPLETO UNITED/CORELLIAN`: datos completos del dominio, conservando permisos funcionales.
7. Viewer: lectura con identidad del usuario visualizado; escritura bloqueada con 403.
8. General/personal: nunca se vuelve global por tener dominio completo.
9. Sync M2M: debe continuar funcionando con su autenticacion de integracion.
10. Corellian `proyecto|||referencia`: no debe devolver datos de Portafolio United desde el detalle Corellian.

## Validaciones realizadas al generar el FIX

- Todos los JS entregados: `node --check` OK.
- Aplicador: `node --check` OK.
- Helpers de scope: prueba estatica/sintetica OK.
- Permisos usados contra `Dump20260819.sql`: 82 encontrados / 82 usados / 0 faltantes.
- No se genero SQL nuevo.
- No se modifico frontend.

## Validacion pendiente

No puedo confirmar el comportamiento runtime contra Aiven y el backend desplegado desde este entorno. Debe realizarse la matriz de QA anterior despues del deploy.
