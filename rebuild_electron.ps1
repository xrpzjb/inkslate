$ErrorActionPreference = 'Continue'
$env:msbuild_path = $null

# Use @electron/node-gyp with the correct target version
$nodeGyp = Join-Path $PWD "node_modules\@electron\node-gyp\bin\node-gyp.js"

# Target Electron 33.4.11 which uses Node 20.18.3 (API v130)
$result = & node $nodeGyp rebuild `
    --directory node_modules/better-sqlite3 `
    --release `
    --nodedir "$env:PROGRAMFILES\nodejs\node.exe" `
    2>&1

$result | Select-Object -Last 30
$exitCode = $LASTEXITCODE
Write-Host "Exit code: $exitCode"

# Check if the file was built
$targetPath = Join-Path $PWD "node_modules\better-sqlite3\lib\binding\node-v130-win32-x64"
if (Test-Path (Join-Path $targetPath "better_sqlite3.node")) {
    Write-Host "SUCCESS: Found node-v130 binary"
    Get-ChildItem $targetPath | Select-Object Name, Length, LastWriteTime
} else {
    Write-Host "File not found at expected path. Checking alternatives..."
    Get-ChildItem "node_modules\better-sqlite3\lib" -Recurse -ErrorAction SilentlyContinue | Select-Object FullName
}
