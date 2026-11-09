# BLT NOW - sincronizacion local segura (opt-in).
# Version 2026-11-09. Solo sincroniza las dos rutas aprobadas.
# No instala tareas salvo al usar -InstallTask explicitamente.
param(
  [string]$RepoPath = '',
  [switch]$InstallTask,
  [switch]$RemoveTask
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($InstallTask -and $RemoveTask) {
  throw 'Selecciona solo -InstallTask o -RemoveTask.'
}

$approvedPaths = @(
  'C:\Users\T14s\Downloads\mantto_gestor_frontend',
  'C:\Users\poock\Desktop\Publicada\mantto_gestor_frontend'
)

if ([string]::IsNullOrWhiteSpace($RepoPath)) {
  $existing = @($approvedPaths | Where-Object { Test-Path -LiteralPath $_ -PathType Container })
  if ($existing.Count -ne 1) {
    throw 'No se pudo identificar una ruta local unica. Proporciona -RepoPath con una de las dos rutas autorizadas.'
  }
  $RepoPath = $existing[0]
}

$requestedPath = [System.IO.Path]::GetFullPath($RepoPath).TrimEnd('\')
$approved = @($approvedPaths | Where-Object {
  [string]::Equals(
    [System.IO.Path]::GetFullPath($_).TrimEnd('\'),
    $requestedPath,
    [System.StringComparison]::OrdinalIgnoreCase
  )
})
if ($approved.Count -ne 1) {
  throw 'Ruta no autorizada. Solo se permiten T14s\Downloads o poock\Desktop\Publicada.'
}
if (-not (Test-Path -LiteralPath $requestedPath -PathType Container)) {
  throw "La carpeta no existe: $requestedPath"
}

$RepoPath = (Resolve-Path -LiteralPath $requestedPath).Path.TrimEnd('\')
$git = Get-Command git.exe -ErrorAction Stop
$repoRoot = & $git.Source -C $RepoPath rev-parse --show-toplevel 2>$null
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($repoRoot)) {
  throw 'La carpeta no es un repositorio Git. No se sobrescriben carpetas copiadas manualmente.'
}
$repoRoot = [System.IO.Path]::GetFullPath($repoRoot.Trim()).TrimEnd('\')
if (-not [string]::Equals($repoRoot, $RepoPath, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'La ruta debe ser la raiz del repositorio, no una subcarpeta de otro repositorio.'
}

$remote = & $git.Source -C $RepoPath remote get-url origin
if ($LASTEXITCODE -ne 0 -or $remote.Trim() -notmatch '(?i)github\.com[:/]ziSirrush/GestorMantto(?:\.git)?/?$') {
  throw 'El remoto origin no corresponde a ziSirrush/GestorMantto.'
}
$branch = & $git.Source -C $RepoPath branch --show-current
if ($LASTEXITCODE -ne 0 -or $branch.Trim() -ne 'main') {
  throw 'Sincronizacion detenida: la rama local no es main.'
}

$taskName = 'BLT NOW - Sincronizar local - ' + $env:USERNAME
if ($RemoveTask) {
  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($null -ne $task) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Tarea eliminada: $taskName"
  } else {
    Write-Host "No existe la tarea: $taskName"
  }
  return
}

if ($InstallTask) {
  $scriptFile = Join-Path $RepoPath 'tools\sync-local.ps1'
  if (-not (Test-Path -LiteralPath $scriptFile -PathType Leaf)) {
    throw "No se encontro el script dentro del repositorio: $scriptFile"
  }
  $powerShellExe = (Get-Command powershell.exe -ErrorAction Stop).Source
  $arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "{0}" -RepoPath "{1}"' -f $scriptFile, $RepoPath
  $action = New-ScheduledTaskAction -Execute $powerShellExe -Argument $arguments -WorkingDirectory $RepoPath
  $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Minutes 30) -RepetitionDuration (New-TimeSpan -Days 3650)
  $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force -Description 'BLT NOW: descargar commits de main cada 30 minutos sin sobrescribir cambios locales.' | Out-Null
  Write-Host "Tarea registrada: $taskName (cada 30 minutos, con el usuario conectado)."
  return
}

$dirty = @(& $git.Source -C $RepoPath status --porcelain --untracked-files=all)
if ($LASTEXITCODE -ne 0 -or $dirty.Count -gt 0) {
  throw 'Sincronizacion detenida: existen cambios locales o archivos sin seguimiento.'
}
& $git.Source -C $RepoPath fetch --no-tags origin main
if ($LASTEXITCODE -ne 0) {
  throw 'Fallo git fetch; no se modifico la copia local.'
}
& $git.Source -C $RepoPath merge-base --is-ancestor HEAD origin/main
if ($LASTEXITCODE -ne 0) {
  throw 'La copia local es divergente o tiene commits propios. Se necesita revision manual.'
}
$before = (& $git.Source -C $RepoPath rev-parse --short HEAD).Trim()
& $git.Source -C $RepoPath merge --ff-only origin/main
if ($LASTEXITCODE -ne 0) {
  throw 'Fallo la actualizacion fast-forward.'
}
$after = (& $git.Source -C $RepoPath rev-parse --short HEAD).Trim()
Write-Host ("BLT NOW: sincronizacion correcta. {0} -> {1}" -f $before, $after)
