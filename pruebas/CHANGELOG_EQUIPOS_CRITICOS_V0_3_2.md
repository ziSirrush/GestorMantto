# CHANGELOG - Equipos Criticos Pruebas V0.3.2

## Correccion

- Se corrigio la activacion de vistas para que al entrar a `criticos` se oculten de forma forzada todas las demas vistas.
- Se evita que `Resumen del Dia` quede visible debajo o mezclado si el CSS/base no aplica correctamente o si la vista previa conserva el scroll anterior.
- Se agrega placeholder inmediato de `Equipos Criticos` antes de inicializar el modulo, para validar que la navegacion llego al destino correcto.

## Alcance

- No se toca `modules/resumen-dia/*`.
- No se cambia logica de calculo.
- No se cambia backend.
