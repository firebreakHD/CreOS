$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
npm --prefix $repo run build
if ($LASTEXITCODE -ne 0) { throw 'CreatorOS-Produktionsbuild oder Add-on-Export fehlgeschlagen.' }
