#!/bin/bash
cd "$(dirname "$0")/dist"
python3 -m http.server 1420

