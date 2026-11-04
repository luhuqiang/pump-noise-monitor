"xx波形yy波形zz" | Out-File -Encoding utf8 .\evidence\tmp-two.txt
$a = @(Select-String -Path .\evidence\tmp-two.txt -Pattern "波形" -SimpleMatch)
Write-Host ("no-AllMatches: lines=" + $a.Count + " Matches=" + $a[0].Matches.Count)
$b = @(Select-String -Path .\evidence\tmp-two.txt -Pattern "波形" -SimpleMatch -AllMatches)
Write-Host ("AllMatches: lines=" + $b.Count + " Matches=" + $b[0].Matches.Count)
$c = Select-String -Path .\evidence\tmp-two.txt -Pattern "波形" -SimpleMatch -AllMatches
Write-Host ("scalar: Matches=" + $c.Matches.Count + " type=" + $c.GetType().Name)
$d = Select-String -Path .\evidence\tmp-two.txt -Pattern "波形" -AllMatches
Write-Host ("regex+AllMatches: Matches=" + $d.Matches.Count)
$PSVersionTable.PSVersion | Out-String | Write-Host
