$f = (Get-ChildItem .\dist\assets\*.js)[0].FullName
$ms = @(Select-String -Path $f -Pattern "波形" -SimpleMatch -AllMatches)
$m0 = $ms[0]
Write-Host ("type: " + $m0.GetType().FullName)
Write-Host ("Matches prop: " + ($m0.Matches | Out-String).Trim())
Write-Host ("Matches.Count: " + $m0.Matches.Count)
Write-Host ("PSObject Matches: " + ($m0.PSObject.Properties["Matches"] -ne $null))
Write-Host ("regex fallback: " + [regex]::Matches($m0.Line, "波形").Count)
# 对比：短行上 Matches 是否有值
"xx波形yy波形" | Out-File -Encoding utf8 .\evidence\tmp-two.txt
$n = @(Select-String -Path .\evidence\tmp-two.txt -Pattern "波形" -SimpleMatch -AllMatches)
Write-Host ("short-line Matches.Count: " + $n[0].Matches.Count)
