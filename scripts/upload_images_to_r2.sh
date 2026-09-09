#!/usr/bin/env bash
# Upload downloaded newsletter image originals to Cloudflare R2.
# Uses the same rclone configuration as ~/scripts/immich-to-r2.sh.

set -euo pipefail

[ -f "${HOME}/.config/immich-to-r2.env" ] && source "${HOME}/.config/immich-to-r2.env"

SOURCE_DIR="${SOURCE_DIR:-output/images/assets}"
R2_REMOTE="${R2_REMOTE:-r2}"
: "${R2_BUCKET:?set R2_BUCKET}"
R2_PREFIX="${R2_PREFIX:-newsletter-assets}"
: "${PUBLIC_BASE_URL:?set PUBLIC_BASE_URL}"
UPLOAD_LIST="${UPLOAD_LIST:-output/images/r2-upload-list.tsv}"
CHECK_REPORT="${CHECK_REPORT:-output/images/r2-check.txt}"

R2_PREFIX="${R2_PREFIX#/}"
R2_PREFIX="${R2_PREFIX%/}"
DESTINATION="${R2_REMOTE}:${R2_BUCKET}/${R2_PREFIX}"

if [ ! -d "$SOURCE_DIR" ]; then
  echo "Source directory not found: $SOURCE_DIR" >&2
  exit 1
fi

file_count="$(find "$SOURCE_DIR" -type f | wc -l | tr -d ' ')"
if [ "$file_count" -eq 0 ]; then
  echo "No files found in $SOURCE_DIR" >&2
  exit 1
fi

mkdir -p "$(dirname "$UPLOAD_LIST")" "$(dirname "$CHECK_REPORT")"

echo "Uploading ${file_count} originals from ${SOURCE_DIR} to ${DESTINATION}"
rclone copy "$SOURCE_DIR" "$DESTINATION" \
  --checksum \
  --transfers 8 \
  --checkers 16 \
  --exclude '*.heic' \
  --exclude '*.heif' \
  --header-upload "Cache-Control: public, max-age=31536000, immutable" \
  --progress

# rclone's MIME database does not recognize HEIC/HEIF, so upload those files
# separately with an explicit Content-Type instead of application/octet-stream.
while IFS= read -r path; do
  relative_path="${path#${SOURCE_DIR}/}"
  case "${path##*.}" in
    heic|HEIC) content_type="image/heic" ;;
    heif|HEIF) content_type="image/heif" ;;
    *) continue ;;
  esac
  rclone copyto "$path" "${DESTINATION}/${relative_path}" \
    --ignore-times \
    --header-upload "Cache-Control: public, max-age=31536000, immutable" \
    --header-upload "Content-Type: ${content_type}" \
    --quiet
done < <(find "$SOURCE_DIR" -type f \( -iname '*.heic' -o -iname '*.heif' \) | LC_ALL=C sort)

echo "Verifying uploaded objects"
rclone check "$SOURCE_DIR" "$DESTINATION" \
  --one-way \
  --checkers 16 \
  --combined "$CHECK_REPORT"

: > "$UPLOAD_LIST"
while IFS= read -r path; do
  filename="${path#${SOURCE_DIR}/}"
  key="${R2_PREFIX}/${filename}"
  printf '%s\t%s\t%s/%s\n' \
    "${filename%.*}" \
    "$key" \
    "${PUBLIC_BASE_URL%/}" \
    "$key" >> "$UPLOAD_LIST"
done < <(find "$SOURCE_DIR" -type f | LC_ALL=C sort)

remote_count="$(rclone lsf --recursive --files-only "$DESTINATION" | wc -l | tr -d ' ')"
if [ "$remote_count" -lt "$file_count" ]; then
  echo "Remote contains ${remote_count} files; expected at least ${file_count}" >&2
  exit 1
fi

echo "Uploaded and verified ${file_count} files"
echo "Wrote ${UPLOAD_LIST}"
echo "Wrote ${CHECK_REPORT}"
