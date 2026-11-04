$f = (Get-ChildItem .\dist\assets\*.js)[0].FullName
foreach ($enc in @("Default", "UTF8")) {
  $a = @(Select-String -Path $f -Pattern "children" -SimpleMatch -AllMatches -Encoding $enc)
  $b = @(Select-String -Path $f -Pattern "引导" -SimpleMatch -AllMatches -Encoding $enc)
  Write-Host ("enc=" + $enc + " children=" + $a.Count + " 引导=" + $b.Count)
}
# 看 Select-String 读出的「引导」实际解码成什么
$line = (Select-String -Path $f -Pattern "jsx" -SimpleMatch -Encoding UTF8 | Select-Object -First 1).Line
$idx = $line.IndexOf([char]0x5F15)  # 引
Write-Host ("line len=" + $line.Length + " hasU+5F15=" + ($idx -ge 0))
