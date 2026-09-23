param(
    [string]$Repo = (Get-Location).Path
)

$ErrorActionPreference = "Stop"
$FixRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ExpectedMain = "fb587ff35bf14aabec681b5a2a6ec345fedd9f03"

$FullFiles = @(
    @{ Path = "backend/src/modules/cobranza-cor/cobranza-cor.repository.js"; BaseBlob = "17cdaeb143b2bb5b3121ae256e36b2df1c3bceba" },
    @{ Path = "backend/src/modules/cobranza-cor/cobranza-cor.service.js"; BaseBlob = "8b397fb797d3fb91f8e62955fa0fa4720c9646d6" },
    @{ Path = "backend/src/modules/cobranza-cor/cobranza-cor.controller.js"; BaseBlob = "8c75b5cde6fb59158c9caca9e4073504555ed13d" },
    @{ Path = "backend/src/modules/cobranza-cor/cobranza-cor.routes.js"; BaseBlob = "9f729a90707bd8a6707ecb0abc2c6201f3a159ac" },
)

$TransformFiles = @(
    @{ Path = "modules/cobranza-cor/cobranza-cor-estados-cuenta.js"; BaseBlob = "043a24ef62840fe8f9cc083f451019fceb58c82d" },
    @{ Path = "core/module-loader.js"; BaseBlob = "b68954cb81f5cbb2fc5f67513a3e5dcdfb7ba269" },
    @{ Path = "index.html"; BaseBlob = "378628e8ba1caf242abd95b79900bafffd78cba0" },
)

$NewFiles = @(
    "modules/cobranza-cor/cobranza-cor-estados-cuenta-form.js",
    "modules/cobranza-cor/cobranza-cor-estados-cuenta-form.css",
    "tests/cobranza-cor-estados-cuenta-crud-form.test.js"
)

function Decode-B64([string]$Value) {
    return [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Value))
}

function Assert-CleanBaseFile([string]$Relative, [string]$ExpectedBlob) {
    $Current = Join-Path $Repo $Relative
    if (-not (Test-Path $Current)) { throw "Falta archivo base en el repo: $Relative" }
    $Dirty = git -C $Repo status --porcelain -- $Relative
    if ($Dirty) { throw "El archivo tiene cambios locales y no sera modificado: $Relative" }
    $Blob = (git -C $Repo rev-parse "HEAD:$Relative").Trim()
    if ($Blob -ne $ExpectedBlob) {
        throw "El blob base no coincide con main validado: $Relative`nEsperado: $ExpectedBlob`nActual:   $Blob"
    }
}

function Replace-Required([string]$Text, [string]$Old, [string]$New, [string]$Label) {
    $Count = ([regex]::Matches($Text, [regex]::Escape($Old))).Count
    if ($Count -ne 1) { throw "Se esperaba 1 coincidencia para [$Label] y se encontraron $Count." }
    return $Text.Replace($Old, $New)
}

if (-not (Test-Path (Join-Path $Repo ".git"))) { throw "No se encontro un repositorio Git en: $Repo" }

Write-Host "=== FIX COBRANZA COR · ESTADOS DE CUENTA · CREAR + EDITAR V002 ===" -ForegroundColor Cyan
$Head = (git -C $Repo rev-parse HEAD).Trim()
Write-Host "HEAD local: $Head"
Write-Host "Base validada: $ExpectedMain"
if ($Head -ne $ExpectedMain) { throw "BASE DISTINTA. Este FIX fue validado contra main $ExpectedMain. No se modifico el proyecto." }

foreach ($Item in $FullFiles) {
    $Source = Join-Path $FixRoot $Item.Path
    if (-not (Test-Path $Source)) { throw "Falta archivo completo en el FIX: $($Item.Path)" }
    Assert-CleanBaseFile $Item.Path $Item.BaseBlob
}
foreach ($Item in $TransformFiles) { Assert-CleanBaseFile $Item.Path $Item.BaseBlob }
foreach ($Relative in $NewFiles) {
    $Source = Join-Path $FixRoot $Relative
    if (-not (Test-Path $Source)) { throw "Falta archivo nuevo en el FIX: $Relative" }
    $Destination = Join-Path $Repo $Relative
    if (Test-Path $Destination) { throw "El archivo nuevo ya existe en el repo y no sera sobrescrito: $Relative" }
}

# Validacion de sintaxis del contenido entregado antes de escribir.
foreach ($Item in $FullFiles) {
    $Source = Join-Path $FixRoot $Item.Path
    if ($Source.ToLower().EndsWith(".js")) { node --check $Source; if ($LASTEXITCODE -ne 0) { throw "Fallo node --check en el FIX: $($Item.Path)" } }
}
foreach ($Relative in $NewFiles) {
    $Source = Join-Path $FixRoot $Relative
    if ($Source.ToLower().EndsWith(".js")) { node --check $Source; if ($LASTEXITCODE -ne 0) { throw "Fallo node --check en el FIX: $Relative" } }
}

