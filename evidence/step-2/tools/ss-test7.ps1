$files = @(Get-ChildItem .\dist\assets\*.js)
Write-Host ("js files: " + $files.Count)
foreach ($f0 in $files) {
  $f = $f0.FullName
  Write-Host ("file: " + $f)
  Write-Host ("  len=" + $f0.Length)
  $h = @(Select-String -Path $f -Pattern "引导" -SimpleMatch -AllMatches)
  Write-Host ("  abs-path 引导=" + $h.Count)
  $rel = ".\dist\assets\" + $f0.Name
  $h2 = @(Select-String -Path $rel -Pattern "引导" -SimpleMatch -AllMatches)
  Write-Host ("  rel-path 引导=" + $h2.Count)
  $h3 = @(Get-Content $f -Encoding UTF8 | Select-String -Pattern "引导" -SimpleMatch -AllMatches)
  Write-Host ("  getcontent 引导=" + $h3.Count)
}
