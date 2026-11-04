$f = (Get-ChildItem .\dist\assets\*.js)[0].FullName
$bytes = [System.IO.File]::ReadAllBytes($f)
[System.IO.File]::WriteAllBytes("$PWD\evidence\tmp-same.js", $bytes)
[System.IO.File]::WriteAllBytes("$PWD\evidence\tmp-same.txt", $bytes)
[System.IO.File]::WriteAllBytes("$PWD\evidence\tmp-same.mjs", $bytes)
[System.IO.File]::WriteAllBytes("$PWD\evidence\tmp-same.css", $bytes)
foreach ($t in @("same.js","same.txt","same.mjs","same.css")) {
  $h = @(Select-String -Path ".\evidence\tmp-$t" -Pattern "引导" -SimpleMatch -AllMatches)
  Write-Host "$t 引导=$($h.Count)"
}
