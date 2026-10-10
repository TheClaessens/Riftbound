# Builds the CrazyGames upload: dist/crazygames/ (unzipped, for local testing) and
# dist/scions-crazygames-<version>.zip (upload this in the CrazyGames Developer Portal).
#
#   powershell -ExecutionPolicy Bypass -File tools/package-crazygames.ps1 [-Version 6.2]
#
# What it does:
#   · bundles every module reachable from src/main.js (plus the three.js addons they use) into ONE
#     classic script, bundle.js: ~150 requests become 1, which matters on a cold portal CDN. A tiny
#     loader at its end turns each module into a blob: URL and maps it in an import map, so every
#     module still runs as a real ES module (no code is transformed except its import specifiers,
#     rewritten to '@g/<path>'). If blob scripts were ever blocked, it falls back to the plain files,
#     which are shipped too.
#   · uses the minified three.js build (vendor/three/build/three.module.min.js)
#   · inlines the CSS into index.html, adds the CrazyGames SDK v3 (init starts at once, in parallel
#     with the bundle download), window.RIFTBOUND_PLATFORM = 'crazygames' (src/platform.js: SDK
#     events, no external links, straight into a run) and a boot loading screen (#boot-loading)
#   · zips with forward-slash entry names (Compress-Archive on PowerShell 5 writes backslashes)
#
# Test locally: launch config "riftbound-crazygames" (port 8095) serves dist/crazygames; the SDK runs in
# its 'local' environment on localhost. The console shows "[platform] boot: ..." with the load phases.
# -Version overrides the zip's version label (default: GAME_VERSION from src/game/version.js).
param([string]$OutDir = 'dist', [string]$Version = '')

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$out = [IO.Path]::GetFullPath((Join-Path $root $OutDir))
$stage = Join-Path $out 'crazygames'
$utf8 = New-Object Text.UTF8Encoding $false
function Read-Text([string]$path) { [IO.File]::ReadAllText($path, [Text.Encoding]::UTF8) }

$version = $(if ($Version) { $Version } else { ([regex]::Match((Read-Text (Join-Path $root 'src/game/version.js')), "GAME_VERSION\s*=\s*'([^']+)'")).Groups[1].Value })
if (-not $version) { $version = 'dev' }
# Player-facing name (src/game/brand.js): loading screen and <title>
$brand = Read-Text (Join-Path $root 'src/game/brand.js')
$brandOf = { param($k) ([regex]::Match($brand, "$k\s*=\s*'([^']+)'")).Groups[1].Value }
$gameName = & $brandOf 'GAME_NAME'; $markMain = & $brandOf 'WORDMARK_MAIN'; $markSub = & $brandOf 'WORDMARK_SUB'
if (-not $gameName -or -not $markMain) { throw 'GAME_NAME / WORDMARK_MAIN not found in src/game/brand.js' }

