# PROJECT_CONSTITUTION.md

Versión: 1.0\
Estado: Activo\
Proyecto: Mantto Gestor

## Constitución del Proyecto

Este documento define las normas oficiales de desarrollo, arquitectura y
colaboración de Mantto Gestor. Si existe una contradicción entre el
código y este documento, no se deberá modificar el código
automáticamente; primero deberá reportarse la diferencia para decidir
cuál debe adaptarse.

## 1. Filosofía

-   Priorizar estabilidad, escalabilidad, modularidad, mantenibilidad,
    rendimiento y facilidad de uso.
-   Nunca priorizar una mejora técnica sobre la estabilidad del sistema.

## 2. Fuente oficial de datos

-   Aiven MySQL es la única fuente oficial para información operativa.
-   Cualquier nueva fuente deberá documentarse mediante un ADR.

## 3. Arquitectura

-   Frontend: HTML, CSS, JavaScript.
-   Backend: Node.js + Express.
-   Base de datos: Aiven MySQL.
-   Backend desplegado en Railway.
-   Frontend publicado en Netlify.
-   Repositorio en GitHub.

## 4. Modularidad

-   Cada módulo debe ser independiente.
-   Minimizar dependencias entre módulos.

## 5. Módulos en Nevera

-   No se modifican salvo:
    -   Error crítico.
    -   Problema de seguridad.
    -   Imposibilidad técnica de otra solución.
-   En cualquier otro caso se adapta el módulo nuevo.

## 6. Variables

-   No compartir variables entre módulos cuando pueda generar
    conflictos.
-   Prefijos sugeridos: RD\_, EC\_, CC\_, USR\_, CTRL\_, NORI\_.
-   Se permite duplicar variables si protege la estabilidad.

## 7. Desarrollo

-   Desarrollo incremental.
-   Entregar únicamente archivos modificados.
-   No regenerar archivos sin cambios.

## 8. Versionado

Estados: - Desarrollo - Pruebas - Preaprobado - Nevera - Producción

## 9. Responsive

-   Todo módulo nuevo debe diseñarse pensando en PWA.
-   Reorganizar información antes que eliminarla.

## 10. Backend

-   El backend realiza consultas, filtros y cálculos pesados.
-   El frontend presenta información.

## 11. Base de Datos

-   Diseñada para aproximadamente 10 años.
-   Cada 5 años:
    1.  Respaldo completo.
    2.  Validación.
    3.  Archivado histórico.
    4.  Mantener aproximadamente los últimos 2 años en producción.

## 12. Auditoría

Registrar quién, qué, cuándo, dónde y por qué.

## 13. Documentación

Cada módulo debe incluir cuando aplique: - README - CHANGELOG - Reglas
de negocio - Notas técnicas

## 14. Entregables

-   Solo archivos modificados.
-   Proyecto completo solo cuando el usuario lo solicite o para
    versiones candidatas/aprobadas.

## 15. PDFs

Inicialmente mediante librerías locales. APIs externas deberán evaluarse
antes de implementarse.

## 16. Permisos

Se desarrollarán formalmente en el módulo Panel de Control.

## 17. Nori

Debe mantenerse desacoplada y actuar como asistente.

## 18. Reglas de negocio

Documentar reglas como: - Equipo crítico - Vo.Bo. - Prioridades - KPIs -
SLA

## 19. IA como miembro del equipo

La IA debe: - Señalar solicitudes ambiguas. - Advertir riesgos. - Decir
cuando algo sea inviable. - Proponer alternativas. - No asumir
automáticamente que el usuario o la IA tienen razón. - Respetar esta
Constitución.

## 20. ADR

Toda decisión arquitectónica importante debe registrarse mediante un
Architecture Decision Record (ADR).

## 21. No negociables

-   Aiven como fuente oficial.
-   No modificar módulos en Nevera salvo casos críticos.
-   Modularidad.
-   Variables independientes por módulo cuando sea necesario.
-   Responsive obligatorio.
-   Entregas incrementales.
-   No regenerar archivos innecesarios.
-   Documentar decisiones importantes.
-   Priorizar estabilidad.

## 22. Negociables

-   Diseño visual.
-   Librerías.
-   Widgets.
-   KPIs.
-   PDFs.
-   Herramientas auxiliares.

## 23. Evolución

Toda modificación a esta Constitución deberá justificarse y registrarse
mediante un ADR.
