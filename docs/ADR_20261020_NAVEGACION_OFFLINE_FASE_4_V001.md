# ADR | BLT NOW Navegacion Offline Fase 4 V001

Fecha: 2026-10-20
Estado: Fix preparado; pendiente validacion Local/E2E. No desplegado.
Base: `ziSirrush/GestorMantto@857f52b8f38062f3171c3198568466b83e7805ac`.

## Contexto

Las Fases 1-3 permiten abrir los dos modulos certificados en su interfaz normal usando las copias locales. El motor de respaldos Offline Fase 4/5 ya implementa cola IndexedDB y envio seguro a Azure/Aiven. Falta conectar las acciones descriptivas de las pantallas normales a dicha cola, sin duplicar bases ni endpoints y sin abrir mutaciones prohibidas.

## Decision

Introducir un puente frontend `core/offline-native-actions.js`, cargado desde la navegacion existente y precacheado por el service worker:
- Intercepcion DOM de `submit` en fase de captura del objeto window, antes de los bloqueos de F2/F3 que escuchan en document. Solo se intercepta cuando `ManttoOfflineNavigation.isOffline()` es true y se prueba la ruta oficial con copia completa.
- El formulario nativo de comentarios Ticket se mantiene; se transforma su submit offline en `TICKET_COMMENT` local. El panel nuevo integrado en la misma ficha crea `TICKET_MOVEMENT`.
- En el expediente unificado CORELLIAN se agregan formularios descriptivos `PROJECT_COMMENT` y `PROJECT_MOVEMENT`, sin sustituir el expediente ni tocar el modulo en Nevera.
- Cualquier operacion debe resolver el ID del registro desde un respaldo verificado, mantener la misma identidad y firma durante lectura y llamar al motor unico `ManttoOfflineStorage.enqueueOfflineAction` (sin escribir remoto).
- El motor previo de sincronizacion es el unico responsable del ACK real, permisos efectivos, alcance final e idempotencia. Los comentarios de proyecto son interacciones descriptivas, no comentarios de junta reales.
- La experiencia online se deja sin intervencion.

## Riesgos / limites

No hay captura de Vo.Bo., cambios de estado, documentos o fotos. No se habilita Equipo sin pantalla offline certificada. La copia local solo puede aplicar el ultimo permiso comprobado antes de desconectarse, sujeto a TTL; las revocaciones nuevas son verificables solo al reconectar. No se simula confirmacion remota ni se agregan endpoints o tablas. Que `navigator.onLine` sea true no significa que Aiven este disponible; se usa el estado de conectividad de BLT NOW.

## Pruebas

Validacion estatica de JS, 134 regresiones simuladas integradas mas la prueba especifica de version del worker. No E2E en dispositivo ni base de datos real. Sistemas remotos intactos.
