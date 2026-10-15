# BLT NOW · Customer Experience → Visitas · FASE 1 V001

**Entrega funcional de infraestructura de datos y permisos (SQL), NO una especificación vacía.**

- Autor: **ChatGPT (OpenAI)** · Preparación: **15-oct-2026**.
- Destino de integración: `ziSirrush/GestorMantto`, rama `main`.
- Base exacta comprobada: `c8923226b70f8bc63d13f14fc7390ba41599ddfc` · **Version 101526.4**.
- Identidad visible de la app: **BLT NOW**. PWA Netlify: **BLT NOW**; PWA GitHub Pages: **BLT NOW GH**.
- Componente: `Customer Experience > Visitas` (`cx-visitas`).
- Entrega: **solo archivos nuevos**, en rutas originales del repo, para extraer sobre la raíz.
- La rama avanzó desde `ce7f7103` / `101526.3` durante la preparación; la versión `101526.4` cambia solo recursos de actualización PWA, no tablas ni archivos CX. Se utiliza el nuevo HEAD como base.

## Qué implementa esta fase

Esta fase entrega **SQL ejecutable** para la infraestructura de Customer Experience > Visitas:

1. `cx_visitas`: registro de visitas, con actor creador, responsable opcional, referencia de proyecto/cliente opcional, fechas, estado inicial neutro y baja lógica.
2. `cx_visitas_historial`: registro separado de eventos de auditoría por visita, con FK a `cx_visitas` e identidad del actor real.
3. **Un elemento funcional y un subelemento** en los catálogos de permisos EXISTENTES del módulo CX Visitas; cinco códigos de acción basados en `perm_acciones` vigente: `VER`, `CREAR`, `EDITAR`, `DESACTIVAR`, `VER_HISTORIAL`.
4. Precheck solo lectura, smoke solo lectura, rollback lógico conservador y tests estáticos ejecutables con Node.js.

La Fase 1 **no crea el módulo `CUSTOMER_EXPERIENCE_VISITAS`**, porque ya aparece en el catálogo histórico; lo reutiliza. También reutiliza (sin modificar) el permiso **`CUSTOMER_EXPERIENCE_VISITAS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`** y mantiene `cx-visitas` oculto en el sidebar hasta la integración frontend. **No asigna permisos a roles ni usuarios**.

### Modelo mínimo propuesto para las fases posteriores

El LAB `JIVMBLT/updated_code` NO tiene una implementación real de CX Visitas que pueda copiarse. Este esquema es una **base nueva, deliberadamente mínima y extensible**; no representa una regla de negocio que el usuario haya confirmado.

| Campo/contrato | Regla técnica de Fase 1 |
|---|---|
| Identidad | `id_visita` bigint autoincremental, independiente de Ventas/Instalaciones |
| Auditoría | `id_usuario_creador`, `id_usuario_ultima_modificacion`; eventos con `id_actor_usuario` |
| Alcance | `id_usuario_responsable` opcional; sin exposición hasta que el Guard de Fase 2 esté listo |
| Referencia | `referencia_origen` + `referencia_id`, sin FK ajena ni cruce por nombres; nombres de proyecto/cliente opcionales para presentar contexto |
| Fecha y zona | `fecha_programada_utc` y `fecha_realizada_utc` son `DATETIME(3)` cuyo contrato será UTC; Fase 2 debe normalizar entradas; interfaz mostrará zona del dispositivo |
| Estado | `BORRADOR` por defecto, como estado técnico de registros futuros, sin imponer un ciclo de vida final |
| Baja | `inactivo` para desactivación lógica; prohibido borrar historial en el flujo del aplicativo |
| Archivos | No hay tabla nueva para fotos/documentos: deberá reutilizarse la infraestructura de archivos existente cuando se defina el alcance |

**Por validar en el diseño de Fase 2:** finalidad exacta de una visita CX, tipologías, estados adicionales, relación con encuestas, participantes, registro de GPS/fotos, quién puede ver visitas ajenas y reglas para concluir/reagendar. Ninguna de esas capacidades se simula ni se da por aprobada aquí.

## Archivos NUEVOS incluidos (rutas exactas)

```text
database/00_PRECHECK_FASE_1_CX_VISITAS_V001.sql
database/01_APLICAR_FASE_1_CX_VISITAS_V001.sql
database/02_SMOKE_FASE_1_CX_VISITAS_V001.sql
database/99_ROLLBACK_LOGICO_FASE_1_CX_VISITAS_V001.sql
tests/cx-visitas-fase1.test.cjs
README_FASE_1_CUSTOMER_EXPERIENCE_VISITAS_V001.md
MANIFEST_FASE_1_CX_VISITAS_V001.txt
docs/CHECKSUMS_FASE_1_CX_VISITAS_V001.sha256
```

