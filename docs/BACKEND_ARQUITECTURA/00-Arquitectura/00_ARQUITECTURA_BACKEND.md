# 00_ARQUITECTURA_BACKEND.md

**Proyecto:** Mantto Gestor  
**Documento:** Arquitectura Base del Backend  
**Versión:** 1.0  
**Estado:** Aprobado (Fase 0)  
**Última actualización:** Julio 2026

---

# 1. Objetivo

Definir la arquitectura oficial del Backend de Mantto Gestor para garantizar que el crecimiento del sistema sea ordenado, modular, escalable y seguro.

Este documento representa la base arquitectónica del proyecto y debe servir como referencia para cualquier desarrollo futuro.

No documenta funcionalidades específicas ni consultas SQL; únicamente establece cómo debe construirse el backend.

---

# 2. Filosofía de Diseño

Mantto Gestor adopta una arquitectura modular.

Cada módulo es completamente responsable de su funcionalidad.

Esto significa que un módulo debe contener toda la lógica necesaria para operar sin depender de la implementación interna de otros módulos.

La comunicación entre módulos deberá realizarse únicamente mediante servicios compartidos o repositorios compartidos, nunca importando directamente controladores de otros módulos.

---

# 3. Principios Arquitectónicos

## 3.1 Modularidad

Cada módulo representa una unidad funcional del sistema.

Ejemplos:

- Dashboard Operativo
- Dashboard Portafolio
- Resumen del Día
- Equipos Críticos
- Detalle Proyecto
- Detalle Equipo
- Tickets
- Usuarios

Cada módulo deberá ser independiente.

---

## 3.2 Responsabilidad Única

Cada archivo debe tener una única responsabilidad.

Ejemplo:

Routes

- registrar endpoints
- autenticación
- permisos
- validaciones

Controller

- recibir request
- llamar al service
- devolver response

Service

- reglas de negocio
- cálculos
- construcción del contrato

Repository

- consultas SQL
- acceso a MySQL

---

## 3.3 Bajo Acoplamiento

Los módulos no deben depender entre sí.

Incorrecto:

Dashboard Operativo

↓

Controller de Dashboard Portafolio

Correcto:

Dashboard Operativo

↓

Shared Repository

↓

MySQL

---

## 3.4 Alta Cohesión

Toda la lógica relacionada con un módulo debe encontrarse dentro del propio módulo.

No debe existir lógica distribuida entre múltiples carpetas sin justificación.

---

## 3.5 Compatibilidad

Las modificaciones del backend no deberán romper el frontend existente.

Mientras exista compatibilidad, los endpoints actuales podrán mantenerse como alias.

---

# 4. Arquitectura General

La arquitectura se divide en capas.

```
Frontend

↓

Routes

↓

Controllers

↓

Services

↓

Repositories

↓

MySQL
```

Cada capa tiene responsabilidades claramente definidas.

---

# 5. Estructura Oficial

```
backend/

src/

config/

infrastructure/

middleware/

shared/

jobs/

modules/
```

Cada directorio tiene una responsabilidad específica.

---

## Config

Configuración del sistema.

Ejemplos:

- Base de datos
- Variables de entorno
- CORS
- Seguridad

---

## Infrastructure

Componentes técnicos.

Ejemplos:

- Pool MySQL
- Azure Storage
- Google OAuth
- Servicios externos

---

## Middleware

Procesamiento común.

Ejemplos:

- Auth
- Permissions
- Auditoría
- Manejo de errores
- Contexto de usuario

---

## Shared

Componentes reutilizables.

Ejemplos:

- Helpers
- Validators
- Repositories compartidos
- Constantes
- Errores comunes

---

## Jobs

Procesos automáticos.

Ejemplos:

- Cierre mensual
- Cierre semanal
- Limpiezas
- Sincronizaciones programadas

---

## Modules

Contiene todos los módulos funcionales del sistema.

Cada módulo es independiente.

---

# 6. Estructura de un Módulo

Cada módulo deberá seguir la siguiente estructura:

```
modulo/

modulo.routes.js

modulo.controller.js

modulo.service.js

modulo.repository.js

modulo.contract.js

modulo.validator.js

modulo.constants.js

README.md

CHANGELOG.md
```

Dependiendo del tamaño del módulo podrán agregarse archivos adicionales.

---

# 7. Responsabilidad de Cada Archivo

## Routes

Responsable de:

- URL
- Método HTTP
- Middleware
- Validaciones
- Llamada al Controller

No contiene lógica de negocio.

---

## Controller

Responsable de:

- Leer parámetros
- Invocar Services
- Manejar códigos HTTP
- Manejar excepciones

No contiene SQL.

---

## Service

Responsable de:

- Reglas de negocio
- Cálculos
- Construcción de respuestas
- Integración entre repositorios

No contiene acceso directo al Request.

---

## Repository

Responsable de:

- SQL
- Transacciones
- Acceso a MySQL

No construye respuestas HTTP.

---

## Contract

Define el formato oficial de respuesta del módulo.

Los contratos son parte de la arquitectura y deben mantenerse compatibles.

---

## Validator

Valida parámetros de entrada.

No realiza consultas SQL.

---

## Constants

Contiene únicamente constantes propias del módulo.

---

# 8. Servicios Compartidos

Los módulos podrán reutilizar componentes compartidos ubicados en:

```
shared/
```

Ejemplos:

- repositorios comunes
- validadores comunes
- helpers
- constantes globales

Los módulos nunca deberán reutilizar Controllers de otros módulos.

---

# 9. Contratos

Todo endpoint deberá tener un contrato claramente definido.

El contrato representa el formato oficial de respuesta.

No podrán eliminarse propiedades sin una migración documentada.

---

# 10. Compatibilidad

Durante la migración del backend se conservarán los endpoints actuales mediante aliases cuando sea necesario.

El objetivo es evitar modificaciones simultáneas del frontend.

---

# 11. Escalabilidad

La arquitectura deberá permitir incorporar nuevos módulos sin afectar los existentes.

Agregar un módulo nuevo no deberá requerir modificar otros módulos.

---

# 12. Mantenibilidad

Cada módulo deberá poder mantenerse de forma independiente.

Una modificación en un módulo no deberá provocar regresiones funcionales en otros módulos.

---

# 13. Seguridad

Toda ruta deberá validar:

- autenticación
- permisos
- empresa activa
- contexto del usuario

No deberán confiarse permisos únicamente al frontend.

---

# 14. Documentación

Todo módulo deberá incluir:

- README
- CHANGELOG
- contrato documentado
- propietario del módulo

---

# 15. Objetivo Final

La arquitectura busca que Mantto Gestor pueda crecer durante varios años manteniendo:

- independencia entre módulos
- facilidad de mantenimiento
- compatibilidad
- estabilidad
- escalabilidad
- claridad para futuros desarrolladores

Este documento constituye la base oficial de la arquitectura del Backend de Mantto Gestor y deberá utilizarse como referencia para todas las fases posteriores de la reconstrucción del sistema.