# Promo kit server (Windows, no dependencies). Serves the project root and accepts
#   PUT /__promo/out/<file>   -> writes <promo dir>/out/<file>
# Supports byte ranges so the finished MP4 can be scrubbed in the browser.
# Default layout: <project>/promo/kit/serve.ps1  -> root = <project>, out = <project>/promo/out
# Usage: powershell -ExecutionPolicy Bypass -File promo/kit/serve.ps1 [-Port 8096] [-Root .] [-Out promo/out]
param([int]$Port = 8096, [string]$Root = '', [string]$Out = '')

if (-not $Root) { $Root = Join-Path $PSScriptRoot '..\..' }
if (-not $Out) { $Out = Join-Path $PSScriptRoot '..\out' }
$root = [IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
$outDir = [IO.Path]::GetFullPath($Out)
New-Item -ItemType Directory -Force $outDir | Out-Null
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "promo server: http://localhost:$Port/  root=$root  out=$outDir"

$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.mjs' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'
  '.svg' = 'image/svg+xml'; '.wasm' = 'application/wasm'; '.mp4' = 'video/mp4'; '.webm' = 'video/webm'
  '.wav' = 'audio/wav'; '.mp3' = 'audio/mpeg'; '.ogg' = 'audio/ogg'; '.glb' = 'model/gltf-binary'; '.gltf' = 'model/gltf+json'
  '.woff2' = 'font/woff2'; '.ttf' = 'font/ttf'; '.txt' = 'text/plain; charset=utf-8'; '.md' = 'text/plain; charset=utf-8'
}

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $res = $ctx.Response
    try {
      $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
      if ($ctx.Request.HttpMethod -eq 'PUT') {
        $name = [IO.Path]::GetFileName($rel)
        if ($rel -like '__promo/out/*' -and $name -match '^[\w.\-]+$') {
          $fs = [IO.File]::Create((Join-Path $outDir $name))
          try { $ctx.Request.InputStream.CopyTo($fs) } finally { $fs.Close() }
          Write-Host "saved $name"
          $res.StatusCode = 201
        } else { $res.StatusCode = 403 }
        continue
      }
      if ($rel -like '__promo/out/*') { $full = Join-Path $outDir ([IO.Path]::GetFileName($rel)) }
      else {
        if ($rel -eq '' -or $rel.EndsWith('/')) { $rel += 'index.html' }
        $full = [IO.Path]::GetFullPath((Join-Path $root $rel))
        if (-not $full.StartsWith($root)) { $res.StatusCode = 403; continue }
      }
      if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { $res.StatusCode = 404; continue }
      $ext = [IO.Path]::GetExtension($full).ToLower()
      $res.ContentType = $(if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' })
      $res.Headers.Add('Cache-Control', 'no-store')
      $res.Headers.Add('Accept-Ranges', 'bytes')
      $fs = [IO.File]::OpenRead($full)
      try {
        $len = $fs.Length; $start = 0; $end = $len - 1
        $range = $ctx.Request.Headers['Range']
        if ($range -match '^bytes=(\d*)-(\d*)$') {
          if ($Matches[1] -ne '') { $start = [int64]$Matches[1]; if ($Matches[2] -ne '') { $end = [Math]::Min([int64]$Matches[2], $len - 1) } }
          elseif ($Matches[2] -ne '') { $start = [Math]::Max(0, $len - [int64]$Matches[2]) }
          $res.StatusCode = 206
          $res.Headers.Add('Content-Range', "bytes $start-$end/$len")
        }
        $count = $end - $start + 1
        $res.ContentLength64 = $count
        $fs.Seek($start, 'Begin') | Out-Null
        $buf = New-Object byte[] 65536
        while ($count -gt 0) {
          $n = $fs.Read($buf, 0, [int][Math]::Min($buf.Length, $count))
          if ($n -le 0) { break }
          $res.OutputStream.Write($buf, 0, $n); $count -= $n
        }
      } finally { $fs.Close() }
    } catch {
      try { $res.StatusCode = 500 } catch {}
    } finally {
      try { $res.Close() } catch {}
    }
  }
} finally {
  $listener.Stop()
}
