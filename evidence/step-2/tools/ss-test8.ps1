$f = (Get-ChildItem .\dist\assets\*.js)[0].FullName
$h1 = @(Select-String -Path $f -Pattern "引导" -SimpleMatch -AllMatches -ErrorAction SilentlyContinue)
Write-Host ("SilentlyContinue: " + $h1.Count + " err=" + $Error[0])
$Error.Clear()
$h2 = @(Select-String -Path $f -Pattern "引导" -SimpleMatch -AllMatches)
Write-Host ("default: " + $h2.Count)
foreach ($s in @("引导","波形")) {
  $ms = @(Select-String -Path $f -Pattern $s -SimpleMatch -AllMatches)
  $c = 0
  foreach ($m in $ms) { $c += @($m.Matches).Count }
  Write-Host ("loop " + $s + ": lines=" + $ms.Count + " matches=" + $c)
}
