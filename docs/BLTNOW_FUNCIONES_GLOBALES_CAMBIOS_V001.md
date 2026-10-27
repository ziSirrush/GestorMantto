# BLT NOW — Cambios obligatorios para funciones globales

**Versión:** V001  
**Fecha:** 27/10/2026  
**Estado:** Propuesta para integrar en la Constitución del Proyecto  
**Alcance:** Frontend, backend y módulos de Mantto Gestor

## 1. Objetivo

Establecer un único contrato transversal para que todos los módulos de Mantto Gestor utilicen las funciones globales oficiales que correspondan a su operación.

Esta propuesta corrige la situación actual, en la que existen servicios globales para autenticación, solicitudes HTTP, permisos, alcance, navegación, sincronización y estados visuales, pero algunos módulos conservan implementaciones locales, fallbacks o flujos paralelos que omiten dichos servicios.

La integración se realizará posteriormente y de forma incremental. Este documento no modifica código, bases de datos, infraestructura ni despliegues.

## 2. Regla global obligatoria

Todo módulo, nuevo o existente, debe pasar por la función global oficial correspondiente cuando realice una operación transversal.

La obligación no significa que todos los módulos deban invocar todas las funciones globales. Significa que un módulo no puede crear una implementación local o paralela cuando ya existe una función global aprobada para esa responsabilidad.

Queda prohibido, salvo excepción documentada y aprobada:

- implementar autenticación, encabezados o renovación de sesión dentro de un módulo;
- ejecutar solicitudes operativas con un cliente HTTP paralelo que evite el flujo global;
- calcular permisos o alcance de información con reglas locales;
- manipular rutas o cargar módulos fuera del router y cargador globales;
- implementar timers, canales o mecanismos de sincronización independientes;
- duplicar catálogos visuales, detalles, interacciones, notificaciones o funciones de formato ya centralizadas;
- declarar un fallback silencioso que relaje seguridad, alcance, auditoría o sincronización;
- marcar una mutación como completada sin notificar a la función global de sincronización.

Una excepción sólo será válida si:

1. la función global no puede cubrir el caso;
2. se documenta la limitación concreta;
3. se propone primero la ampliación del servicio global;
4. existe autorización explícita;
5. se registra mediante ADR cuando afecte arquitectura, seguridad, datos o despliegue.

## 3. Funciones globales frontend que deben respetarse

| Responsabilidad | Función global actual | Uso obligatorio |
|---|---|---|
| Sesión, identidad y solicitudes autenticadas | `window.ManttoAuth` | Obtener usuario actor/efectivo, contexto de visor, encabezados y ejecutar solicitudes autenticadas. |
| Cliente HTTP, caché y deduplicación | `window.ManttoHttp` | Consultas, caché, invalidación y mutaciones HTTP de los módulos. |
| Sincronización e invalidación de datos | `window.ManttoDataSync` | Registrar cada ruta con datos, declarar dependencias y refrescar selectivamente después de cambios. |
| Navegación | `window.ManttoRouter` | Abrir rutas, detalles y regresar sin manipulación paralela del estado de navegación. |
| Carga y ciclo de vida de módulos | `window.ManttoModuleLoader` | Carga diferida, inicialización, reutilización y reentrada de vistas. |
| Permisos efectivos | `window.ManttoPermissions` | Resolver y aplicar permisos visuales; nunca sustituye la validación backend. |
| Estados e indicadores visuales | `window.EstadosVisuales_gnral` | Cargar y renderizar la semántica visual central. |
| Detalles compartidos | `window.ManttoDetails` | Abrir y renderizar detalles comunes cuando el tipo ya esté soportado. |
| Interacciones | `window.ManttoInteractions` | Registrar vistas, acciones e interacciones mediante el contrato global. |
| Notificaciones push | `window.ManttoPushNotifications` | Suscripción y recepción de avisos push. No debe usarse como sustituto de sincronización de datos. |
| Actualización de aplicación | `window.ManttoAppUpdate` y `window.ManttoBuildInfo` | Validar cambios de versión y estado del build. |
| Modo visor | `window.ManttoUserViewer` y `window.ManttoViewerReadOnly` | Aplicar identidad efectiva y bloqueo de escrituras. |
| Operación offline | Servicios `window.ManttoOffline*` | Almacenamiento, navegación, acciones y sincronización offline cuando la ruta esté autorizada. |
| PDF compartido | `window.ManttoPdf_gnral` | Generación de PDF cuando el caso esté cubierto por el motor global. |
| Formato de nombres | `window.ManttoFormat` | Normalización común disponible para nombres de proyecto y formatos compartidos. |

Antes de crear una función global nueva debe verificarse que la responsabilidad no esté cubierta por el Core actual.

## 4. Funciones globales backend que deben respetarse

Los módulos backend deben reutilizar las capas centrales disponibles, principalmente:

