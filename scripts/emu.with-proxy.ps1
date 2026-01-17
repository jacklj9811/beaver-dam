# Copy to emu.local.ps1 and edit proxy host/port for your machine.

$env:HTTPS_PROXY="http://127.0.0.1:PORT"
$env:HTTP_PROXY="http://127.0.0.1:PORT"

firebase emulators:start --import ./.emulator-data --export-on-exit