# Precheck de todas las transformaciones sobre los bytes actuales.
$TransformOperations = @(
    @{
        Path = "modules/cobranza-cor/cobranza-cor-estados-cuenta.js"
        Label = "Registrar recursos del formulario Crear/Editar"
        BeforeB64 = "ICBjb25zdCBST1VURSA9ICdjb2JyYW56YS1lc3RhZG9zLWN1ZW50YSc7CiAgY29uc3QgTElTVF9QQVRIID0gJy9hcGkvY29icmFuemEtY29yL2VzdGFkb3MtY3VlbnRhJzsKICBjb25zdCBTRUFSQ0hfREVMQVlfTVMgPSAzNTA7"
        AfterB64 = "ICBjb25zdCBST1VURSA9ICdjb2JyYW56YS1lc3RhZG9zLWN1ZW50YSc7CiAgY29uc3QgTElTVF9QQVRIID0gJy9hcGkvY29icmFuemEtY29yL2VzdGFkb3MtY3VlbnRhJzsKICBjb25zdCBGT1JNX1NDUklQVCA9ICcuL21vZHVsZXMvY29icmFuemEtY29yL2NvYnJhbnphLWNvci1lc3RhZG9zLWN1ZW50YS1mb3JtLmpzP3Y9MjAyNjA5MjMtZXN0YWRvcy1jcnVkLXYwMDInOwogIGNvbnN0IEZPUk1fU1RZTEUgPSAnLi9tb2R1bGVzL2NvYnJhbnphLWNvci9jb2JyYW56YS1jb3ItZXN0YWRvcy1jdWVudGEtZm9ybS5jc3M/dj0yMDI2MDkyMy1lc3RhZG9zLWNydWQtdjAwMic7CiAgY29uc3QgU0VBUkNIX0RFTEFZX01TID0gMzUwOwogIGxldCBmb3JtTW9kdWxlUHJvbWlzZV9jb3IgPSBudWxsOw=="
    },
    @{
        Path = "modules/cobranza-cor/cobranza-cor-estados-cuenta.js"
        Label = "Cargar formulario de Estado de Cuenta bajo demanda"
        BeforeB64 = "ICBmdW5jdGlvbiBhcGlHZXRfY29yKHBhdGgsb3B0aW9ucyl7CiAgICBpZighd2luZG93Lk1hbnR0b0h0dHAgfHwgdHlwZW9mIHdpbmRvdy5NYW50dG9IdHRwLmdldCAhPT0gJ2Z1bmN0aW9uJyl7CiAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ0NsaWVudGUgSFRUUCBjZW50cmFsIG5vIGRpc3BvbmlibGUuJykpOwogICAgfQogICAgcmV0dXJuIHdpbmRvdy5NYW50dG9IdHRwLmdldChwYXRoLG9wdGlvbnMgfHwge30pOwogIH0KCiAgZnVuY3Rpb24gZW5zdXJlU3R5bGVzX2Nvcigpew=="
        AfterB64 = "ICBmdW5jdGlvbiBhcGlHZXRfY29yKHBhdGgsb3B0aW9ucyl7CiAgICBpZighd2luZG93Lk1hbnR0b0h0dHAgfHwgdHlwZW9mIHdpbmRvdy5NYW50dG9IdHRwLmdldCAhPT0gJ2Z1bmN0aW9uJyl7CiAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ0NsaWVudGUgSFRUUCBjZW50cmFsIG5vIGRpc3BvbmlibGUuJykpOwogICAgfQogICAgcmV0dXJuIHdpbmRvdy5NYW50dG9IdHRwLmdldChwYXRoLG9wdGlvbnMgfHwge30pOwogIH0KCiAgZnVuY3Rpb24gZW5zdXJlRm9ybU1vZHVsZV9jb3IoKXsKICAgIGlmKHdpbmRvdy5NYW50dG9Db2JyYW56YUNvckVzdGFkb0N1ZW50YUZvcm0pIHJldHVybiBQcm9taXNlLnJlc29sdmUod2luZG93Lk1hbnR0b0NvYnJhbnphQ29yRXN0YWRvQ3VlbnRhRm9ybSk7CiAgICBpZihmb3JtTW9kdWxlUHJvbWlzZV9jb3IpIHJldHVybiBmb3JtTW9kdWxlUHJvbWlzZV9jb3I7CgogICAgaWYoIWRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ2xpbmtbZGF0YS1jY29yLWVjLWZvcm0tc3R5bGU9IjEiXScpKXsKICAgICAgY29uc3QgbGluaz1kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdsaW5rJyk7CiAgICAgIGxpbmsucmVsPSdzdHlsZXNoZWV0JzsKICAgICAgbGluay5ocmVmPUZPUk1fU1RZTEU7CiAgICAgIGxpbmsuZGF0YXNldC5jY29yRWNGb3JtU3R5bGU9JzEnOwogICAgICBkb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKGxpbmspOwogICAgfQoKICAgIGZvcm1Nb2R1bGVQcm9taXNlX2Nvcj1uZXcgUHJvbWlzZSgocmVzb2x2ZSxyZWplY3QpPT57CiAgICAgIGNvbnN0IGV4aXN0aW5nPWRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoJ3NjcmlwdFtkYXRhLWNjb3ItZWMtZm9ybS1zY3JpcHQ9IjEiXScpOwogICAgICBpZihleGlzdGluZyl7CiAgICAgICAgaWYod2luZG93Lk1hbnR0b0NvYnJhbnphQ29yRXN0YWRvQ3VlbnRhRm9ybSl7cmVzb2x2ZSh3aW5kb3cuTWFudHRvQ29icmFuemFDb3JFc3RhZG9DdWVudGFGb3JtKTtyZXR1cm47fQogICAgICAgIGV4aXN0aW5nLmFkZEV2ZW50TGlzdGVuZXIoJ2xvYWQnLCgpPT5yZXNvbHZlKHdpbmRvdy5NYW50dG9Db2JyYW56YUNvckVzdGFkb0N1ZW50YUZvcm18fG51bGwpLHtvbmNlOnRydWV9KTsKICAgICAgICBleGlzdGluZy5hZGRFdmVudExpc3RlbmVyKCdlcnJvcicscmVqZWN0LHtvbmNlOnRydWV9KTsKICAgICAgICByZXR1cm47CiAgICAgIH0KICAgICAgY29uc3Qgc2NyaXB0PWRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NjcmlwdCcpOwogICAgICBzY3JpcHQuc3JjPUZPUk1fU0NSSVBUOwogICAgICBzY3JpcHQuYXN5bmM9ZmFsc2U7CiAgICAgIHNjcmlwdC5kYXRhc2V0LmNjb3JFY0Zvcm1TY3JpcHQ9JzEnOwogICAgICBzY3JpcHQuYWRkRXZlbnRMaXN0ZW5lcignbG9hZCcsKCk9PnJlc29sdmUod2luZG93Lk1hbnR0b0NvYnJhbnphQ29yRXN0YWRvQ3VlbnRhRm9ybXx8bnVsbCkse29uY2U6dHJ1ZX0pOwogICAgICBzY3JpcHQuYWRkRXZlbnRMaXN0ZW5lcignZXJyb3InLHJlamVjdCx7b25jZTp0cnVlfSk7CiAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoc2NyaXB0KTsKICAgIH0pLmNhdGNoKGVycm9yPT57Zm9ybU1vZHVsZVByb21pc2VfY29yPW51bGw7dGhyb3cgZXJyb3I7fSk7CiAgICByZXR1cm4gZm9ybU1vZHVsZVByb21pc2VfY29yOwogIH0KCiAgYXN5bmMgZnVuY3Rpb24gbG9hZEZvcm1Nb2RlX2Nvcihtb2RlLHBwbnMpewogICAgdHJ5ewogICAgICBjb25zdCBtb2R1bGU9YXdhaXQgZW5zdXJlRm9ybU1vZHVsZV9jb3IoKTsKICAgICAgaWYoIWlzQWN0aXZlX2NvcigpKSByZXR1cm4gZmFsc2U7CiAgICAgIGlmKCFtb2R1bGV8fHR5cGVvZiBtb2R1bGUuaW5pdCE9PSdmdW5jdGlvbicpIHRocm93IG5ldyBFcnJvcignRm9ybXVsYXJpbyBkZSBFc3RhZG8gZGUgQ3VlbnRhIG5vIGRpc3BvbmlibGUuJyk7CiAgICAgIHJldHVybiBtb2R1bGUuaW5pdCh7bW9kZSxwcG5zfSk7CiAgICB9Y2F0Y2goZXJyb3IpewogICAgICByZW5kZXJEZXRhaWxFcnJvcl9jb3IodGV4dF9jb3IoZXJyb3ImJmVycm9yLm1lc3NhZ2UsJ05vIGZ1ZSBwb3NpYmxlIGNhcmdhciBlbCBmb3JtdWxhcmlvLicpKTsKICAgICAgcmV0dXJuIGZhbHNlOwogICAgfQogIH0KCiAgZnVuY3Rpb24gZW5zdXJlU3R5bGVzX2Nvcigpew=="
    },
    @{
        Path = "modules/cobranza-cor/cobranza-cor-estados-cuenta.js"
        Label = "Agregar botón Crear nuevo al Main"
        BeforeB64 = "ICAgICAgICAgIDxkaXYgY2xhc3M9ImNjb3ItZWMtaGVyby1hY3Rpb25zIj4KICAgICAgICAgICAgPHNwYW4gaWQ9ImNjb3ItZWMtdXBkYXRlZCI+U2luIGFjdHVhbGl6YXI8L3NwYW4+CiAgICAgICAgICAgIDxidXR0b24gaWQ9ImNjb3ItZWMtcmVmcmVzaCIgY2xhc3M9ImNjb3ItZWMtYnRuIGNjb3ItZWMtYnRuLXByaW1hcnkiIHR5cGU9ImJ1dHRvbiI+QWN0dWFsaXphcjwvYnV0dG9uPgogICAgICAgICAgPC9kaXY+"
        AfterB64 = "ICAgICAgICAgIDxkaXYgY2xhc3M9ImNjb3ItZWMtaGVyby1hY3Rpb25zIj4KICAgICAgICAgICAgPHNwYW4gaWQ9ImNjb3ItZWMtdXBkYXRlZCI+U2luIGFjdHVhbGl6YXI8L3NwYW4+CiAgICAgICAgICAgIDxidXR0b24gaWQ9ImNjb3ItZWMtY3JlYXRlLW5ldyIgY2xhc3M9ImNjb3ItZWMtYnRuIGNjb3ItZWMtYnRuLXByaW1hcnkiIHR5cGU9ImJ1dHRvbiI+KyBDcmVhciBudWV2bzwvYnV0dG9uPgogICAgICAgICAgICA8YnV0dG9uIGlkPSJjY29yLWVjLXJlZnJlc2giIGNsYXNzPSJjY29yLWVjLWJ0biBjY29yLWVjLWJ0bi1wcmltYXJ5IiB0eXBlPSJidXR0b24iPkFjdHVhbGl6YXI8L2J1dHRvbj4KICAgICAgICAgIDwvZGl2Pg=="
    },
    @{
        Path = "modules/cobranza-cor/cobranza-cor-estados-cuenta.js"
        Label = "Agregar botón Editar al detalle"
        BeforeB64 = "ICAgICAgICAgIDxzcGFuCiAgICAgICAgICAgIGNsYXNzPSJjY29yLWVjLWJhZGdlICR7c3RhdHVzQ2xhc3NfY29yKHByb2plY3QuY29udHJhY3R1YWwpfSIKICAgICAgICAgID4KICAgICAgICAgICAgJHtlc2NhcGVIdG1sX2NvcigKICAgICAgICAgICAgICB0ZXh0X2Nvcihwcm9qZWN0LmNvbnRyYWN0dWFsKQogICAgICAgICAgICApfQogICAgICAgICAgPC9zcGFuPg=="
        AfterB64 = "ICAgICAgICAgIDxkaXYgY2xhc3M9ImNjb3ItZWMtaGVyby1hY3Rpb25zIj4KICAgICAgICAgICAgPGJ1dHRvbiBpZD0iY2Nvci1lYy1lZGl0IiBjbGFzcz0iY2Nvci1lYy1idG4gY2Nvci1lYy1idG4tcHJpbWFyeSIgdHlwZT0iYnV0dG9uIj5FZGl0YXI8L2J1dHRvbj4KICAgICAgICAgICAgPHNwYW4KICAgICAgICAgICAgICBjbGFzcz0iY2Nvci1lYy1iYWRnZSAke3N0YXR1c0NsYXNzX2Nvcihwcm9qZWN0LmNvbnRyYWN0dWFsKX0iCiAgICAgICAgICAgID4KICAgICAgICAgICAgICAke2VzY2FwZUh0bWxfY29yKAogICAgICAgICAgICAgICAgdGV4dF9jb3IocHJvamVjdC5jb250cmFjdHVhbCkKICAgICAgICAgICAgICApfQogICAgICAgICAgICA8L3NwYW4+CiAgICAgICAgICA8L2Rpdj4="
    },
    @{
        Path = "modules/cobranza-cor/cobranza-cor-estados-cuenta.js"
        Label = "Agregar navegación interna Crear/Editar"
        BeforeB64 = "ICBmdW5jdGlvbiBvcGVuRGV0YWlsUm91dGVfY29yKHBwbnMpewogICAgY29uc3Qgbm9ybWFsaXplZCA9IFN0cmluZyhwcG5zIHx8ICcnKS50cmltKCk7CiAgICBpZighbm9ybWFsaXplZCkgcmV0dXJuOwogICAgaWYod2luZG93Lk1hbnR0b1JvdXRlciAmJiB0eXBlb2Ygd2luZG93Lk1hbnR0b1JvdXRlci5nbyA9PT0gJ2Z1bmN0aW9uJyl7CiAgICAgIHdpbmRvdy5NYW50dG9Sb3V0ZXIuZ28oUk9VVEUse3BwbnM6bm9ybWFsaXplZH0se25hdmlnYXRpb25UeXBlOidvcGVuJ30pOwogICAgICByZXR1cm47CiAgICB9CiAgICBsb2FkRGV0YWlsX2Nvcihub3JtYWxpemVkLHtmb3JjZTp0cnVlfSk7CiAgfQoKICBmdW5jdGlvbiBhcHBseUZpbHRlckFuZFJlbG9hZF9jb3IoKXsgc3RhdGUudmlldz0nbGlzdCc7IGxvYWRMaXN0X2Nvcih7Zm9yY2U6dHJ1ZX0pOyB9"
        AfterB64 = "ICBmdW5jdGlvbiBvcGVuRGV0YWlsUm91dGVfY29yKHBwbnMpewogICAgY29uc3Qgbm9ybWFsaXplZCA9IFN0cmluZyhwcG5zIHx8ICcnKS50cmltKCk7CiAgICBpZighbm9ybWFsaXplZCkgcmV0dXJuOwogICAgaWYod2luZG93Lk1hbnR0b1JvdXRlciAmJiB0eXBlb2Ygd2luZG93Lk1hbnR0b1JvdXRlci5nbyA9PT0gJ2Z1bmN0aW9uJyl7CiAgICAgIHdpbmRvdy5NYW50dG9Sb3V0ZXIuZ28oUk9VVEUse3BwbnM6bm9ybWFsaXplZH0se25hdmlnYXRpb25UeXBlOidvcGVuJ30pOwogICAgICByZXR1cm47CiAgICB9CiAgICBsb2FkRGV0YWlsX2Nvcihub3JtYWxpemVkLHtmb3JjZTp0cnVlfSk7CiAgfQoKICBmdW5jdGlvbiBvcGVuQ3JlYXRlUm91dGVfY29yKCl7CiAgICBpZih3aW5kb3cuTWFudHRvUm91dGVyJiZ0eXBlb2Ygd2luZG93Lk1hbnR0b1JvdXRlci5nbz09PSdmdW5jdGlvbicpewogICAgICB3aW5kb3cuTWFudHRvUm91dGVyLmdvKFJPVVRFLHttb2RlOidjcmVhdGUnfSx7bmF2aWdhdGlvblR5cGU6J29wZW4nfSk7CiAgICAgIHJldHVybjsKICAgIH0KICAgIGxvYWRGb3JtTW9kZV9jb3IoJ2NyZWF0ZScsJycpOwogIH0KCiAgZnVuY3Rpb24gb3BlbkVkaXRSb3V0ZV9jb3IocHBucyl7CiAgICBjb25zdCBub3JtYWxpemVkPVN0cmluZyhwcG5zfHwnJykudHJpbSgpOwogICAgaWYoIW5vcm1hbGl6ZWQpIHJldHVybjsKICAgIGlmKHdpbmRvdy5NYW50dG9Sb3V0ZXImJnR5cGVvZiB3aW5kb3cuTWFudHRvUm91dGVyLmdvPT09J2Z1bmN0aW9uJyl7CiAgICAgIHdpbmRvdy5NYW50dG9Sb3V0ZXIuZ28oUk9VVEUse21vZGU6J2VkaXQnLHBwbnM6bm9ybWFsaXplZH0se25hdmlnYXRpb25UeXBlOidvcGVuJ30pOwogICAgICByZXR1cm47CiAgICB9CiAgICBsb2FkRm9ybU1vZGVfY29yKCdlZGl0Jyxub3JtYWxpemVkKTsKICB9CgogIGZ1bmN0aW9uIGFwcGx5RmlsdGVyQW5kUmVsb2FkX2NvcigpeyBzdGF0ZS52aWV3PSdsaXN0JzsgbG9hZExpc3RfY29yKHtmb3JjZTp0cnVlfSk7IH0="
    },
    @{
        Path = "modules/cobranza-cor/cobranza-cor-estados-cuenta.js"
        Label = "Conectar botones Crear nuevo y Editar"
        BeforeB64 = "ICAgIHJvb3QuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLGV2ZW50PT57CiAgICAgIGlmKGV2ZW50LnRhcmdldC5jbG9zZXN0KCcjY2Nvci1lYy1yZWZyZXNoJykpeyBsb2FkTGlzdF9jb3Ioe2ZvcmNlOnRydWV9KTsgcmV0dXJuOyB9CiAgICAgIGNvbnN0IHJvdz1ldmVudC50YXJnZXQuY2xvc2VzdCgnW2RhdGEtcHBuc10nKTs="
        AfterB64 = "ICAgIHJvb3QuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLGV2ZW50PT57CiAgICAgIGlmKGV2ZW50LnRhcmdldC5jbG9zZXN0KCcjY2Nvci1lYy1jcmVhdGUtbmV3JykpeyBvcGVuQ3JlYXRlUm91dGVfY29yKCk7IHJldHVybjsgfQogICAgICBpZihldmVudC50YXJnZXQuY2xvc2VzdCgnI2Njb3ItZWMtZWRpdCcpKXsgb3BlbkVkaXRSb3V0ZV9jb3Ioc3RhdGUuc2VsZWN0ZWRQcG5zIHx8IChzdGF0ZS5kZXRhaWwgJiYgc3RhdGUuZGV0YWlsLnByb3llY3RvICYmIHN0YXRlLmRldGFpbC5wcm95ZWN0by5wcG5zKSk7IHJldHVybjsgfQogICAgICBpZihldmVudC50YXJnZXQuY2xvc2VzdCgnI2Njb3ItZWMtcmVmcmVzaCcpKXsgbG9hZExpc3RfY29yKHtmb3JjZTp0cnVlfSk7IHJldHVybjsgfQogICAgICBjb25zdCByb3c9ZXZlbnQudGFyZ2V0LmNsb3Nlc3QoJ1tkYXRhLXBwbnNdJyk7"
    },
    @{
        Path = "modules/cobranza-cor/cobranza-cor-estados-cuenta.js"
        Label = "Activar formulario interno desde payload de Estados de Cuenta"
        BeforeB64 = "ICBhc3luYyBmdW5jdGlvbiBpbml0X2NvcigpewogICAgaWYoIWlzQWN0aXZlX2NvcigpKSByZXR1cm4gZmFsc2U7CiAgICBjb25zdCByb290PWRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd2aWV3LXBsYWNlaG9sZGVyJyk7CiAgICBpZighcm9vdCkgcmV0dXJuIGZhbHNlOwogICAgc3RhdGUucm9vdD1yb290OwogICAgZW5zdXJlU3R5bGVzX2NvcigpOwogICAgYmluZEV2ZW50c19jb3IoKTsKICAgIGNvbnN0IHBheWxvYWQ9Y3VycmVudFBheWxvYWRfY29yKCk7CiAgICBjb25zdCByZXF1ZXN0ZWRQcG5zPVN0cmluZyhwYXlsb2FkICYmIHBheWxvYWQucHBucyB8fCAnJykudHJpbSgpOwogICAgaWYocmVxdWVzdGVkUHBucyl7CiAgICAgIHN0YXRlLnZpZXc9J2RldGFpbCc7CiAgICAgIGF3YWl0IGxvYWREZXRhaWxfY29yKHJlcXVlc3RlZFBwbnMse2ZvcmNlOnRydWV9KTsKICAgICAgcmV0dXJuIHRydWU7CiAgICB9CiAgICBzdGF0ZS52aWV3PSdsaXN0JzsKICAgIHJlbmRlckxpc3RTaGVsbF9jb3IoKTsKICAgIHJlbmRlckxpc3RfY29yKCk7CiAgICBhd2FpdCBsb2FkTGlzdF9jb3Ioe2ZvcmNlOnRydWV9KTsKICAgIHJldHVybiB0cnVlOwogIH0KCiAgZnVuY3Rpb24gcmVmcmVzaF9jb3IoKXsKICAgIGlmKCFpc0FjdGl2ZV9jb3IoKSkgcmV0dXJuIFByb21pc2UucmVzb2x2ZShmYWxzZSk7CiAgICBjb25zdCBwYXlsb2FkPWN1cnJlbnRQYXlsb2FkX2NvcigpOwogICAgY29uc3QgcmVxdWVzdGVkUHBucz1TdHJpbmcocGF5bG9hZCAmJiBwYXlsb2FkLnBwbnMgfHwgJycpLnRyaW0oKTsKICAgIHJldHVybiByZXF1ZXN0ZWRQcG5zID8gbG9hZERldGFpbF9jb3IocmVxdWVzdGVkUHBucyx7Zm9yY2U6dHJ1ZX0pIDogbG9hZExpc3RfY29yKHtmb3JjZTp0cnVlfSk7CiAgfQ=="
        AfterB64 = "ICBhc3luYyBmdW5jdGlvbiBpbml0X2NvcigpewogICAgaWYoIWlzQWN0aXZlX2NvcigpKSByZXR1cm4gZmFsc2U7CiAgICBjb25zdCByb290PWRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd2aWV3LXBsYWNlaG9sZGVyJyk7CiAgICBpZighcm9vdCkgcmV0dXJuIGZhbHNlOwogICAgc3RhdGUucm9vdD1yb290OwogICAgZW5zdXJlU3R5bGVzX2NvcigpOwogICAgYmluZEV2ZW50c19jb3IoKTsKICAgIGNvbnN0IHBheWxvYWQ9Y3VycmVudFBheWxvYWRfY29yKCl8fHt9OwogICAgY29uc3QgbW9kZT1TdHJpbmcocGF5bG9hZC5tb2RlfHwnJykudHJpbSgpLnRvTG93ZXJDYXNlKCk7CiAgICBjb25zdCByZXF1ZXN0ZWRQcG5zPVN0cmluZyhwYXlsb2FkLnBwbnN8fCcnKS50cmltKCk7CiAgICBpZihtb2RlPT09J2NyZWF0ZSd8fG1vZGU9PT0nZWRpdCcpewogICAgICBzdGF0ZS52aWV3PSdmb3JtJzsKICAgICAgYXdhaXQgbG9hZEZvcm1Nb2RlX2Nvcihtb2RlLHJlcXVlc3RlZFBwbnMpOwogICAgICByZXR1cm4gdHJ1ZTsKICAgIH0KICAgIGlmKHJlcXVlc3RlZFBwbnMpewogICAgICBzdGF0ZS52aWV3PSdkZXRhaWwnOwogICAgICBhd2FpdCBsb2FkRGV0YWlsX2NvcihyZXF1ZXN0ZWRQcG5zLHtmb3JjZTp0cnVlfSk7CiAgICAgIHJldHVybiB0cnVlOwogICAgfQogICAgc3RhdGUudmlldz0nbGlzdCc7CiAgICByZW5kZXJMaXN0U2hlbGxfY29yKCk7CiAgICByZW5kZXJMaXN0X2NvcigpOwogICAgYXdhaXQgbG9hZExpc3RfY29yKHtmb3JjZTp0cnVlfSk7CiAgICByZXR1cm4gdHJ1ZTsKICB9CgogIGZ1bmN0aW9uIHJlZnJlc2hfY29yKCl7CiAgICBpZighaXNBY3RpdmVfY29yKCkpIHJldHVybiBQcm9taXNlLnJlc29sdmUoZmFsc2UpOwogICAgY29uc3QgcGF5bG9hZD1jdXJyZW50UGF5bG9hZF9jb3IoKXx8e307CiAgICBjb25zdCBtb2RlPVN0cmluZyhwYXlsb2FkLm1vZGV8fCcnKS50cmltKCkudG9Mb3dlckNhc2UoKTsKICAgIGNvbnN0IHJlcXVlc3RlZFBwbnM9U3RyaW5nKHBheWxvYWQucHBuc3x8JycpLnRyaW0oKTsKICAgIGlmKG1vZGU9PT0nY3JlYXRlJ3x8bW9kZT09PSdlZGl0JykgcmV0dXJuIGxvYWRGb3JtTW9kZV9jb3IobW9kZSxyZXF1ZXN0ZWRQcG5zKTsKICAgIHJldHVybiByZXF1ZXN0ZWRQcG5zID8gbG9hZERldGFpbF9jb3IocmVxdWVzdGVkUHBucyx7Zm9yY2U6dHJ1ZX0pIDogbG9hZExpc3RfY29yKHtmb3JjZTp0cnVlfSk7CiAgfQ=="
    },
    @{
        Path = "core/module-loader.js"
        Label = "Actualizar cache-bust de Estados de Cuenta"
        BeforeB64 = "ICAgICdjb2JyYW56YS1lc3RhZG9zLWN1ZW50YSc6e2NzczpbJy4vbW9kdWxlcy9jb2JyYW56YS1jb3IvY29icmFuemEtY29yLWVzdGFkb3MtY3VlbnRhLmNzcz92PTIwMjYwOTEyLWNvYnJhbnphLWNvci1lc3RhZG9zLXYwMDEnXSxqczpbJy4vbW9kdWxlcy9jb2JyYW56YS1jb3IvY29icmFuemEtY29yLWVzdGFkb3MtY3VlbnRhLmpzP3Y9MjAyNjA5MTQtaG9yYXJpb3MtZjItdjAwMSddfSw="
        AfterB64 = "ICAgICdjb2JyYW56YS1lc3RhZG9zLWN1ZW50YSc6e2NzczpbJy4vbW9kdWxlcy9jb2JyYW56YS1jb3IvY29icmFuemEtY29yLWVzdGFkb3MtY3VlbnRhLmNzcz92PTIwMjYwOTEyLWNvYnJhbnphLWNvci1lc3RhZG9zLXYwMDEnXSxqczpbJy4vbW9kdWxlcy9jb2JyYW56YS1jb3IvY29icmFuemEtY29yLWVzdGFkb3MtY3VlbnRhLmpzP3Y9MjAyNjA5MjMtZXN0YWRvcy1jcnVkLXYwMDInXX0s"
    },
    @{
        Path = "index.html"
        Label = "Actualizar cache-bust del Module Loader"
        BeforeB64 = "PHNjcmlwdCBzcmM9Ii4vY29yZS9tb2R1bGUtbG9hZGVyLmpzP3Y9MjAyNjA5MjEtcHJveWVjdG9zLWxheW91dC1tZXRyaWNhcy12MDA3Ij48L3NjcmlwdD4="
        AfterB64 = "PHNjcmlwdCBzcmM9Ii4vY29yZS9tb2R1bGUtbG9hZGVyLmpzP3Y9MjAyNjA5MjMtY29icmFuemEtY29yLWVzdGFkb3MtY3J1ZC12MDAyIj48L3NjcmlwdD4="
    },
)

