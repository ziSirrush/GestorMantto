# 02_REGLAS_DESARROLLO

## Reglas generales

1. Un módulo = un propietario.
2. No escribir SQL dentro de Routes.
3. No importar Controllers entre módulos.
4. Toda lógica de negocio pertenece al Service.
5. Todo acceso a MySQL pertenece al Repository.
6. Todo endpoint tendrá contrato documentado.
7. Toda modificación debe respetar contratos existentes.
8. Los módulos congelados no se modifican sin autorización.
9. Todo módulo tendrá README y CHANGELOG.
10. Todo cambio deberá validarse antes de desplegarse.
