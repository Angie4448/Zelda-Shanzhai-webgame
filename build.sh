#!/usr/bin/env bash
# 把 parts/ 合并成单文件 index.html（three.js 内联，完全离线可跑）
set -e
cd "$(dirname "$0")"

OUT=index.html
rm -f "$OUT"

cat parts/00_head.html >> "$OUT"
printf '\n<script>\n' >> "$OUT"
cat parts/three.min.js >> "$OUT"
printf '\n</script>\n<script>\n' >> "$OUT"
for f in parts/[0-9][0-9]_*.js; do
  printf '\n/* ===== %s ===== */\n' "$(basename "$f")" >> "$OUT"
  cat "$f" >> "$OUT"
done
printf '\n</script>\n' >> "$OUT"
cat parts/zz_tail.html >> "$OUT"

echo "built $OUT  $(wc -c < "$OUT") bytes  $(wc -l < "$OUT") lines"