$Prepared = @{}
foreach ($Op in $TransformOperations) {
    $Path = Join-Path $Repo $Op.Path
    $Raw = [System.IO.File]::ReadAllText($Path)
    $HadCrLf = $Raw.Contains("`r`n")
    $Text = $Raw.Replace("`r`n", "`n")
    $Old = (Decode-B64 $Op.BeforeB64).Replace("`r`n", "`n")
    $New = (Decode-B64 $Op.AfterB64).Replace("`r`n", "`n")
    if (-not $Prepared.ContainsKey($Op.Path)) { $Prepared[$Op.Path] = @{ Text = $Text; HadCrLf = $HadCrLf } }
    $Current = [string]$Prepared[$Op.Path].Text
    $Prepared[$Op.Path].Text = Replace-Required $Current $Old $New $Op.Label
}

$TouchedExisting = @($FullFiles | ForEach-Object { $_.Path }) + @($TransformFiles | ForEach-Object { $_.Path })
$TouchedAll = $TouchedExisting + $NewFiles
$Applied = $false
try {
    # A partir de este punto cualquier error debe restaurar lo tocado.
    $Applied = $true
    foreach ($Item in $FullFiles) {
        $Source = Join-Path $FixRoot $Item.Path
        $Destination = Join-Path $Repo $Item.Path
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Destination) | Out-Null
        Copy-Item $Source $Destination -Force
        Write-Host "COPIADO: $($Item.Path)" -ForegroundColor Green
    }
    foreach ($Relative in $NewFiles) {
        $Source = Join-Path $FixRoot $Relative
        $Destination = Join-Path $Repo $Relative
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Destination) | Out-Null
        Copy-Item $Source $Destination -Force
        Write-Host "NUEVO: $Relative" -ForegroundColor Green
    }
    $Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    foreach ($Item in $TransformFiles) {
        $Relative = $Item.Path
        $Destination = Join-Path $Repo $Relative
        $Text = [string]$Prepared[$Relative].Text
        if ($Prepared[$Relative].HadCrLf) { $Text = $Text.Replace("`n", "`r`n") }
        [System.IO.File]::WriteAllText($Destination, $Text, $Utf8NoBom)
        Write-Host "TRANSFORMADO: $Relative" -ForegroundColor Green
    }

    foreach ($Relative in $TouchedAll) {
        $Target = Join-Path $Repo $Relative
        if ($Target.ToLower().EndsWith(".js")) { node --check $Target; if ($LASTEXITCODE -ne 0) { throw "Fallo node --check: $Relative" } }
    }

    node (Join-Path $Repo "tests/cobranza-cor-estados-cuenta-crud-form.test.js")
    if ($LASTEXITCODE -ne 0) { throw "Fallo el test especifico de Cobranza COR Crear/Editar." }

    & git -C $Repo diff --check -- $TouchedAll
    if ($LASTEXITCODE -ne 0) { throw "git diff --check detecto errores." }

    $Forbidden = & git -C $Repo grep -n -E "cobranza_indice_cor|id_indice_cor|idIndiceCor" -- "backend/src/modules/cobranza-cor" "modules/cobranza-cor" 2>$null
    if ($LASTEXITCODE -eq 0 -and $Forbidden) { Write-Host $Forbidden -ForegroundColor Red; throw "Se detectaron referencias runtime a INDICE en Cobranza COR." }
    if ($LASTEXITCODE -gt 1) { throw "git grep fallo durante la auditoria de INDICE." }

    Write-Host ""
    Write-Host "=== FIX APLICADO Y VALIDADO LOCALMENTE ===" -ForegroundColor Green
    Write-Host "Aiven NO fue modificado por este script." -ForegroundColor Yellow
    Write-Host "GitHub/Azure/Netlify NO fueron modificados." -ForegroundColor Yellow
    Write-Host ""
    & git -C $Repo status --short -- $TouchedAll
} catch {
    if ($Applied) {
        Write-Host "Validacion fallida. Revirtiendo archivos del FIX..." -ForegroundColor Yellow
        & git -C $Repo restore --source=HEAD -- $TouchedExisting 2>$null
        foreach ($Relative in $NewFiles) { $Target = Join-Path $Repo $Relative; if (Test-Path $Target) { Remove-Item $Target -Force } }
    }
    throw
}
