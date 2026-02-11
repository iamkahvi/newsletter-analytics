#!/bin/bash

# Month name → number lookup (portable, no date command needed)
month_to_num() {
  case "$(echo "$1" | tr '[:upper:]' '[:lower:]')" in
    january)   echo "01" ;; february)  echo "02" ;; march)     echo "03" ;;
    april)     echo "04" ;; may)       echo "05" ;; june)      echo "06" ;;
    july)      echo "07" ;; august)    echo "08" ;; september) echo "09" ;;
    october)   echo "10" ;; november)  echo "11" ;; december)  echo "12" ;;
    *) echo "" ;;
  esac
}

# Extract month and year from filenames like "april-2023", "march-2023-on-ai-oh-no",
# "october-2024-extended". Expects first token to be a month name and second to be a 4-digit year.
parse_month_year() {
  local base="$1"
  local mon yr
  # Split on '-' and grab first two tokens
  mon=$(echo "$base" | cut -d'-' -f1)
  yr=$(echo "$base" | cut -d'-' -f2)
  # Validate: month must resolve, year must be 4 digits
  local mm
  mm=$(month_to_num "$mon")
  if [ -z "$mm" ] || ! echo "$yr" | grep -qE '^[0-9]{4}$'; then
    return 1
  fi
  echo "$mm $yr"
}

# 1. Make archive year/month folders under output/
for y in 2022 2023 2024 2025; do
  mkdir -p "output/archive/$y"/{01,02,03,04,05,06,07,08,09,10,11,12}
done

# 2. Move each HTML file to its year/month, then copy-convert
for f in output/html/*.html ; do
  [ -f "$f" ] || continue
  base=$(basename "$f" .html)

  parsed=$(parse_month_year "$base") || {
    echo "Skipping $base: does not match month-year pattern"
    continue
  }
  mm=$(echo "$parsed" | cut -d' ' -f1)
  yr=$(echo "$parsed" | cut -d' ' -f2)

  dest="output/archive/$yr/$mm/$base"
  mv "$f" "$dest.html"
  pandoc "$dest.html" -o "$dest.md"
  pandoc "$dest.html" -t plain -o "$dest.txt"
  echo "Organized: $base -> $yr/$mm/"
done

# 3. Move word lists
mkdir -p output/wordlists && mv top_hundred_*.txt output/wordlists/ 2>/dev/null
