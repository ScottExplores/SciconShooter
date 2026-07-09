$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$tmpDir = Join-Path $root "tmp"
$tailwindExe = Join-Path $tmpDir "tailwindcss-windows-x64.exe"
$tailwindVersion = "v3.4.17"

New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null

if (!(Test-Path $tailwindExe)) {
  $downloadUrl = "https://github.com/tailwindlabs/tailwindcss/releases/download/$tailwindVersion/tailwindcss-windows-x64.exe"
  Invoke-WebRequest -Uri $downloadUrl -OutFile $tailwindExe -UseBasicParsing
}

& $tailwindExe `
  -c (Join-Path $root "tailwind.config.cjs") `
  -i (Join-Path $root "styles\tailwind.input.css") `
  -o (Join-Path $root "styles\tailwind.generated.css") `
  --minify
