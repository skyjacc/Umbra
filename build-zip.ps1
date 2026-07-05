# Build the Chrome Web Store upload zip: runtime files only, forward-slash paths.
# Usage:  powershell -ExecutionPolicy Bypass -File build-zip.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$manifest = Get-Content (Join-Path $root 'manifest.json') -Raw | ConvertFrom-Json
$version = $manifest.version

$files = @(
  'manifest.json',
  'background.js',
  'offscreen.html',
  'offscreen.js',
  'popup.html',
  'popup.css',
  'popup.js',
  'onboarding.html',
  'onboarding.js',
  'snap.svg-min.js',
  'icon16.png',
  'icon32.png',
  'icon48.png',
  'icon128.png',
  'fonts/InterVariable.ttf',
  'fonts/GeistMono-Regular.ttf',
  'fonts/OFL-Inter.txt',
  'fonts/OFL-GeistMono.txt'
)

$dist = Join-Path $root 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null
$zip = Join-Path $dist "umbra-eq-$version.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }

# Use System.IO.Compression so zip entry names use forward slashes (Compress-Archive
# writes backslashes on Windows PowerShell 5.1, which the Chrome Web Store rejects).
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open($zip, 'Create')
try {
  foreach ($f in $files) {
    $src = Join-Path $root $f
    if (-not (Test-Path $src)) { throw "missing runtime file: $f" }
    $entryName = ($f -replace '\\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $archive, $src, $entryName, 'Optimal') | Out-Null
  }
} finally {
  $archive.Dispose()
}
Write-Output "built $zip ($((Get-Item $zip).Length) bytes)"
