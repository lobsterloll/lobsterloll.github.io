$ids = @(
    'BTHENUM\{00001124-0000-1000-8000-00805F9B34FB}_VID&0002057E_PID&2007\7&CC49CA5&0&9458CB5E44A9_C00000000'
)
$log = 'D:\chatgpt\Codex\nintendoswitchcontrollerfaking\vendor-downloads\restart-joycons.log'
foreach ($id in $ids) {
    $result = & pnputil.exe /restart-device $id 2>&1
    Add-Content -LiteralPath $log -Value $result
    Add-Content -LiteralPath $log -Value "Exit code: $LASTEXITCODE"
}
