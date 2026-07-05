# Package the React build (dist/) into a store-upload zip with forward-slash paths.
# Run `npm run build` first, then:  powershell -ExecutionPolicy Bypass -File build-zip.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dist = Join-Path $root 'dist'
if (-not (Test-Path (Join-Path $dist 'manifest.json'))) {
  throw "dist/manifest.json not found - run 'npm run build' first"
}
$manifest = Get-Content (Join-Path $dist 'manifest.json') -Raw | ConvertFrom-Json
$version = $manifest.version

$rel = Join-Path $root 'release'
New-Item -ItemType Directory -Force $rel | Out-Null
$zip = Join-Path $rel "umbra-eq-$version.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }

# System.IO.Compression so zip entry names use forward slashes (the Chrome Web Store
# rejects the backslashes Compress-Archive writes on Windows PowerShell).
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open($zip, 'Create')
try {
  Get-ChildItem -Path $dist -Recurse -File |
    Where-Object { $_.FullName -notmatch '\\\.vite\\' } |
    ForEach-Object {
      $entry = ($_.FullName.Substring($dist.Length + 1)) -replace '\\', '/'
      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $_.FullName, $entry, 'Optimal') | Out-Null
    }
} finally {
  $archive.Dispose()
}
Write-Output "built $zip ($((Get-Item $zip).Length) bytes)"
