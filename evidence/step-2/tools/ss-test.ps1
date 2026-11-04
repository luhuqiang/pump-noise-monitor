$f = (Get-ChildItem .\dist\assets\*.js)[0].FullName
foreach ($s in @("引导", "设置", "波形", "开始听诊")) {
  $hits = 0
  $ms = @(Select-String -Path $f -Pattern $s -SimpleMatch -AllMatches -ErrorAction Continue)
  foreach ($m in $ms) { $hits += @($m.Matches).Count }
  Write-Host "$s=$hits"
}
$txt = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
Write-Host ("dotnet 引导=" + $txt.Contains("引导"))
