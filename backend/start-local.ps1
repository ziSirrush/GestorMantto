$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot
$env:NODE_ENV = "development"

Write-Host "Validando estructura..." -ForegroundColor Cyan
npm run check

Write-Host "Iniciando Mantto Gestor API en http://localhost:3001" -ForegroundColor Green
npm run dev
