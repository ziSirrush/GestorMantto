# Pruebas V1.1.2 - Fix Resumen del Dia

Cambios aplicados:
- Se conserva Top 20 en equipos y proyectos, sin paginar esas tablas.
- Reordenado en Resumen del Dia: Tickets -> Equipos con mas llamadas -> Proyectos con mas llamadas.
- Separacion visual de 8px entre filas superiores de KPIs.
- Clic en el mismo KPI vuelve a ocultar su tabla de detalle.
- Calculo de tiempos reforzado con fecha/hora de reporte, llegada y solucion cuando las columnas de tiempo vienen vacias o con formatos no confiables.
- Parser agregado para fechas/horas tipo `5/07/2025`, `7:44 AM`, `H_Reporte`, `F_Llegada`, `H_Solucion`, etc.
- Detalle flotante de ticket con scroll vertical forzado en el contenido principal.

Nota: no se agrego paginacion a Top 20 porque se decidio respetar la logica de Desarrollo.
