# Gestor Mantto - Project Context

## Objetivo

Sistema de gestión de operaciones basado en HTML/CSS/JS + Railway +
Aiven MySQL.

## Arquitectura

-   Frontend: HTML, CSS y JavaScript.
-   Backend: Node.js + Express (Railway).
-   Base de datos: Aiven MySQL.
-   Hosting: Netlify.
-   Repositorio: GitHub.

## Regla principal

Aiven es la única fuente oficial de datos. Toda integración proveniente
de un entorno con Supabase debe adaptarse a Aiven/Railway.

## Flujo

Google Sheets → Apps Script → Aiven → Railway → Frontend → Netlify

## Metodología

1.  Trabajar sobre los archivos vigentes del repositorio.
2.  Crear respaldo.
3.  Integrar por módulos.
4.  Validar consola.
5.  Publicar GitHub.
6.  Verificar Netlify.
