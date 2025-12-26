#!/bin/bash
# Helper script to run fpcalc and get the fingerprint

INPUT_FILE=$1
DURATION_FILE=$2

# First, get the duration
DURATION=$(ffprobe -v error -show_entries format=duration -of default=nw=1 "$INPUT_FILE" 2>/dev/null | sed -n 's/duration=//p')

# Run fpcalc to generate fingerprint
fpcalc -length 120 "$INPUT_FILE" > "$DURATION_FILE"

# Append duration to the file
echo "DURATION=$DURATION" >> "$DURATION_FILE"
