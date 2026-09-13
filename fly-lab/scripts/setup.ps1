param([string]$Python = "python")
$ErrorActionPreference = "Stop"
$LabPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location -LiteralPath $LabPath
if (!(Test-Path -LiteralPath ".venv/Scripts/python.exe")) {
    & $Python -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw "Python 3.12 is required; pass -Python with its executable path." }
}
& .venv/Scripts/python.exe -m pip install -r requirements.lock.txt
if ($LASTEXITCODE -ne 0) { throw "Python dependency installation failed." }
$env:NODE_OPTIONS = "--use-system-ca"
& npm.cmd ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw "Node dependency installation failed." }
& node node_modules/playwright/cli.js install chromium
if ($LASTEXITCODE -ne 0) { throw "Pinned browser installation failed." }
Write-Output "Ready. Run npm run dev from fly-lab. Dataset preparation is a separate explicit command in README.md."
