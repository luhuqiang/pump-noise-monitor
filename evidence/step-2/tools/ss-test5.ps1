$f = (Get-ChildItem .\dist\assets\*.js)[0].FullName
$txt = [System.IO.File]::ReadAllText($f, [System.Text.Encoding]::UTF8)
# UTF-16LE with BOM
[System.IO.File]::WriteAllText("$PWD\evidence\tmp-u16.js", $txt, [System.Text.Encoding]::Unicode)
# GBK (Default)
[System.IO.File]::WriteAllText("$PWD\evidence\tmp-gbk.js", $txt, [System.Text.Encoding]::Default)
foreach ($t in @("u16","gbk")) {
  $h = @(Select-String -Path ".\evidence\tmp-$t.js" -Pattern "波形" -SimpleMatch -AllMatches)
  $h2 = @(Select-String -Path ".\evidence\tmp-$t.js" -Pattern "引导" -SimpleMatch -AllMatches)
  Write-Host "$t.js 波形=$($h.Count) 引导=$($h2.Count)"
}
