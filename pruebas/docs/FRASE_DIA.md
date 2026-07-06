# Frase del día - entorno de pruebas

Implementación actual: opción 1 local/simple.

- Archivo: `core/daily-phrases.js`
- La frase cambia automáticamente según el día del año.
- No requiere conexión a Aiven.
- La barra contextual muestra fecha, hora y frase diaria.

## Migración futura a Aiven

Cuando se decida administrar frases desde BD, se recomienda crear una tabla similar a:

```sql
CREATE TABLE frases_dia (
  id_frase BIGINT NOT NULL AUTO_INCREMENT,
  frase VARCHAR(255) NOT NULL,
  autor VARCHAR(120) DEFAULT NULL,
  categoria VARCHAR(80) DEFAULT 'operaciones',
  estado TINYINT NOT NULL DEFAULT 1,
  fecha_programada DATE DEFAULT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by VARCHAR(255) DEFAULT NULL,
  updated_by VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (id_frase),
  KEY idx_frases_estado (estado),
  KEY idx_frases_fecha_programada (fecha_programada)
);
```

Regla sugerida:
- Si existe `fecha_programada = CURDATE()` y `estado = 1`, usar esa frase.
- Si no existe, usar una frase activa calculada por día del año.
