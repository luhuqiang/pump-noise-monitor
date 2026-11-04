$RequiredStrings = @("开始听诊", "长按结束", "引导", "设置", "波形", "频谱", "阶次", "趋势", "事件轨", "质量")
$jsFiles = @(Get-ChildItem ".\dist\assets\*.js" -File -ErrorAction SilentlyContinue)
Write-Host ("jsFiles=" + $jsFiles.Count)
foreach ($s in $RequiredStrings) {
  $hits = 0
  foreach ($f in $jsFiles) {
    $ms = @(Select-String -Path $f.FullName -Pattern $s -SimpleMatch -AllMatches -ErrorAction SilentlyContinue)
    foreach ($m in $ms) { $hits += @($m.Matches).Count }
  }
  Write-Host "$s=$hits"
}
