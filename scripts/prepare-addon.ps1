$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$app = Join-Path $repo 'creatoros\app'
New-Item -ItemType Directory -Force -Path $app, (Join-Path $app 'src'), (Join-Path $app 'public') | Out-Null

foreach ($file in @('package.json', 'package-lock.json', 'next.config.ts', 'next-env.d.ts', 'tsconfig.json')) {
    Copy-Item -LiteralPath (Join-Path $repo $file) -Destination (Join-Path $app $file) -Force
}
foreach ($folder in @('src', 'public')) {
    $destination = Join-Path $app $folder
    New-Item -ItemType Directory -Force -Path $destination | Out-Null
    Copy-Item -Path (Join-Path $repo "$folder\*") -Destination $destination -Recurse -Force
}
$scriptsDestination = Join-Path $app 'scripts'
New-Item -ItemType Directory -Force -Path $scriptsDestination | Out-Null
Copy-Item -LiteralPath (Join-Path $repo 'scripts\copy-standalone-assets.mjs') -Destination $scriptsDestination -Force

Write-Host "CreatorOS Add-on-Quellcode aktualisiert: $app"
