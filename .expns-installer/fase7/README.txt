BLT NOW | EXPERIMENTAL NS | FASE 7 V001

F7 = PROTECCION DE BORRADORES LOCALES DE PRUEBA + AVISO DE CAMBIOS EN TICKETS.
NO SON COMENTARIOS GUARDADOS EN NETSUITE/ AIVEN. LOS MODULOS NS SIGUEN SOLO LECTURA.

INCLUYE:
- Autoguardado de borradores en sessionStorage por pestaña/usuario (8 h, 20 tickets).
- Aviso y revision manual cuando el ticket NS cambia mientras se redacta.
- Historial de campos modificados detectados en la sesion, sin autoria NS confirmada.
- Reconexion conservando el borrador, sin F5, sin perder foco.
- Pruebas Node y Chromium simulado, documentacion y PowerShell con respaldo/rollback.

REQUISITOS: Fases 1 a 6 V001 aplicadas LOCALMENTE, sin modificaciones extra en
los seis archivos que F7 reemplazara. Si divergen sus SHA256, PowerShell aborta.

COMO APLICAR (SOLO LOCAL):
1. Coloca EXPERIMENTAL_NS_FASE7_V001.zip en Descargas.
2. Abre COMANDOS_POWERSHELL.txt y pega los comandos en PowerShell.
3. Verifica la salida y el backup. No se realiza commit, push ni deploy.

PRUEBAS REALIZADAS: Node 99/99; Chromium con API y almacenamiento simulados 3/3.
PENDIENTES: E2E con Aiven/NetSuite, control transaccional de edicion y concurrencia.

FUENTE VERSIONADA: GitHub main aaa1f1ed30798716d0885dee1692ce56b1583402;
archivos de desarrollo sucesivos F1-F6 de esta conversacion.
GitHub, Azure, Aiven, NetSuite y Netlify permanecen INTACTOS.