**Archivos existentes modificados: ninguno.** No contiene `core/app.js`, `index.html`, `core/router.js`, módulos ya publicados ni backend Node. No se altera `INT-1` / `INT-2+3` / `INT-8` / `INT-9` ni Customer Experience Dashboard/Encuestas.

## Orden de aplicación manual (Aiven / mydb)

1. Actualizar el clon del repositorio y verificar HEAD `c8923226` o **revisar diferencias si main avanzó**.
2. Extraer el ZIP en la **raíz del repositorio**, manteniendo exactamente las rutas.
3. Ejecutar los tests sin Aiven: `node --test tests/cx-visitas-fase1.test.cjs`.
4. En consola MySQL/Aiven **correctamente seleccionada**, ejecutar `database/00_PRECHECK_FASE_1_CX_VISITAS_V001.sql`. Debe indicar `APTO_CATALOGO_PENDIENTE_REVISAR_ESQUEMA` y mostrar el módulo/permiso visual y **cinco acciones activas**. Revisar estructuras si las tablas ya existen: NO sobrescribir una implementación distinta.
5. Solo tras precheck y respaldo, ejecutar **una vez** `database/01_APLICAR_FASE_1_CX_VISITAS_V001.sql` (en MySQL 8, sobre `mydb`, nunca con `mysql --force`). Contiene **guardas que detienen el script en caso de requisitos incumplidos**. El script puede repetirse si las tablas son compatibles y se completaron los prerrequisitos; no borra registros.
6. Ejecutar `database/02_SMOKE_FASE_1_CX_VISITAS_V001.sql`. Esperado: dos tablas InnoDB, FK y sus índices, **cinco permisos activos nuevos**, módulo visual preexistente intacto, y **ninguna asignación de rol nueva**.
7. Mantener `cx_visitas` sin exposiciones al frontend hasta implementar Guard de permisos y alcance de información, backend y UI en fases posteriores.

La tabla `cx_visitas_historial` depende de `cx_visitas`. Las operaciones `CREATE TABLE` en MySQL hacen **commit implícito**: no existe rollback transaccional para deshacer el DDL. El rollback incluido es **lógico**, sin DROP de datos.

### Precondiciones de seguridad para el API posterior

- Permiso funcional efectivo **AND** dominio `CORELLIAN` **AND** agrupación `CUSTOMER_EXPERIENCE` **AND** alcance de registro. Usar `humanInformationGuard_gnral`, no bypass por sesión ni por frontend.
- Usuario efectivo (`req.contextUser || req.user`) para alcance. Usuario actor real (`req.actorUser`) para auditoría, evitando atribuir cambios al usuario observado en Visor de Usuarios.
- Escritura y consulta parametrizadas; al modificar, rechazar IDs de visita que el usuario no puede ver (404 o 403 según contrato central); no otorgar acceso por tener únicamente el permiso visual.
- Las sesiones/consultas del backend deberán respetar el contrato de fechas UTC y la presentación en zona local; no almacenar datos personales adicionales sin necesidad.

## Validaciones y límites de esta entrega

**Ejecutable localmente:** tests estáticos del contrato SQL, nombres, compatibilidad de permisos, protección de módulos existentes, rollback no destructivo y precondiciones.

**NO ejecutado ni verificable desde este entorno:** ejecución SQL contra Aiven real, catálogo actual de Aiven (solo se comprobó un volcado histórico), privilegios DDL del usuario operador, funcionamiento backend, prueba E2E en frontend, publicación PWA, servicio de Azure ni funcionalidad real de Visitas (corresponde a fases 2–4). Si el precheck no coincide, **detener aplicación**; no inventar IDs de permisos.

## Reversión

Antes de habilitar uso real, ejecutar `99_ROLLBACK_LOGICO_FASE_1_CX_VISITAS_V001.sql` si procede desactivar permisos nuevos. **No borra datos, no elimina las tablas ni toca el permiso visual preexistente**. La reversión de DDL, si fuese necesaria, requiere respaldo y plan aparte, después de confirmar ausencia de datos.

## Próximas fases definidas

- **Fase 2:** API Node/Express (Aiven), control de permisos, alcance y auditoría real.
- **Fase 3:** interfaz `Customer Experience > Visitas`, integrada en `BLT NOW` (carga diferida y UI responsive).
- **Fase 4:** pruebas de integración, flujos completos, QA de roles, regresiones y salida gradual.

**Esta entrega no hace commit/push ni altera GitHub, Aiven, Azure, Netlify o GitHub Pages.**
