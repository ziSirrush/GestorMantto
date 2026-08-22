# FASE MP — BLOQUE B — Desglose de Adeudo V001

**Proyecto:** Mantto Gestor  
**Fecha:** 17/08/2026  
**Base:** `ziSirrush/GestorMantto` → `main` + Bloque A de MP

## Alcance

Se agrega en **Cobranza United → Mantenimiento Preventivo → Vista MAIN** el desglose económico solicitado:

- **Adeudo Total**
- **Adeudo MP**
- **Adeudo VA**

La fórmula usada es la misma ya aplicada en el Detalle de Proyecto:

```text
Adeudo MP = SUM(Pendiente Corriente + Pendiente Vencido)
Adeudo VA = SUM(pc.adeudo)
Adeudo Total = Adeudo MP + Adeudo VA
```

No se crea un KPI funcional distinto llamado “Pendiente Total”. La columna histórica `pendiente` de `detalle_mp_2026` se conserva sin cambios.

## Acomodo de KPIs

La vista MAIN de MP queda organizada en dos bloques:

### Indicadores MP
1. Total registros
2. Con pendiente
3. Facturas pendientes
4. Monto anual
5. Pendiente corriente
6. Pendiente vencido

### Desglose del adeudo
1. Adeudo Total
2. Adeudo MP
3. Adeudo VA

El diseño es responsive: 3 columnas en escritorio, 2 en pantallas intermedias y 1 en móvil para estos bloques.

## Backend

Se extiende únicamente la lectura `GET /api/cobranza-uni/detalle-mp-2026`.

Cada fila de MP recibe:

- `adeudo_mp`: `pendiente_corriente + pendiente_vencido`.
- `adeudo_va`: suma de `pc.adeudo` del mismo proyecto, enlazando por `id_proyecto_cobranza` y/o nombre de proyecto existente.

También se agregan al objeto `kpis` del endpoint:

- `adeudo_mp_total`
- `adeudo_va_total`
- `adeudo_total`

Cuando existen varias filas MP del mismo proyecto, **Adeudo VA se cuenta una sola vez por proyecto** en los totales para evitar duplicarlo.

## Compatibilidad con filtros

Los KPIs se recalculan sobre `mpFilteredRows_uni()`, por lo que reflejan los filtros activos de la pantalla.

El **Bloque A queda preservado**:

- Todos
- Con Pendiente
- Facturas Pendientes

No se agregan nuevas llamadas HTTP al frontend; los importes llegan en la respuesta ya existente de la MAIN de MP.

## Archivos modificados

- `modules/cobranza-uni/cobranza-uni.js`
- `modules/cobranza-uni/cobranza-uni.css`
- `backend/src/controllers/detalle-mp-2026.controller.js`

## Bases verificadas

- Frontend original de GitHub: blob `a6e30aebebb231e4f5a70bcf16834b306f4096c3`.
- Frontend después del Bloque A usado como base acumulativa: blob local `8c9ff69ee265844e068defd6a9e2e57a103a95a6`.
- CSS actual de GitHub: blob `2ff500463ba3dcb7316ed9d2451cfc543b86c447`.
- Backend actual de GitHub: blob `54205a4027ae65dc920e85481c10d2edf3a37113`.

## No incluido

- No se modifica Aiven/schema.
- No hay `ALTER`, `CREATE TABLE` ni `DROP TABLE`.
- No se modifica Gestión de Crédito.
- No se modifica Venta Adicional.
- No se cambia la tabla visual de MP.
- No se cambia la ruta HTTP.
- No se modifica el detalle individual de MP.

## Validaciones realizadas

- `node --check modules/cobranza-uni/cobranza-uni.js`: OK.
- `node --check backend/src/controllers/detalle-mp-2026.controller.js`: OK.
- CSS del Bloque B aislado al namespace `.mp-uni-*`.
- Confirmado que el Bloque A sigue presente.
- Confirmado que el diff de backend no agrega DDL.
- Prueba de cálculo con varias filas del mismo proyecto: Adeudo VA se cuenta una sola vez.

## Validación posterior al deploy

1. Reiniciar/desplegar backend.
2. Confirmar `/api/health`.
3. Abrir Mantenimiento Preventivo.
4. Comparar un proyecto conocido contra:
   - `detalle_mp_2026.pendiente_corriente + pendiente_vencido`;
   - suma de `pc.adeudo` del proyecto.
5. Verificar `Adeudo Total = Adeudo MP + Adeudo VA`.
6. Aplicar `Con Pendiente` y `Facturas Pendientes` y confirmar que los tres KPIs de adeudo responden al conjunto filtrado.
7. Revisar escritorio/móvil.

**Nota:** la validación realizada es estática/local. No se afirma resultado contra Aiven de producción hasta desplegar y probar el endpoint real.
