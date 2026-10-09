# Builds the CrazyGames upload: dist/crazygames/ (unzipped, for local testing) and
# dist/riftbound-crazygames-<version>.zip (upload this in the CrazyGames Developer Portal).
#
#   powershell -ExecutionPolicy Bypass -File tools/package-crazygames.ps1
#
# What it does:
#   · copies index.html, css/, vendor/ and only the src/ modules reachable from src/main.js
#     (so src/dev/, orphans and offline tools stay out of the upload)
#   · injects the CrazyGames SDK v3 <script> and window.RIFTBOUND_PLATFORM = 'crazygames'
#     into index.html (src/platform.js reads it: SDK init, gameplay events, no external links)
#   · zips with forward-slash entry names (Compress-Archive on PowerShell 5 writes backslashes)
#
# Test the unzipped build locally on localhost (the SDK runs in its 'local' environment there):
#   powershell -ExecutionPolicy Bypass -File serve.ps1 -Port 8090   (from dist/crazygames, or copy serve.ps1 in)
# The web build in the repo root is unaffected: without the flag, platform.js loads no SDK.
param([string]$OutDir = 'dist')

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$out = [IO.Path]::GetFullPath((Join-Path $root $OutDir))
$stage = Join-Path $out 'crazygames'

$version = ([regex]::Match((Get-Content -Raw (Join-Path $root 'src/game/version.js')), "GAME_VERSION\s*=\s*'([^']+)'")).Groups[1].Value
if (-not $version) { $version = 'dev' }

# ------------------------------------------------------------------ module graph from src/main.js
$importRx = [regex]"(?:\bfrom|\bimport)\s*\(?\s*['""](\.{1,2}/[^'""]+)['""]"
$seen = New-Object 'System.Collections.Generic.HashSet[string]'
$queue = New-Object 'System.Collections.Generic.Queue[string]'
$queue.Enqueue((Join-Path $root 'src/main.js'))
while ($queue.Count -gt 0) {
  $file = [IO.Path]::GetFullPath($queue.Dequeue())
  if (-not $seen.Add($file)) { continue }
  $dir = Split-Path $file
  foreach ($m in $importRx.Matches((Get-Content -Raw $file))) {
    $dep = [IO.Path]::GetFullPath((Join-Path $dir $m.Groups[1].Value))
    # imports quoted inside comments may not exist; only follow real files
    if ((Test-Path -LiteralPath $dep -PathType Leaf) -and -not $seen.Contains($dep)) { $queue.Enqueue($dep) }
  }
}

# ------------------------------------------------------------------ stage
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force $stage | Out-Null

function Copy-Rel([string]$full) {
  $rel = $full.Substring($root.Length).TrimStart('\', '/')
  $dest = Join-Path $stage $rel
  New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
  Copy-Item -LiteralPath $full -Destination $dest
}

foreach ($f in $seen) { Copy-Rel $f }
Get-ChildItem -File (Join-Path $root 'css') -Filter *.css | ForEach-Object { Copy-Rel $_.FullName }
Get-ChildItem -File -Recurse (Join-Path $root 'vendor') | ForEach-Object { Copy-Rel $_.FullName }

# index.html with the platform flag and the SDK, both before the game's module script
$html = Get-Content -Raw (Join-Path $root 'index.html')
$inject = @"
  <script>window.RIFTBOUND_PLATFORM = 'crazygames';</script>
  <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>
</head>
"@
if ($html -notmatch '</head>') { throw 'index.html has no </head>' }
$html = $html -replace '</head>', $inject
[IO.File]::WriteAllText((Join-Path $stage 'index.html'), $html, (New-Object Text.UTF8Encoding $false))

# Sanity: no third-party URLs left in what the game loads (the SDK is the one allowed exception)
$leaks = Get-ChildItem -File -Recurse $stage -Include *.html, *.css, *.js |
  Select-String -Pattern 'https?://(fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr|unpkg)' |
  ForEach-Object { "$($_.Path.Substring($stage.Length)):$($_.LineNumber)" }
if ($leaks) { Write-Warning "CDN references left in the build:`n  $($leaks -join "`n  ")" }

# ------------------------------------------------------------------ zip (forward-slash entries)
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$zipPath = Join-Path $out "riftbound-crazygames-$version.zip"
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
$zip = [IO.Compression.ZipFile]::Open($zipPath, 'Create')
try {
  foreach ($f in Get-ChildItem -File -Recurse $stage) {
    $entry = $f.FullName.Substring($stage.Length).TrimStart('\', '/').Replace('\', '/')
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $f.FullName, $entry, 'Optimal') | Out-Null
  }
} finally { $zip.Dispose() }

$files = Get-ChildItem -File -Recurse $stage
$bytes = ($files | Measure-Object Length -Sum).Sum
'CrazyGames build {0}: {1} files, {2:N2} MB unpacked, {3:N2} MB zipped' -f $version, $files.Count, ($bytes / 1MB), ((Get-Item $zipPath).Length / 1MB)
"  folder: $stage"
"  zip:    $zipPath"
