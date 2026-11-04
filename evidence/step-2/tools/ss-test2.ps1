$short = ('a' * 1000) + '引导' + "`n" + ('b' * 500) + '设置'
[System.IO.File]::WriteAllText("$PWD\evidence\tmp-shortline.txt", $short, (New-Object System.Text.UTF8Encoding($true)))
$h1 = @(Select-String -Path .\evidence\tmp-shortline.txt -Pattern '引导' -SimpleMatch -AllMatches)
Write-Host ("short-file 引导 lines=" + $h1.Count)

$long1 = ('a' * 200000) + '引导'
[System.IO.File]::WriteAllText("$PWD\evidence\tmp-longline.txt", $long1, (New-Object System.Text.UTF8Encoding($true)))
$h2 = @(Select-String -Path .\evidence\tmp-longline.txt -Pattern '引导' -SimpleMatch -AllMatches)
Write-Host ("long-line 引导 lines=" + $h2.Count)

$two = ('a' * 200000) + "`n" + '引导'
[System.IO.File]::WriteAllText("$PWD\evidence\tmp-longline2.txt", $two, (New-Object System.Text.UTF8Encoding($true)))
$h3 = @(Select-String -Path .\evidence\tmp-longline2.txt -Pattern '引导' -SimpleMatch -AllMatches)
Write-Host ("long-line-then-target 引导 lines=" + $h3.Count)
