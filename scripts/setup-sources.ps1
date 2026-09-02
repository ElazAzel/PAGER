[CmdletBinding()]
param(
    [ValidateSet('prepare', 'install', 'verify', 'check-updates', 'reindex-public-apis')]
    [string]$Command = 'verify',
    [string]$PythonPath = 'C:\Users\elaza\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $PythonPath -PathType Leaf)) {
    throw 'Supply -PythonPath with an installed Python 3.11+ executable; the Windows Store alias may not be a working interpreter.'
}
$sourceSetupScript = Join-Path -Path $PSScriptRoot -ChildPath 'setup-sources.py'
& $PythonPath -B $sourceSetupScript $Command
if ($LASTEXITCODE -ne 0) {
    throw "PAGER source setup failed with exit code $LASTEXITCODE. Existing skills are not overwritten."
}
