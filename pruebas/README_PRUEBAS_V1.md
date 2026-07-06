# Mantto Gestor - Pruebas V1

Esta versión es la base oficial de pruebas para integrar módulo por módulo.

## Incluye

- Flujo de inicio de sesión contra Aiven por backend local.
- Sesión persistente con token JWT en frontend.
- Primer acceso: cambio de contraseña y pregunta de seguridad.
- Recuperación de contraseña por pregunta de seguridad.
- Header, barra contextual, panel lateral y Home aprobados.
- Centro de Ayuda conectado a tablas `sup_*` de Aiven.
- Nori conectado a `sup_nodos` y `sup_opciones` de Aiven.
- Solicitud de soporte conectada a `sup_tickets`.
- Módulo Resumen del Día conectado solo a datos reales desde `/api/tickets` y `/api/portafolio`.

## Sin datos precargados

No se usan mocks ni datos demo. Si una tabla está vacía, el sistema muestra estado vacío.

## Ejecución local

Terminal 1:

```powershell
cd "C:\\Users\\T14s\\Desktop\\Nueva-estructura-Modulos\\backend"
node server.js
```

Terminal 2:

```powershell
cd "C:\\Users\\T14s\\Desktop\\Nueva-estructura-Modulos\\pruebas"
npx http-server
```

## Pendiente para próximos módulos

1. Equipos Críticos
2. Dashboard Call Center
3. Dashboard Operativo
4. Portafolio
5. Proyectos
6. Usuarios
7. Tickets
8. Panel de Control
