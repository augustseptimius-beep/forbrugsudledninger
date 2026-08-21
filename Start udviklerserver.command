#!/bin/bash
# Dobbeltklik denne fil for at se siden lokalt.
# Luk terminalvinduet for at stoppe serveren igen.
cd "$(dirname "$0")"
echo "Åbner http://127.0.0.1:8000"
echo "Luk dette vindue for at stoppe serveren."
sleep 1
open http://127.0.0.1:8000
python3 -m http.server 8000 --directory web
