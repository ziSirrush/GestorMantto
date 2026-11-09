# BLT NOW - sincronizacion local segura (opt-in).
# No instala tareas ni solicita credenciales. Refusa sobrescribir trabajo local.
param(
  [Parameter(Mandatory = $true)]
  [string]$RepoPath
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $RepoPath -PathType Container)) {
  throw "La carpeta del repositorio no existe: $RepoPath"
}
$RepoPath = (Resolve-Path -LiteralPath $RepoPath).Path
$inside = (& git -C $RepoPath rev-parse --is-inside-work-tree 2>&1)
if ($LASTEXITCODE -ne 0 -or $inside -ne 'true') {
  throw 'La carpeta no es un repositorio Git valido.'
}
$branch = (& git -C $RepoPath branch --show-current)
if ($LASTEXITCODE -ne 0 -or $branch.Trim() -ne 'main') {
  throw 'Sincronizacion detenida: la rama local no es main.'
}
$dirty = @(& git -C $RepoPath status --porcelain)
if ($LASTEXITCODE -ne 0 -or $dirty.Count -gt 0) {
  throw 'Sincronizacion detenida: hay archivos modificados o sin seguimiento.'
}
& git -C $RepoPath fetch --no-tags origin main
if ($LASTEXITCODE -ne 0) { throw 'Fallo git fetch; no se modifico la copia local.' }

& git -C $RepoPath merge-base --is-ancestor HEAD origin/main
if ($LASTEXITCODE -ne 0) {
  throw 'Historial local divergente o con commits no publicados; se requiere revision manual.'
}
$before = (& git -C $RepoPath rev-parse --short HEAD).Trim()
& git -C $RepoPath merge --ff-only origin/main
if ($LASTEXITCODE -ne 0) { throw 'Fallo la actualizacion fast-forward.' }
$after = (& git -C $RepoPath rev-parse --short HEAD).Trim()
Write-Host ("BLT NOW: actualizacion local validada. {0} -> {1}" -f $before, $after)
