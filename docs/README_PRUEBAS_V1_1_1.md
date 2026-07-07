# Pruebas V1.1.1 - Ajustes de Resumen del Día

Cambios aplicados:

- Alineación del bloque de usuario en la barra superior.
- Barra superior ligeramente más alta para evitar empalmes.
- Detalle flotante de ticket con scroll interno real.
- Panel de chat/histórico visible y con scroll propio.
- Apartado de tiempos del detalle ahora muestra duración calculada cuando existe dato o cuando se puede calcular con fechas/horas.
- Causa Falla BLT / Cliente ahora infiere responsabilidad desde `causa_falla` si `responsabilidad` viene vacía.
- Se mantiene Aiven como única fuente de datos.
- Se mantienen módulos no integrados como En construcción.

Nota:
- La inferencia de responsabilidad por causa de falla es temporal para corregir datos donde `responsabilidad` viene vacía. Si más adelante normalizamos esa columna en Aiven, el cálculo tomará la responsabilidad real primero.
