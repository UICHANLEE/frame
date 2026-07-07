#!/bin/bash
cd "$(dirname "$0")"
( sleep 2; open "http://localhost:8778" ) &
python3 server.py
