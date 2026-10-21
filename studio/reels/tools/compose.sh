#!/usr/bin/env bash
# Aufruf: compose_adv.sh <a|b> <frames-dir> <audio.wav> <out.mp4> <timing.json> [clip1.mp4 clip2.mp4]
# Basis: schwarzer Grund (Variante B: dazu KI-Clips in den Fenstern TM.clips), darüber die transparente Grafikebene, dann Ton.
set -euo pipefail
V="$1"; FR="$2"; AUD="$3"; OUT="$4"; TJ="$5"; C1="${6:-}"; C2="${7:-}"
D=$(python3 -I -c "import json;print(json.load(open('$TJ'))['TOTAL'])")
W=($(python3 -I -c "import json;[print(a,b) for a,b in json.load(open('$TJ'))['TM']['clips']]"))
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
if [ "$V" = "b" ]; then
  IN=(); FC="color=c=0x08080a:s=1080x1920:r=30:d=$D[bg]"; k=0; last="bg"
  for f in "${@:6}"; do
    [ -z "$f" ] && continue
    a="${W[$((k*2))]}"; b="${W[$((k*2+1))]}"; len=$(python3 -I -c "print(round($b-$a,3))")
    ss=0; case "$f" in *@*) ss="${f##*@}"; f="${f%@*}";; esac
    IN+=(-i "$f")
    FC="$FC;[$k:v]fps=30,scale=-2:1920:flags=lanczos,crop=1080:1920,eq=saturation=0.92:brightness=-0.02,tpad=stop_mode=clone:stop_duration=3,trim=start=$ss:duration=$len,setpts=PTS-STARTPTS+$a/TB[c$k];[$last][c$k]overlay=eof_action=pass:enable='between(t,$a,$b)'[o$k]"
    last="o$k"; k=$((k+1))
  done
  ffmpeg -v error -y "${IN[@]}" -filter_complex "$FC" -map "[$last]" -t "$D" -c:v libx264 -crf 12 -preset fast -pix_fmt yuv420p "$TMP/base.mp4"
else
  ffmpeg -v error -y -f lavfi -i "color=c=0x08080a:s=1080x1920:r=30:d=$D" -c:v libx264 -crf 12 -pix_fmt yuv420p "$TMP/base.mp4"
fi
ffmpeg -v error -y -i "$TMP/base.mp4" -framerate 30 -i "$FR/f%05d.png" -i "$AUD" \
  -filter_complex "[1:v]format=rgba[ov];[0:v][ov]overlay=0:0:format=auto,format=yuv420p[v]" -map "[v]" -map 2:a \
  -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -r 30 -c:a aac -b:a 192k -ar 48000 -movflags +faststart -t "$D" "$OUT"
