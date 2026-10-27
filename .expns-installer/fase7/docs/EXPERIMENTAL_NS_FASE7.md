# BLT NOW · Experimental NS · Fase 7 V001

**Fecha de preparación:** 26/10/2026. **Estado:** archivos preparados para validación LOCAL; no desplegado.
**Código base:** `ziSirrush/GestorMantto`, `main` (`aaa1f1ed30798716d0885dee1692ce56b1583402`), más entregas locales Experimental NS F1–F6 V001.

## Alcance real implementado

1. **Borradores de prueba, no oficiales:** cuando un Programador abre un ticket en los detalles de Resumen del Día NS, Equipos Críticos NS o Proyectos de Mantenimiento NS, puede escribir un **comentario local de prueba**, no enviado a Aiven ni NetSuite. Se guarda automáticamente a los 300 ms del último cambio y al ocultar la pestaña/navegar. Se puede copiar o descartar.
2. **Protección frente a cambios de NetSuite:** F6 conserva el DOM y el foco; F7 mantiene el editor **fuera de los contenedores que F6 parchea**. Cambios externos de campos compartidos (estado, cierre, responsabilidad, causa, motivo, etc.) no sobrescriben el borrador.
3. **Aviso de cambio concurrente de registro (prototipo visual):** compara el estado de campos observados frente a la fotografía al iniciar el borrador. Si detecta cambios, muestra un aviso y opción **«Ya revisé el cambio»**. No hace merge ni escritura del ticket.
4. **Historial temporal de cambios observados:** por ticket, hora local, valor anterior/nuevo y etiqueta **«actor NS no confirmado»**; máximo 50 eventos en memoria de la pestaña. No es auditoría persistente y no puede atribuir qué usuario de NetSuite modificó el registro.
5. **Reconexión sin interrupciones:** aprovecha el chequeo de F6 y al volver internet solicita una revalidación del módulo experimental abierto. No ejecuta cambios en formularios ni obliga a pulsar F5.
6. **Seguridad:** borradores en `sessionStorage` de la pestaña (hasta 20 tickets, 5,000 caracteres por borrador, caducidad de 8 horas), separados por actor y usuario efectivo; se eliminan al cerrar sesión, perder alcance o cambiar usuario/visor. Si `sessionStorage` está deshabilitado, se usa memoria volátil y se indica la limitación.

## Limitaciones / frontera formal

- Los tres módulos NS siguen siendo **de solo lectura** en el backend. El borrador de prueba **NO crea un comentario real** ni se sincroniza a otros dispositivos. Tampoco puede sustituir un formulario oficial de comentarios o Vo.Bo.
- **No se implementa bloqueo optimista del backend ni reconciliación de dos escrituras simultáneas.** Para realizar guardado real entre usuarios se requerirá un endpoint de escritura autorizado con verificación de versión y definición de permisos, fuera de F7.
- Sin receptor NS persistiendo en Aiven, la simulación de cambios se efectúa con API simulada. F6 consulta versiones cada 30 segundos; no es notificación push instantánea.
- `sessionStorage` no es un almacén cifrado ni una fuente de verdad. Evitar redactar secretos o datos sensibles en el borrador del piloto. El borrador puede perderse ante cierre inesperado del navegador o limpieza de datos.
- Historial y advertencias se limitan a campos y registros **efectivamente consultados**: si nunca se cargó un ticket en esta pestaña, no existe una fotografía anterior que comparar.

## Archivos de entrega

**Nuevos:**
- `modules/experimental-ns/experimental-ns-protection.js`
- `modules/experimental-ns/experimental-ns-protection.css`
- `backend/tests/experimental-ns-fase7.test.js`
- `docs/EXPERIMENTAL_NS_FASE7.md`
- `docs/ADR_20261026_EXPNS_F7_BORRADORES_Y_CONFLICTOS.md`

**Modificados completos (sobre F6 V001):**
- `modules/experimental-ns/experimental-ns.js`
- `modules/experimental-ns/experimental-ns-live.js` (revocación de acceso limpia borradores)
- `modules/experimental-ns/resumen-dia/resumen-dia-ns.js`
- `modules/experimental-ns/equipos-criticos/equipos-criticos-ns.js`
- `modules/experimental-ns/proyectos-mantenimiento/proyectos-mantenimiento-ns.js`
- `backend/tests/experimental-ns-fase3.test.js` (mock del cargador F7)

**Sin tocar:** Core global, los módulos productivos, endpoints de escritura, SQL, índice de rutas backend, NetSuite y permisos existentes.

## Pruebas ejecutadas realmente

- `node --check`: scripts JS nuevos y modificados, correcto.
- `node --test backend/tests/experimental-ns-fase{2,3,4,5,6,7}.test.js`: **99/99 aprobadas**, con backends simulados.
- Chromium headless: **3/3 escenarios F3/F4/F5** con API y `sessionStorage` simulados. Se probó transición de Ticket `Abierto → Cerrado`, foco y texto de borrador conservados, aviso de versión, historial, separación por usuario efectivo y borrado en logout.
- **No se ejecutó** prueba E2E contra Aiven/NetSuite/Azure, prueba de concurrencia con usuarios reales ni evaluación de carga.

## Pasos de validación manual en LOCAL

1. Aplicar F1–F6 V001 en el repositorio LOCAL y después este ZIP con los comandos PowerShell.
2. Abrir cualquiera de los tres módulos NS como Programador y abrir un ticket. Escribir una nota en el editor «Borrador local · Ticket».
3. Cambiar de vista y regresar: el borrador sigue allí; recargar la pestaña y verificar restauración desde `sessionStorage`.
4. Sobre **una copia de pruebas autorizada**, modificar el estado del ticket (o simular la respuesta NS) y esperar la comprobación de F6: aparece `Cerrado`, cambia el historial, el editor no se borra.
5. Revisar el cambio con «Ya revisé el cambio». Verificar que no se ejecutaron métodos POST/PUT/PATCH/DELETE.
6. Simular pérdida/recuperación de red. Cerrar sesión y comprobar que se borra el borrador de esta pestaña.

**No realizar pruebas de escritura sobre tablas productivas.**
