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
foreach ($required in @('LICENSE', 'THIRD-PARTY-NOTICES.txt', 'fonts/OFL-Inter.txt', 'fonts/OFL-GeistMono.txt')) {
  if (-not (Test-Path -LiteralPath (Join-Path $dist $required))) {
    throw "Missing release license: $required - run 'npm run build' first"
  }
}
$debugFiles = Get-ChildItem -LiteralPath $dist -Recurse -File |
  Where-Object { $_.Extension -in @('.js', '.html') } |
  Select-String -Pattern 'UMBRA_DEBUG', 'recorder: umbra' -List
if ($debugFiles) {
  throw "Temporary debug recorder is present in dist: $($debugFiles.Path -join ', ')"
}
$developmentFiles = Get-ChildItem -LiteralPath $dist -Recurse -File |
  Where-Object { $_.Extension -in @('.js', '.html', '.json') } |
  Select-String -Pattern '@vite/client', '/@react-refresh', '(?:https?|wss?)://(?:localhost|127\.0\.0\.1|\[::1\])(?=[:/])' -List
if ($developmentFiles) {
  throw "Development server/client reference is present in dist: $($developmentFiles.Path -join ', ')"
}

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
