#!/usr/bin/env bash
# Mischt auf -14,2 LUFS und begrenzt Spitzen. Aufruf: finalize_audio.sh mixraw.wav mix.wav
set -euo pipefail
IN="$1"; OUT="$2"
L=$(ffmpeg -nostats -i "$IN" -af ebur128=peak=true -f null - 2>&1 | grep -A12 "Summary" | grep -E "^\s+I:" | awk '{print $2}')
G=$(python3 -I -c "print(round(-14.2-($L),2))")
ffmpeg -v error -y -i "$IN" -af "volume=${G}dB,alimiter=limit=0.89:level=disabled" -ar 48000 "$OUT"
ffmpeg -nostats -i "$OUT" -af ebur128=peak=true -f null - 2>&1 | grep -A12 Summary | grep -E "I:"
