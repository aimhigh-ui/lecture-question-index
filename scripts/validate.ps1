# 講義データの機械検査。毎回同じ手順なので1コマンドで回す。
#   pwsh -NoProfile -File scripts/validate.ps1  （このフォルダで実行）
# 検査内容: 必須項目・秒数の順序・動画ID重複・追跡パラメータ・私用パス混入・
#           YouTube動画名の再取得照合（oEmbed）・文字起こしに時刻が実在するか。
# ネットワークを使わない場合は -SkipNetwork を付ける。
param([switch]$SkipNetwork)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dataPath = Join-Path $root 'data/lectures.json'
$srcPath = Join-Path $root 'data/sources.local.json'
$raw = Get-Content -LiteralPath $dataPath -Raw -Encoding UTF8
$data = $raw | ConvertFrom-Json
$errors = New-Object System.Collections.Generic.List[string]
function Fail($m) { $script:errors.Add($m) }

if ($raw -match 'si=') { Fail '追跡用パラメータ si= が含まれている' }
if ($raw -match '[A-Za-z]:\\') { Fail '私用の絶対パスが公開データに含まれている' }
if ($raw -match '\d,\d{3}円') { Fail '金額に桁区切りカンマがある' }

$ids = @{}; $vids = @{}; $total = 0
$kinds = @('explain', 'chapter', 'closing')
$sources = $null
if (Test-Path -LiteralPath $srcPath) { $sources = Get-Content -LiteralPath $srcPath -Raw -Encoding UTF8 | ConvertFrom-Json }

foreach ($lec in $data.lectures) {
  $tag = "講義$($lec.id)"
  if ($ids.ContainsKey($lec.id)) { Fail "${tag}: id重複" }; $ids[$lec.id] = 1
  if ($vids.ContainsKey($lec.videoId)) { Fail "${tag}: 動画ID重複" }; $vids[$lec.videoId] = 1
  if ($lec.videoId -notmatch '^[A-Za-z0-9_-]{11}$') { Fail "${tag}: 動画IDの形式が不正" }
  foreach ($f in 'videoTitle', 'summary') { if ([string]::IsNullOrWhiteSpace($lec.$f)) { Fail "${tag}: $f が空" } }
  if (-not $lec.segments -or $lec.segments.Count -eq 0) { Fail "${tag}: 質問区間なし" }

  $known = $null
  if ($sources -and $sources.PSObject.Properties[$lec.id]) {
    $p = $sources.($lec.id)
    if (Test-Path -LiteralPath $p) {
      $known = @{}
      foreach ($line in Get-Content -LiteralPath $p -Encoding UTF8) {
        if ($line -match '^(?:(\d+):)?(\d{1,2}):(\d{2})') {
          $h = 0; $m = [int]$Matches[2]; $s = [int]$Matches[3]
          $known[$m * 60 + $s] = 1
        }
      }
    }
  }

  $prev = -1; $n = 0
  foreach ($seg in $lec.segments) {
    $n++; $t = "$tag 区間$n"; $total++
    foreach ($f in 'ask', 'badge', 'reaction', 'studentQuestion', 'answer') { if ([string]::IsNullOrWhiteSpace($seg.$f)) { Fail "${t}: $f が空" } }
    if ($seg.askSec -isnot [int] -and $seg.askSec -isnot [long]) { Fail "${t}: askSec が整数でない" }
    if ($seg.resumeSec -isnot [int] -and $seg.resumeSec -isnot [long]) { Fail "${t}: resumeSec が整数でない" }
    if ($seg.resumeSec -le $seg.askSec) { Fail "${t}: 再開秒が問いかけ秒以前" }
    if ($seg.askSec -le $prev) { Fail "${t}: 区間が時刻順でない" }
    $prev = $seg.resumeSec
    if ($kinds -notcontains $seg.resumeKind) { Fail "${t}: resumeKind が不正" }
    if ($seg.resumeKind -eq 'closing' -and $n -ne $lec.segments.Count) { Fail "${t}: 締めが最後の区間でない" }
    if ($known) {
      if (-not $known.ContainsKey([int]$seg.askSec)) { Fail "${t}: 問いかけ時刻が文字起こしにない ($($seg.askSec)秒)" }
      if (-not $known.ContainsKey([int]$seg.resumeSec)) { Fail "${t}: 再開時刻が文字起こしにない ($($seg.resumeSec)秒)" }
    }
  }
  if ($lec.segments[-1].resumeKind -ne 'closing') { Fail "${tag}: 最後の区間が締めでない" }

  if (-not $SkipNetwork) {
    try {
      $u = [uri]::EscapeDataString("https://www.youtube.com/watch?v=$($lec.videoId)")
      $o = Invoke-RestMethod -Uri "https://www.youtube.com/oembed?url=$u&format=json" -TimeoutSec 30
      if ($o.title -cne $lec.videoTitle) { Fail "${tag}: 動画名がYouTubeと不一致（YouTube: $($o.title) / データ: $($lec.videoTitle)）" }
    } catch { Fail "${tag}: oEmbed取得失敗 $($_.Exception.Message)" }
  }
}

Write-Output "講義 $($data.lectures.Count) 本 / 質問区間 $total 件を検査"
if ($errors.Count -gt 0) { $errors | ForEach-Object { Write-Output "NG: $_" }; exit 1 }
Write-Output 'OK: すべての検査に合格'
