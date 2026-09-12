#!/usr/bin/env bash
# Convert downloaded HEIC/HEIF covers to JPEG in place.
# The JPEG keeps the original asset ID and replaces the source file.

set -euo pipefail

SOURCE_DIR="${SOURCE_DIR:-output/images/covers}"

if [ ! -d "$SOURCE_DIR" ]; then
  echo "Source directory not found: $SOURCE_DIR" >&2
  exit 1
fi

if command -v sips >/dev/null 2>&1; then
  converter="sips"
elif command -v magick >/dev/null 2>&1; then
  converter="magick"
else
  echo "Neither sips nor ImageMagick (magick) is installed" >&2
  exit 1
fi

shopt -s nullglob
sources=("$SOURCE_DIR"/*.[Hh][Ee][Ii][Cc] "$SOURCE_DIR"/*.[Hh][Ee][Ii][Ff])
converted=0

for source in "${sources[@]}"; do
  destination="${source%.*}.jpg"
  temporary="${destination%.jpg}.tmp.jpg"

  rm -f "$temporary"
  if [ "$converter" = "sips" ]; then
    sips -s format jpeg -s formatOptions best "$source" --out "$temporary" >/dev/null
  else
    magick "$source" -quality 95 "$temporary"
  fi

  mv -f "$temporary" "$destination"
  rm -f "$source"
  converted=$((converted + 1))
  echo "Converted $source -> $destination"
done

if [ "$converted" -eq 0 ]; then
  echo "No HEIC/HEIF covers found in $SOURCE_DIR"
else
  echo "Converted $converted cover(s) to JPEG"
fi