- autenticación y sesión mediante los middlewares oficiales;
- `humanInformationGuard_gnral` para sesión, permiso funcional, puerta y alcance humano;
- servicios oficiales de `alcance_gnral`, `alcance_cor` y `alcance_uni`;
- validación de alcance por registro cuando el endpoint recibe un identificador directo;
- `effective-permission.service` para permisos efectivos;
- `viewer-readonly.middleware` para impedir escrituras en modo Visor;
- `integration-auth.middleware` para integraciones M2M;
- servicios globales de notificaciones, almacenamiento, interacciones y auditoría cuando corresponda;
- middleware global de errores para respuestas y trazabilidad consistentes.

Ningún módulo debe reconstruir localmente las reglas de autenticación, permisos, dominio, zona, usuario efectivo o alcance si existe un servicio central aplicable.

## 5. Cambio requerido en la sincronización global

### 5.1 Problema comprobado

`ManttoDataSync` detecta actualmente:

- mutaciones de la misma pestaña mediante `mantto:data-mutated`;
- mutaciones de otras pestañas del mismo navegador mediante `BroadcastChannel`;
- rutas marcadas como pendientes durante navegación.

No existe un canal global servidor-cliente para comunicar una mutación realizada por otro usuario, navegador o equipo. Por esa razón, una pantalla puede conservar información anterior hasta ejecutar una actualización manual o presionar F5.

El polling de la campana de notificaciones no actualiza los módulos. El verificador de Experimental NS es un piloto separado y sólo cubre sus tres rutas registradas.

### 5.2 Contrato global obligatorio de sincronización

Todo módulo que consulte datos operativos debe:

1. registrar su ruta en `ManttoDataSync`;
2. exponer un `backgroundSync`, `syncInBackground` o `refreshSilent` real;
3. declarar los recursos que consume y las mutaciones que lo invalidan;
4. ejecutar las mutaciones mediante `ManttoAuth` o `ManttoHttp`;
5. notificar la mutación global únicamente después de una respuesta exitosa del backend;
6. recargar selectivamente la vista activa desde backend;
7. marcar como pendiente una vista inactiva y consultarla al abrirse;
8. preservar filtros, paginación, foco, modales y texto todavía no guardado;
9. impedir solicitudes duplicadas y aplicar agrupación, jitter y backoff;
10. aceptar invalidaciones originadas por otros usuarios mediante el canal global servidor-cliente.

No se considerará integrado un módulo que sólo cambie su DOM local después de guardar o que dependa de F5 para converger con la fuente oficial.

### 5.3 Canal entre usuarios

La solución global debe incorporar un canal autenticado de invalidaciones desde backend. Para el flujo unidireccional servidor-cliente se recomienda SSE; WebSocket sólo será necesario si se justifica comunicación bidireccional persistente.

El evento debe transportar exclusivamente metadatos mínimos, por ejemplo:

- tipo de recurso;
- identificador o alcance no sensible cuando sea necesario;
- versión o revisión;
- fecha del cambio;
- rutas consumidoras o clave de invalidación.

El evento no debe transportar filas operativas completas ni sustituir los Guards. Al recibirlo, el frontend consulta nuevamente el endpoint normal con la sesión y el alcance efectivos.

Si Azure opera con más de una instancia, la difusión no puede depender únicamente de memoria local. Debe utilizar un mecanismo compartido autorizado —por ejemplo, outbox de cambios o broker— con trazabilidad, retención y recuperación definidas.

### 5.4 Respaldo de convergencia

El canal en vivo debe complementarse con una revisión ligera:

- sólo para la ruta visible;
- basada en versión, fecha de actualización o huella certificada;
- sin descargar tablas completas cuando no hubo cambios;
- con intervalo configurable, jitter y backoff;
- pausada cuando la pestaña esté oculta u offline;
- sin crear un timer independiente por módulo.

El intervalo de respaldo no define la inmediatez normal. La actualización ordinaria debe provenir del evento del backend.

## 6. Incumplimientos y riesgos que deberá resolver la integración

La auditoría estática del 27/10/2026 identificó:

- solicitudes directas y fallbacks locales en distintos módulos;
- rutas con datos que no se registran en `ManttoDataSync`;
- rutas marcadas como pendientes que no tienen un handler real de refresco;
- dependencias de mutación incompletas o con nombres de ruta que no existen en la interfaz;
- módulos persistentes que pueden conservar información anterior al navegar y regresar;
- ausencia de sincronización entre usuarios para los módulos normales;
- mecanismos aislados que resuelven sólo un módulo o familia;
- documentación antigua que menciona intervalos que ya no corresponden al código;
- ausencia de una prueba automática de convergencia entre dos usuarios.

Los módulos con mayor prioridad de revisión incluyen Programación de Personal, Instalaciones, Logística, Cobranza, Customer Experience, Legal, Soporte y las rutas persistentes sin adaptador registrado.

## 7. Integración obligatoria en ocho fases

Las fases deben aplicarse en orden. Una fase no se declara completa mientras tenga criterios de aceptación pendientes.

### Fase 1 — Inventario y contrato

- Congelar el catálogo real de funciones globales y responsables.
- Inventariar todas las rutas visibles, endpoints, mutaciones y módulos.
- Clasificar cada uso directo, fallback, duplicado y excepción.
- Crear una matriz módulo → función global → estado de cumplimiento.
- Incorporar la obligación a la Constitución vigente y registrar su ADR.

