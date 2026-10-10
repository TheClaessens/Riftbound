# Portal packager (crazygames-release skill kit): builds dist/<name>-crazygames-<version>.zip from a
# no-build ES-module web game (index.html + an import map + an entry module). Zero dependencies:
# Windows PowerShell 5.1+ (or pwsh). Copy to tools/package-portal.ps1.
#
#   powershell -ExecutionPolicy Bypass -File tools/package-portal.ps1 -Name mygame -Version 1.0 `
#     [-Entry src/main.js] [-Index index.html] [-Title "My Game"] [-Mark "My"] [-Sub "Game"] [-Assets assets,audio]
#
# What it does, and why (each item fixed a real portal problem, see SKILL.md):
#   · ONE bundle.js: every module reachable from the entry (plus import-mapped packages such as three
#     and three/addons/*) as source strings; a tiny loader turns each into a blob: ES module under an
#     '@g/<path>' name in a generated import map. Only import specifiers are rewritten, nothing else.
#     ~150 module requests -> 1: a cold portal CDN made the unbundled build take ~30 s to load.
#   · Fallback: the plain module files ship too; if blob scripts are blocked (CSP), the loader loads
#     the entry module normally with the original import map.
#   · Import-mapped targets prefer a sibling .min.js (e.g. three.module.min.js). CDN targets are an
#     error: vendor them first (portals want relative paths and no third-party requests).
#   · CSS <link>s are inlined into index.html; files their url()s reference (fonts, images) are copied.
#   · Adds window.<FlagVar> = 'crazygames', the CrazyGames SDK v3 <script>, SDK.init() at the top of
#     <body> (it needs document.body; it overlaps the bundle download) and a boot loading screen
#     (#boot-loading) that the platform layer fades out on the first frame.
#   · Zips with forward-slash entries (Compress-Archive on PowerShell 5 writes backslashes).
# Runtime-loaded files the crawler cannot see (fetch()/textures/audio/JSON) must be listed in -Assets.
param(
  [string]$Name = '',
  [string]$Version = 'dev',
  [string]$Entry = 'src/main.js',
  [string]$Index = 'index.html',
  [string]$Title = '',
  [string]$Mark = '',
  [string]$Sub = '',
  [string[]]$Assets = @(),
  [string]$OutDir = 'dist',
  [string]$FlagVar = 'PORTAL_PLATFORM',
  [switch]$NoMin
)

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$out = [IO.Path]::GetFullPath((Join-Path $root $OutDir))
$stage = Join-Path $out 'crazygames'
$utf8 = New-Object Text.UTF8Encoding $false
function Read-Text([string]$path) { [IO.File]::ReadAllText($path, [Text.Encoding]::UTF8) }
function Rel([string]$full) { $full.Substring($root.Length).TrimStart('\', '/').Replace('\', '/') }
function Under([string]$baseRel, [string]$p) {   # resolve p against the folder of baseRel -> root-relative path
  Rel ([IO.Path]::GetFullPath((Join-Path (Split-Path (Join-Path $root $baseRel)) $p)))
}

$html = Read-Text (Join-Path $root $Index)
if (-not $Name) { $Name = (Split-Path $root -Leaf).ToLower() -replace '[^a-z0-9]+', '-' }
if (-not $Title) { $Title = ([regex]::Match($html, '<title>([^<]*)</title>')).Groups[1].Value }
if (-not $Mark) { $Mark = $Title }

# ------------------------------------------------------------------ import map (bare specifiers)
$exact = @{}; $prefix = @{}
$im = [regex]::Match($html, '<script type="importmap">([\s\S]*?)</script>')
if ($im.Success) {
  $map = ($im.Groups[1].Value | ConvertFrom-Json).imports
  foreach ($p in $map.PSObject.Properties) {
    $target = [string]$p.Value
    if ($target -match '^(https?:)?//') { throw "import map '$($p.Name)' points at $target - vendor it locally first" }
    $rel = Under $Index $target
    if ($p.Name.EndsWith('/')) { $prefix[$p.Name] = $rel.TrimEnd('/') + '/' }
    else {
      $min = $rel -replace '\.js$', '.min.js'
      if (-not $NoMin -and (Test-Path -LiteralPath (Join-Path $root $min) -PathType Leaf)) { $rel = $min }
      $exact[$p.Name] = $rel
    }
  }
}
function Resolve-Spec([string]$fromRel, [string]$spec) {
  if ($exact.ContainsKey($spec)) { return $exact[$spec] }
  foreach ($k in $prefix.Keys) { if ($spec.StartsWith($k)) { return $prefix[$k] + $spec.Substring($k.Length) } }
  if (-not ($spec.StartsWith('./') -or $spec.StartsWith('../'))) { return $null }
  $rel = Under $fromRel $spec
  if (Test-Path -LiteralPath (Join-Path $root $rel) -PathType Leaf) { return $rel }
  return $null   # e.g. an import quoted inside a comment
}

# ------------------------------------------------------------------ module graph
$specRx = [regex]"((?:\bfrom|\bimport)\s*\(?\s*)(['""])([^'""\r\n]+)\2"
$mods = New-Object 'System.Collections.Generic.List[string]'
$seen = New-Object 'System.Collections.Generic.HashSet[string]'
$queue = New-Object 'System.Collections.Generic.Queue[string]'
$queue.Enqueue($Entry)
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
  $src = Join-Path $root $rel
  if (Test-Path -LiteralPath $src -PathType Container) {
    Get-ChildItem -File -Recurse $src | ForEach-Object { Copy-Stage (Rel $_.FullName) }; return
  }
  $dest = Join-Path $stage $rel
  New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
  Copy-Item -LiteralPath $src -Destination $dest
}
foreach ($rel in $mods) { Copy-Stage $rel }   # the fallback path
foreach ($a in $Assets) { Copy-Stage $a }

# ------------------------------------------------------------------ bundle.js
function Js-String([string]$s) {
  $s = $s.Replace('\', '\\').Replace('"', '\"').Replace("`r", '\r').Replace("`n", '\n').Replace("`t", '\t')
  $s = $s.Replace([string][char]0x2028, ' ').Replace([string][char]0x2029, ' ')
  $s = [regex]::Replace($s, '[\x00-\x1f]', { param($m) '\u{0:x4}' -f [int][char]$m.Value })
  return '"' + $s + '"'
}
$sb = New-Object Text.StringBuilder
[void]$sb.Append("// ${Title}: every game module in one file (package-portal.ps1). Generated, do not edit.`nwindow.__GAME_MODULES = {`n")
foreach ($rel in $mods) {
  $fromRel = $rel
  $src = $specRx.Replace((Read-Text (Join-Path $root $rel)), [Text.RegularExpressions.MatchEvaluator] {
    param($m)
    $dep = Resolve-Spec $fromRel $m.Groups[3].Value
    if ($dep) { $m.Groups[1].Value + $m.Groups[2].Value + '@g/' + $dep + $m.Groups[2].Value } else { $m.Value }
  })
  [void]$sb.Append((Js-String $rel)).Append(':').Append((Js-String $src)).Append(",`n")
}
[void]$sb.Append("};`n")
# fallback import map = the original bare mappings (min variants) for the plain files
$fallback = @{}
foreach ($k in $exact.Keys) { $fallback[$k] = './' + $exact[$k] }
foreach ($k in $prefix.Keys) { $fallback[$k] = './' + $prefix[$k] }
$fallbackJson = ($fallback | ConvertTo-Json -Compress)
if (-not $fallbackJson -or $fallbackJson -eq '""') { $fallbackJson = '{}' }
[void]$sb.Append(@'
(function () {
  var M = window.__GAME_MODULES, imports = __FALLBACK__, blobs = true;
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
  function fallback() { console.warn('[boot] bundle could not load as blob modules; loading the module files instead'); load('__ENTRY__'); }
  if (blobs) load(imports['@g/__ENTRY__'], fallback); else fallback();
})();
'@.Replace('__FALLBACK__', $fallbackJson).Replace('__ENTRY__', $Entry))
Write-Stage 'bundle.js' $sb.ToString()

# ------------------------------------------------------------------ index.html
# CSS: inline local <link rel="stylesheet">s; copy what their url()s point at, re-rooted at the page
$cssParts = New-Object 'System.Collections.Generic.List[string]'
$html = [regex]::Replace($html, '<link rel="stylesheet" href="([^"]+)">\s*', [Text.RegularExpressions.MatchEvaluator] {
  param($m)
  $href = $m.Groups[1].Value
  if ($href -match '^(https?:)?//') { throw "stylesheet $href is remote - vendor it locally first" }
  $cssRel = Under $Index $href
  $css = [regex]::Replace((Read-Text (Join-Path $root $cssRel)), 'url\(\s*([''"]?)([^''")]+)\1\s*\)', [Text.RegularExpressions.MatchEvaluator] {
    param($u)
    $p = $u.Groups[2].Value
    if ($p -match '^(data:|https?:|//|/|#)') { return $u.Value }
    $r = Under $cssRel $p
    Copy-Stage $r
    "url($r)"
  })
  $script:cssParts.Add("/* $cssRel */`n$css")
  if ($script:cssParts.Count -eq 1) { '__INLINE_CSS__' } else { '' }
})
$html = $html.Replace('__INLINE_CSS__', "<style>`n$($cssParts -join "`n")`n  </style>`n  ")

$html = [regex]::Replace($html, '\s*<script type="importmap">[\s\S]*?</script>', '')
$entryTag = [regex]::Match($html, '<script type="module" src="' + [regex]::Escape($Entry) + '"></script>')
if (-not $entryTag.Success) { throw "index.html has no <script type=""module"" src=""$Entry""></script>" }
$html = $html.Replace($entryTag.Value, '<script src="bundle.js" defer></script>')

$html = $html.Replace('</head>', @"
  <script>window.$FlagVar = 'crazygames';</script>
  <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>
</head>
"@)

$loading = @'
<body>
  <!-- SDK.init() appends to document.body, so it starts here; it overlaps the bundle download -->
  <script>try { window.__cgInit = window.CrazyGames.SDK.init(); } catch (e) { console.warn('[platform] early SDK init failed', e); }</script>
  <div id="boot-loading" aria-label="Loading">
    <div class="bl-mark">__MARK__</div>
    <div class="bl-sub">__SUB__</div>
    <div class="bl-bar"><i></i></div>
  </div>
  <style>
    #boot-loading { position: fixed; inset: 0; z-index: 100; display: grid; place-content: center; justify-items: center; gap: 2.4vmin;
      background: radial-gradient(ellipse at 50% 45%, #1b1530 0%, #07080d 70%); transition: opacity .5s ease; color: #ecd9a6; }
    #boot-loading.is-done { opacity: 0; pointer-events: none; }
    #boot-loading .bl-mark { font: 700 clamp(36px, 11vmin, 130px) / 1 Georgia, serif; }
    #boot-loading .bl-sub { margin-top: -1.2vmin; font: 700 clamp(16px, 4vmin, 44px) / 1 Georgia, serif; }
    #boot-loading .bl-sub:empty { display: none; }
    #boot-loading .bl-bar { width: clamp(160px, 36vmin, 380px); height: 3px; background: rgb(236 217 166 / .15); overflow: hidden; }
    #boot-loading .bl-bar > i { display: block; height: 100%; width: 40%; background: currentColor; animation: bl-run 1.1s ease-in-out infinite; }
    @keyframes bl-run { from { transform: translateX(-100%); } to { transform: translateX(250%); } }
  </style>
'@
if ($html -notmatch '<body>') { throw "$Index has no plain <body> tag" }
$html = $html.Replace('<body>', $loading.TrimEnd().Replace('__MARK__', $Mark).Replace('__SUB__', $Sub))
$html = [regex]::Replace($html, '<title>[^<]*</title>', "<title>$Title</title>")
Write-Stage 'index.html' $html

# ------------------------------------------------------------------ checks
$hosts = Get-ChildItem -File -Recurse $stage -Include *.html, *.css, *.js |
  Select-String -Pattern 'https?://([a-z0-9.-]+)' -AllMatches |
  ForEach-Object { $_.Matches } | ForEach-Object { $_.Groups[1].Value } |
  Where-Object { $_ -ne 'sdk.crazygames.com' } | Sort-Object -Unique
if ($hosts) { Write-Warning "URLs to other hosts in the build (requests? links? only fine if hidden on the portal): $($hosts -join ', ')" }

# ------------------------------------------------------------------ zip
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$zipPath = Join-Path $out "$Name-crazygames-$Version.zip"
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
$zip = [IO.Compression.ZipFile]::Open($zipPath, 'Create')
try {
  foreach ($f in Get-ChildItem -File -Recurse $stage) {
    $entryName = $f.FullName.Substring($stage.Length).TrimStart('\', '/').Replace('\', '/')
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $f.FullName, $entryName, 'Optimal') | Out-Null
  }
} finally { $zip.Dispose() }
$files = Get-ChildItem -File -Recurse $stage
'{0} {1}: {2} modules in bundle.js ({3:N0} KB); {4} files, {5:N2} MB unpacked, {6:N2} MB zipped (limits: 1500 files, 20 MB initial download for the mobile homepage, 50 MB max)' -f `
  $Name, $Version, $mods.Count, ((Get-Item (Join-Path $stage 'bundle.js')).Length / 1KB), $files.Count, (($files | Measure-Object Length -Sum).Sum / 1MB), ((Get-Item $zipPath).Length / 1MB)
"  folder: $stage"
"  zip:    $zipPath"
