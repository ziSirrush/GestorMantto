# FIX FASE 3 — Filtro Asesor en Cotizaciones Corellian

**Fecha:** 17/08/2026  
**Repositorio base:** `ziSirrush/GestorMantto` · `main`  
**Ámbito:** Ventas Corellian (`_cor`)  
**Dependencia funcional:** FASE 2 — Alcance Ventas Corellian.

## Problema confirmado

En `modules/ventas-cotizaciones/ventas-cotizaciones.js` el filtro **Asesor** solo se enviaba al backend cuando `visibilidad.acceso_total === true`.

Además, `applyVisibilityUI()` ocultaba tanto **Asesor** como **Administrativo** para cualquier usuario sin acceso total y limpiaba ambos valores.

Por ello, aunque la backend ya devolviera `ids_asesores_visibles` para un Gerente o Administrativo, el frontend no permitía utilizar ese alcance en el filtro.

## Cambio aplicado

Se modifica únicamente:

- `modules/ventas-cotizaciones/ventas-cotizaciones.js`

Cambios funcionales:

1. `id_asesor` ya puede viajar en la consulta para alcances limitados.
2. El selector **Asesor** se mantiene visible cuando el usuario tiene asesores autorizados.
3. Para alcances no totales, las opciones del selector se cruzan con `visibilidad.ids_asesores_visibles`.
4. En un alcance de Gerente, si el propio gerente aparece en el catálogo histórico de asesores, se excluye de este selector cuando su perfil corresponde a Gerente; el filtro muestra a sus asesores autorizados.
5. Para `ADMIN_REL`, el selector muestra únicamente los asesores contenidos en el alcance resuelto mediante `usuarios_rel_admin`.
6. Para un Asesor, el filtro solo puede contener su propio ID si está presente en el catálogo.
7. **Acceso Total conserva el comportamiento previo del catálogo.**
8. El filtro **Administrativo** conserva su regla existente: solo se envía cuando `acceso_total === true`.
9. No se modificaron las opciones del formulario de alta/edición; esta Fase cambia exclusivamente el filtro de consulta.

## Seguridad / alcance

El filtro no concede acceso por sí mismo. El backend continúa aplicando el `scope` comercial en las consultas de Cotizaciones. Un `id_asesor` fuera del alcance no amplía la visibilidad.

## Archivos no modificados

- Backend.
- SQL / Aiven.
- `index.html`.
- `core/router.js`.
- Instalaciones.
- United (`_uni`).

## Validaciones realizadas

- Base reconstruida y comprobada contra el blob vigente de GitHub antes de modificar:
  - `d30b6b398ad32e1cdc16178e9b989c8412a5444d`
- `node --check modules/ventas-cotizaciones/ventas-cotizaciones.js` → PASS.
- Simulación Gerente: actor + asesores autorizados → selector conserva solo asesores autorizados → PASS.
- Simulación Administrativo `ADMIN_REL` → solo IDs relacionados → PASS.
- Simulación Asesor → solo ID propio → PASS.
- Simulación Acceso Total → catálogo previo sin restricción adicional → PASS.
- Consulta con alcance limitado + Asesor seleccionado → envía `id_asesor` → PASS.
- Consulta con alcance limitado → no habilita `id_admin` → PASS.

## Resultado esperado

Después de aplicar FASE 2 + FASE 3:

- Gerente: ve su universo autorizado y puede filtrar por sus asesores.
- Administrativo: ve su universo autorizado y puede filtrar por los asesores de `usuarios_rel_admin`.
- Asesor: permanece restringido a sí mismo.
- Acceso Total: mantiene su funcionamiento actual.

No se despliega ni publica automáticamente.
