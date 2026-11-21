$ownedServers = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
    $_.CommandLine -like ('*' + (Join-Path $PSScriptRoot 'scripts\serve.mjs') + '*')
}
foreach ($server in $ownedServers) { Stop-Process -Id $server.ProcessId }
