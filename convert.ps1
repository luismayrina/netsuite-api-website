$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$file = "C:\dev\netsuite-api-website\Sample SOA 03.31.25.xls"
Write-Host "Opening $file"
$wb = $excel.Workbooks.Open($file)
$outFile = "C:\dev\netsuite-api-website\template.xlsx"
Write-Host "Saving as $outFile"
$wb.SaveAs($outFile, 51)
$wb.Close()
$excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
Write-Host "Done"