# ------------------------------------------------------------------ module graph from src/main.js
$THREE = 'vendor/three/build/three.module.min.js'
$ADDONS = 'vendor/three/examples/jsm/'
function Rel([string]$full) { $full.Substring($root.Length).TrimStart('\', '/').Replace('\', '/') }
# specifier (as written in $fromRel) -> root-relative module path, or $null if it is not a module we ship
function Resolve-Spec([string]$fromRel, [string]$spec) {
  if ($spec -eq 'three') { return $THREE }
  if ($spec.StartsWith('three/addons/')) { return $ADDONS + $spec.Substring(13) }
  if (-not ($spec.StartsWith('./') -or $spec.StartsWith('../'))) { return $null }
  $full = [IO.Path]::GetFullPath((Join-Path (Split-Path (Join-Path $root $fromRel)) $spec))
  if (Test-Path -LiteralPath $full -PathType Leaf) { return Rel $full }
  return $null   # e.g. an import quoted inside a comment
}
$specRx = [regex]"((?:\bfrom|\bimport)\s*\(?\s*)(['""])([^'""\r\n]+)\2"
$mods = New-Object 'System.Collections.Generic.List[string]'
$seen = New-Object 'System.Collections.Generic.HashSet[string]'
$queue = New-Object 'System.Collections.Generic.Queue[string]'
$queue.Enqueue('src/main.js')
while ($queue.Count -gt 0) {
  $rel = $queue.Dequeue()
  if (-not $seen.Add($rel)) { continue }
  $mods.Add($rel)
  foreach ($m in $specRx.Matches((Read-Text (Join-Path $root $rel)))) {
    $dep = Resolve-Spec $rel $m.Groups[3].Value
    if ($dep -and -not $seen.Contains($dep)) { $queue.Enqueue($dep) }
  }
}

# ------------------------------------------------------------------ stage
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force $stage | Out-Null
function Write-Stage([string]$rel, [string]$text) {
  $dest = Join-Path $stage $rel
  New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
  [IO.File]::WriteAllText($dest, $text, $utf8)
}
function Copy-Stage([string]$rel) {
  $dest = Join-Path $stage $rel
  New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
  Copy-Item -LiteralPath (Join-Path $root $rel) -Destination $dest
}

# The plain module files (the fallback path), fonts and the three.js licence
foreach ($rel in $mods) { Copy-Stage $rel }
Get-ChildItem -File -Recurse (Join-Path $root 'vendor/fonts') | ForEach-Object { Copy-Stage (Rel $_.FullName) }
Copy-Stage 'vendor/three/LICENSE'

# ------------------------------------------------------------------ bundle.js
function Js-String([string]$s) {
  $s = $s.Replace('\', '\\').Replace('"', '\"').Replace("`r", '\r').Replace("`n", '\n').Replace("`t", '\t')
  $s = $s.Replace([string][char]0x2028, ' ').Replace([string][char]0x2029, ' ')
  $s = [regex]::Replace($s, '[\x00-\x1f]', { param($m) '\u{0:x4}' -f [int][char]$m.Value })
  return '"' + $s + '"'
}
$sb = New-Object Text.StringBuilder
[void]$sb.Append("// ${gameName}: every game module in one file (tools/package-crazygames.ps1). Generated, do not edit.`n")
[void]$sb.Append("window.__GAME_MODULES = {`n")
foreach ($rel in $mods) {
  $src = Read-Text (Join-Path $root $rel)
  $fromRel = $rel
  $src = $specRx.Replace($src, [Text.RegularExpressions.MatchEvaluator] {
    param($m)
    $dep = Resolve-Spec $fromRel $m.Groups[3].Value
    if ($dep) { $m.Groups[1].Value + $m.Groups[2].Value + '@g/' + $dep + $m.Groups[2].Value } else { $m.Value }
  })
  [void]$sb.Append((Js-String $rel)).Append(':').Append((Js-String $src)).Append(",`n")
}
[void]$sb.Append("};`n")
[void]$sb.Append(@'
(function () {
  // Each module becomes a blob: URL under its '@g/<path>' name; 'three' and the addons also map to the
  // plain files so the fallback (src/main.js loaded as a normal module) resolves the same way.
  var M = window.__GAME_MODULES, imports = { 'three': './__THREE__', 'three/addons/': './__ADDONS__' }, blobs = true;
  try { for (var p in M) imports['@g/' + p] = URL.createObjectURL(new Blob([M[p]], { type: 'text/javascript' })); }
  catch (e) { blobs = false; }
  window.__GAME_MODULES = null;
  var map = document.createElement('script');
  map.type = 'importmap';
  map.textContent = JSON.stringify({ imports: imports });
  document.head.appendChild(map);
  function load(src, onerror) {
    var s = document.createElement('script');
    s.type = 'module'; s.src = src;
    if (onerror) s.onerror = onerror;
    document.body.appendChild(s);
  }
  function fallback() { console.warn('[boot] bundle could not load as blob modules; loading the module files instead'); load('src/main.js'); }
  if (blobs) load(imports['@g/src/main.js'], fallback); else fallback();
})();
'@.Replace('__THREE__', $THREE).Replace('__ADDONS__', $ADDONS))
Write-Stage 'bundle.js' $sb.ToString()

# ------------------------------------------------------------------ index.html
$html = Read-Text (Join-Path $root 'index.html')

# CSS inlined in link order (url(../x) in css/*.css becomes url(x) from the page root)
$links = [regex]::Matches($html, '<link rel="stylesheet" href="(css/[^"]+)">\s*')
if ($links.Count -eq 0) { throw 'no css/*.css links in index.html' }
$css = ($links | ForEach-Object { "/* $($_.Groups[1].Value) */`n" + (Read-Text (Join-Path $root $_.Groups[1].Value)) }) -join "`n"
$css = $css.Replace('url(../', 'url(')
$first = $true
$html = [regex]::Replace($html, '<link rel="stylesheet" href="css/[^"]+">\s*', [Text.RegularExpressions.MatchEvaluator] {
  param($m)
  if ($script:first) { $script:first = $false; "<style>`n$css`n  </style>`n  " } else { '' }
})

# The module graph now comes from bundle.js: drop the static import map and module entry script
$html = [regex]::Replace($html, '\s*<script type="importmap">[\s\S]*?</script>', '')
if ($html -notmatch '<script type="module" src="src/main.js"></script>') { throw 'index.html has no src/main.js module script' }
$html = $html.Replace('<script type="module" src="src/main.js"></script>', '<script src="bundle.js" defer></script>')

# Platform flag + SDK script (its init() is started at the top of <body>, see $loading; platform.js awaits it)
$inject = @"
  <script>window.RIFTBOUND_PLATFORM = 'crazygames';</script>
  <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>
</head>
"@
if ($html -notmatch '</head>') { throw 'index.html has no </head>' }
$html = $html.Replace('</head>', $inject)

# Boot loading screen: shown while the bundle downloads and the game builds, then faded out by
# platform.hideLoading() once the first frame of the run is on screen (the build skips the title).
$loading = @'
<body>
  <!-- SDK.init() starts here, at the top of <body> (it appends to document.body), so it runs while bundle.js downloads -->
  <script>try { window.__cgInit = window.CrazyGames.SDK.init(); } catch (e) { console.warn('[platform] early SDK init failed', e); }</script>
  <div id="boot-loading" aria-label="Loading">
    <div class="bl-mark">__MARK_MAIN__</div>
    <div class="bl-sub">__MARK_SUB__</div>
    <div class="bl-bar"><i></i></div>
  </div>
  <style>
    #boot-loading { position: fixed; inset: 0; z-index: 100; display: grid; place-content: center; justify-items: center; gap: 2.4vmin;
      background: radial-gradient(ellipse at 50% 45%, #1b1530 0%, #07080d 70%); transition: opacity .5s ease; }
    #boot-loading.is-done { opacity: 0; pointer-events: none; }
    #boot-loading .bl-mark { font: 700 clamp(40px, 13vmin, 140px) / 1 'Grenze Gotisch', Georgia, serif; letter-spacing: .005em;
      color: transparent; background: linear-gradient(180deg, #fff6dc 0 36%, #ecd9a6 36% 62%, #c8a874 62% 84%, #a8854f 84%);
      -webkit-background-clip: text; background-clip: text; filter: drop-shadow(0 .5vmin 0 rgb(12 10 18 / .6)); }
    #boot-loading .bl-sub { margin-top: -1.2vmin; font: 700 clamp(16px, 4vmin, 44px) / 1 'Grenze', Georgia, serif; letter-spacing: .04em; color: #ecd9a6; }
    #boot-loading .bl-sub:empty { display: none; }
    #boot-loading .bl-bar { width: clamp(160px, 36vmin, 380px); height: 3px; background: rgb(236 217 166 / .15); overflow: hidden; }
    #boot-loading .bl-bar > i { display: block; height: 100%; width: 40%;
      background: linear-gradient(90deg, #ff7a33, #7fe0ff, #ffe45c, #c08cff); animation: bl-run 1.1s ease-in-out infinite; }
    @keyframes bl-run { from { transform: translateX(-100%); } to { transform: translateX(250%); } }
  </style>
'@
if ($html -notmatch '<body>') { throw 'index.html has no <body>' }
$html = $html.Replace('<body>', $loading.TrimEnd().Replace('__MARK_MAIN__', $markMain).Replace('__MARK_SUB__', $markSub))
$html = [regex]::Replace($html, '<title>[^<]*</title>', "<title>$gameName</title>")
Write-Stage 'index.html' $html

# Sanity: no third-party URLs left in what the game loads (the SDK is the one allowed exception)
$leaks = Get-ChildItem -File -Recurse $stage -Include *.html, *.css, *.js |
  Select-String -Pattern 'https?://(fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr|unpkg)' |
  ForEach-Object { "$($_.Path.Substring($stage.Length)):$($_.LineNumber)" }
if ($leaks) { Write-Warning "CDN references left in the build:`n  $($leaks -join "`n  ")" }

# ------------------------------------------------------------------ zip (forward-slash entries)
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$zipPath = Join-Path $out "scions-crazygames-$version.zip"
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
$bundleKb = (Get-Item (Join-Path $stage 'bundle.js')).Length / 1KB
'CrazyGames build {0}: {1} modules in bundle.js ({2:N0} KB); {3} files, {4:N2} MB unpacked, {5:N2} MB zipped' -f $version, $mods.Count, $bundleKb, $files.Count, ($bytes / 1MB), ((Get-Item $zipPath).Length / 1MB)
"  folder: $stage"
"  zip:    $zipPath"
