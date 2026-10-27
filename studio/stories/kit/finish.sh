#!/usr/bin/env bash
# Ton und Zusammenbau eines Erklaervideos. Aufruf (im Arbeitsordner des Videos, mit vo.wav, timing.json, frames/):
#   finish.sh <music.mp3> <out_master.mp4> <out_app.mp4> [film.mp4]
# Stimme + Effekte (sfx.py) + Musik (ab 15,6 s, Ducking unter der Stimme, studio/reels/tools/mix_adv.py), Pegel -16 LUFS.
# Mit film.mp4: Bildfolge ist PNG mit Alpha und liegt ueber dem Film (Filmton wird nicht verwendet).
# Ergebnis: Master 1080 x 1920 (CRF 16) und App-Fassung 720 x 1280 (CRF 24, +faststart).
set -euo pipefail
MUS="$1"; MASTER="$2"; APP="$3"; FILM="${4:-}"
K="$(cd "$(dirname "$0")" && pwd)"; TOOLS="$K/../../reels/tools"
D=$(python3 -I -c "import json;print(json.load(open('timing.json'))['TOTAL'])")
python3 -I "$K/sfx.py" timing.json sfx.wav
ffmpeg -v error -y -ss 15.6 -t "$(python3 -I -c "print($D+3)")" -i "$MUS" -ar 48000 -ac 2 music_slice.wav
python3 -I "$TOOLS/mix_adv.py" timing.json vo.wav sfx.wav music_slice.wav mixraw.wav 1.0
L=$(ffmpeg -nostats -i mixraw.wav -af ebur128 -f null - 2>&1 | grep -A12 Summary | grep -E "^\s+I:" | awk '{print $2}')
G=$(python3 -I -c "print(round(-16-($L),2))")
ffmpeg -v error -y -i mixraw.wav -af "volume=${G}dB,alimiter=limit=0.89:level=disabled" -ar 48000 mix.wav
if [ -n "$FILM" ]; then
  ffmpeg -v error -y -f lavfi -i "color=c=0x08080a:s=1080x1920:r=30:d=$D" -i "$FILM" -framerate 30 -i frames/f%05d.png -i mix.wav \
    -filter_complex "[1:v]fps=30,scale=1080:1920,setpts=PTS-STARTPTS[fm];[0:v][fm]overlay=eof_action=pass[b];[2:v]format=rgba[ov];[b][ov]overlay=0:0,format=yuv420p[v]" \
    -map "[v]" -map 3:a -t "$D" -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart "$MASTER"
else
  ffmpeg -v error -y -framerate 30 -i frames/f%05d.jpg -i mix.wav -map 0:v -map 1:a -t "$D" \
    -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart "$MASTER"
fi
ffmpeg -v error -y -i "$MASTER" -vf "scale=720:1280:flags=lanczos" -c:v libx264 -preset slow -crf 24 -profile:v high -pix_fmt yuv420p \
  -c:a aac -b:a 128k -movflags +faststart "$APP"
ls -la "$MASTER" "$APP"
