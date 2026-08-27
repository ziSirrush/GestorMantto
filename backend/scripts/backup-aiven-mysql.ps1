param(
  [string]$OutputDirectory = "",
  [string]$MySqlDumpPath = "mysqldump",
  [switch]$Force
)

$ErrorActionPreference = "Stop"

function Require-EnvironmentVariable([string]$Name) {
  $value = [Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Falta la variable de entorno $Name."
  }
  return $value
}

$dbHost = Require-EnvironmentVariable "DB_HOST"
$dbPort = Require-EnvironmentVariable "DB_PORT"
$dbUser = Require-EnvironmentVariable "DB_USER"
$dbPassword = Require-EnvironmentVariable "DB_PASSWORD"
$dbName = Require-EnvironmentVariable "DB_NAME"

if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
  $OutputDirectory = Join-Path (Get-Location) "backups"
}

if (-not (Test-Path -LiteralPath $OutputDirectory)) {
  New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
}

$dumpName = "SABANA_{0}.sql" -f (Get-Date -Format "yyyyMMdd")
$dumpPath = Join-Path $OutputDirectory $dumpName

if ((Test-Path -LiteralPath $dumpPath) -and -not $Force) {
  throw "Ya existe $dumpPath. Usa -Force solo si deseas reemplazar conscientemente el respaldo del dia."
}

$validator = Join-Path $PSScriptRoot "validate-backup-utf8mb4.js"
if (-not (Test-Path -LiteralPath $validator)) {
  throw "No se encontro el validador requerido: $validator"
}

$nodeCommand = Get-Command node -ErrorAction Stop
$dumpCommand = Get-Command $MySqlDumpPath -ErrorAction Stop

$previousMysqlPwd = [Environment]::GetEnvironmentVariable("MYSQL_PWD")

try {
  # MYSQL_PWD evita exponer la contrasena como argumento visible del proceso.
  [Environment]::SetEnvironmentVariable("MYSQL_PWD", $dbPassword)

  $arguments = @(
    "--host=$dbHost",
    "--port=$dbPort",
    "--user=$dbUser",
    "--default-character-set=utf8mb4",
    "--ssl-mode=REQUIRED",
    "--single-transaction",
    "--quick",
    "--routines",
    "--events",
    "--triggers",
    "--hex-blob",
    "--no-tablespaces",
    "--column-statistics=0",
    "--set-gtid-purged=OFF",
    "--result-file=$dumpPath",
    $dbName
  )

  Write-Host "Generando respaldo UTF8MB4..."
  Write-Host "Destino: $dumpPath"
  & $dumpCommand.Source @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "mysqldump termino con codigo $LASTEXITCODE."
  }
} finally {
  [Environment]::SetEnvironmentVariable("MYSQL_PWD", $previousMysqlPwd)
}

if (-not (Test-Path -LiteralPath $dumpPath)) {
  throw "mysqldump termino sin crear el archivo esperado: $dumpPath"
}

$fileInfo = Get-Item -LiteralPath $dumpPath
if ($fileInfo.Length -le 0) {
  throw "El archivo de respaldo fue creado vacio: $dumpPath"
}

Write-Host "Validando encabezado, cierre, charset e iconos criticos..."
& $nodeCommand.Source $validator $dumpPath
if ($LASTEXITCODE -ne 0) {
  throw "El dump fue generado, pero NO paso la validacion UTF8MB4. No debe marcarse como respaldo validado."
}

Write-Host "[OK] Respaldo mensual generado y validado: $dumpPath"
Write-Host "[PENDIENTE] La validacion de recuperacion exige restaurarlo en un MySQL LAB y ejecutar smoke tests."