### Fase 2 — Núcleo de sincronización backend

- Definir el contrato único de invalidación.
- Emitir invalidaciones sólo después de confirmar la transacción.
- Implementar el transporte autenticado servidor-cliente.
- Resolver difusión multi-instancia y reconexión.
- Evitar incluir datos operativos sensibles en los eventos.

### Fase 3 — Núcleo de sincronización frontend

- Integrar el canal del backend con `ManttoDataSync`.
- Centralizar reintentos, backoff, jitter, visibilidad y estado offline.
- Eliminar la necesidad de timers independientes por módulo.
- Mantener `BroadcastChannel` únicamente como complemento entre pestañas.

### Fase 4 — Piloto Programación de Personal

- Migrar Programación de Personal al contrato global completo.
- Validar dos usuarios y dos navegadores/equipos.
- Confirmar actualización sin F5 y preservación de filtros/editores.
- Medir solicitudes, latencia y errores antes de ampliar cobertura.

### Fase 5 — Operación, Portafolio y Ventas

- Integrar Home, Resumen, Críticos, Call Center, Operativo, Portafolio, Proyectos, Movimientos y Ventas.
- Consolidar dependencias cruzadas y eliminar fallbacks locales cubiertos.
- Verificar que sólo la ruta activa consulte inmediatamente.

### Fase 6 — Instalaciones y Logística

- Integrar todas las rutas de Instalaciones y Logística.
- Corregir rutas sin handler, nombres inexistentes y dependencias incompletas.
- Incluir módulos administrativos sin romper Nevera ni editores activos.

### Fase 7 — Cobranza, Almacén, CX, Legal y Soporte

- Integrar los módulos restantes con datos operativos.
- Unificar permisos, alcance, HTTP, estados visuales y sincronización.
- Documentar excepciones justificadas y eliminar implementaciones paralelas.

### Fase 8 — Cierre global y cumplimiento continuo

- Ejecutar auditoría integral de rutas y funciones globales.
- Añadir pruebas que impidan incorporar un módulo sin registro global.
- Probar convergencia multiusuario, reconexión, multiinstancia y modo offline.
- Actualizar documentación obsoleta.
- Declarar explícitamente módulos conformes, excepciones y pendientes.

## 8. Criterios mínimos de aceptación

Una fase o módulo sólo puede declararse integrado cuando:

- no necesita F5 para mostrar un cambio confirmado realizado por otro usuario;
- la vista activa converge normalmente en pocos segundos;
- las vistas inactivas no consultan datos completos y quedan marcadas para sincronizar al abrirse;
- no se pierden filtros, foco, paginación, modal ni contenido sin guardar;
- no existe un timer propio si el Core puede gestionar la revisión;
- las solicitudes pasan por la autenticación y el cliente HTTP globales;
- permisos y alcance se validan en backend con los motores oficiales;
- una interrupción del canal no impide la reconexión ni la convergencia posterior;
- se verificó el comportamiento con dos usuarios reales o dos identidades de prueba independientes;
- existen pruebas automáticas del registro, invalidación y handler del módulo.

## 9. Regla de entrega por fases

Toda entrega de estas fases debe cumplir obligatoriamente:

- sólo archivos nuevos o modificados;
- cada archivo se entrega completo, nunca como fragmento;
- conservar la ruta original del repositorio;
- incluir un README completo de la fase;
- indicar versión base, dependencias, archivos incluidos y criterios de aceptación;
- incluir validaciones ejecutadas y sus resultados reales;
- declarar por separado validación estática, prueba local, prueba multiusuario, prueba con BD y despliegue;
- no incluir instaladores;
- no incluir archivos `.patch`;
- no incluir scripts aplicadores o de reemplazo;
- no incluir comandos PowerShell;
- no depender de copiar y pegar bloques de código en archivos existentes;
- no afirmar commit, push, despliegue o prueba E2E si no ocurrió.

Cuando una fase modifique un archivo compartido, se debe entregar el archivo compartido completo reconciliado contra la base exacta de esa fase. Si no se dispone de esa versión, se debe solicitar el archivo antes de preparar la entrega.

## 10. Archivos esperados por entrega

Cada fase debe contener, como mínimo:

1. los archivos completos de código modificados;
2. los archivos completos de pruebas nuevos o modificados;
3. un README de fase con rutas y dependencias;
4. un ADR cuando exista una decisión arquitectónica;
5. evidencia textual de validación reproducible, sin instaladores ni comandos aplicadores.

No se entregará el proyecto completo salvo solicitud expresa. Tampoco se regenerarán archivos que no hayan cambiado.

## 11. Incorporación futura a la Constitución

Cuando se proporcione la Constitución vigente, este documento debe convertirse en:

- una regla estricta de reutilización obligatoria de funciones globales;
- una ampliación de la consistencia posterior a mutaciones para incluir cambios de otros usuarios;
- una regla no negociable de registro en la sincronización global;
- una regla estricta de entregas por fases con archivos completos;
- una actualización de versión y ADR constitucional.

Hasta esa incorporación, este documento funciona como propuesta técnica y contrato de la integración futura; no sustituye por sí solo la Constitución vigente.
