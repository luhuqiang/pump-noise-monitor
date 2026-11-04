$f = (Get-ChildItem .\dist\assets\*.js)[0].FullName
$bytes = [System.IO.File]::ReadAllBytes($f)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

# A: 原样复制（含 BOM）
[System.IO.File]::WriteAllBytes("$PWD\evidence\tmp-a.txt", $bytes)
# B: 去 BOM 重写
[System.IO.File]::WriteAllBytes("$PWD\evidence\tmp-b.txt", $bytes[3..($bytes.Length-1)])
# C: 前 240KB（含波形@220K 设置@239K）
[System.IO.File]::WriteAllBytes("$PWD\evidence\tmp-c.txt", $bytes[0..245759])
# D: 后 120KB（含引导@313K）
[System.IO.File]::WriteAllBytes("$PWD\evidence\tmp-d.txt", $bytes[200000..($bytes.Length-1)])

foreach ($t in @("a","b","c","d")) {
  $h = @(Select-String -Path ".\evidence\tmp-$t.txt" -Pattern "波形" -SimpleMatch -AllMatches)
  $h2 = @(Select-String -Path ".\evidence\tmp-$t.txt" -Pattern "引导" -SimpleMatch -AllMatches)
  Write-Host "$t 波形=$($h.Count) 引导=$($h2.Count)"
}
