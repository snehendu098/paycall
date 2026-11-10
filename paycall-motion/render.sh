#!/bin/sh
# render every composition → ../client/public/motion/{id}.{webm,mp4,png}
set -e
OUT=../client/public/motion
mkdir -p "$OUT"
for c in ${ONLY:-buyers:58 sellers:20 steps:90}; do
  id=${c%%:*}; poster=${c##*:}
  bunx remotion render src/index.ts "$id" "$OUT/$id.webm" --codec=vp9 --crf=${VP9_CRF:-36}
  bunx remotion render src/index.ts "$id" "$OUT/$id.mp4" --codec=h264 --crf=${H264_CRF:-23} --pixel-format=yuv420p
  bunx remotion still src/index.ts "$id" "$OUT/$id.png" --frame="$poster"
done
ls -lh "$OUT"
