# newsletter-analytics

Backup and analysis pipeline for [newsletter.kahvipatel.com](https://www.newsletter.kahvipatel.com) (Substack).

## Overview

This repo archives Substack newsletter posts and runs content analysis on them. The pipeline has four stages:

1. **Sync** — discover new posts from the Substack RSS feed
2. **Fetch** — download raw HTML from Substack, extract article content via CSS selector
3. **Convert** — transform HTML to markdown and plaintext using pandoc/turndown
4. **Organize** — sort files into `YYYY/MM/` directory structure
5. **Analyze** — run structural and NLP analysis on the markdown corpus

## Prerequisites

- [Bun](https://bun.sh/)
- [htmlq](https://github.com/mgdm/htmlq) — `brew install htmlq`
- [pandoc](https://pandoc.org/) — `brew install pandoc`

## Repository Structure

```
link_list.txt           Master list of all newsletter post URLs
post_id_mapping.csv     Archive newsletter URL to Substack post ID mapping
package.json            Package config with script definitions
scripts/
  sync_links.ts         Discover new posts from Substack RSS feed
  get_text.sh           Batch fetch filtered HTML from Substack
  process_html_to_markdown.ts   Fetch + convert URLs to markdown (supports --output)
  combine_markdown.ts   Generate combined.md from markdown directory
  analyze_markdown.ts   Structural analysis (word counts, links, images, keywords)
  analyze_natural.ts    NLP analysis (sentiment, TF-IDF, readability, bigrams)
  inventory_images.ts   List post-body and archive-cover image assets
  download_images.ts    Download and verify inventoried image originals
  convert_covers_to_jpg.sh Normalize downloaded HEIC/HEIF covers to JPEG
  upload_images_to_r2.sh Upload downloaded originals to Cloudflare R2
  x.ts                  Quick topic extraction from output/combined.md
cleanup.sh              Organize HTML into YYYY/MM/ and convert formats

output/                 All generated files (gitignored)
  html/                 Raw full-page HTML snapshots
  html-no-js/           HTML with JavaScript stripped
  html-filtered/        HTML filtered to article content only
  markdown/             Converted markdown files, organized by year
  text/                 Plaintext versions
  wordlists/            Extracted top nouns, verbs, adjectives, topics, etc.
  archive/              Year/month archived HTML, markdown, and plaintext
  images/
    manifest.json       Structured image inventory and summary
    manifest.csv        Flat image inventory for review
    download-list.tsv   Post-body asset IDs and highest-quality URLs
    cover-download-list.tsv Cover asset IDs and highest-quality URLs
    download-report.json  Post-body download status and verification
    cover-download-report.json Cover download status and verification
    r2-upload-list.tsv  Post-body asset IDs, R2 keys, and public CDN URLs
    r2-covers-upload-list.tsv Cover asset IDs, R2 keys, and public CDN URLs
    r2-check.txt        Post-body rclone verification results
    r2-covers-check.txt Cover rclone verification results
    assets/             Downloaded post-body originals named by asset ID and format
    covers/             Downloaded cover originals named by asset ID and format
  combined.md           Auto-generated combined markdown of all posts
```

## Substack Analytics Export

The newsletter UI also supports Substack delivery/open analytics. Place the Substack export in:

```
substack_data_export/
  posts.csv
  email_list.kahvi.csv
  posts/
    <post_id>.<slug>.html
    <post_id>.delivers.csv
    <post_id>.opens.csv
```

Then run:

```sh
bun run deep-analyze
```

`deep-analyze` now merges the Substack metrics into `output/analysis.json` and `site/analysis.json` under the `substack` key. The site reads that data to render the deliveries/opens/open-rate/subscriber charts in both the overview and comparison pages.

## Usage

### Full pipeline (recommended)

Run sync, fetch, convert, combine, and analyze in one command:

```sh
bun run pipeline
```

Or run individual stages:

```sh
bun run sync        # Discover new posts from RSS
bun run fetch       # Fetch filtered HTML
bun run convert     # Convert to markdown (writes to output/markdown/)
bun run combine     # Generate output/combined.md
bun run organize    # Organize into year/month folders
bun run analyze     # Structural analysis
bun run analyze:nlp # NLP analysis
bun run topics      # Quick topic extraction
bun run inventory-images # Inventory post-body images and archive covers
bun run download-images  # Download and verify post-body images
bun run download-covers  # Download covers, converting HEIC/HEIF to JPEG
bun run upload-images    # Upload post-body originals to Cloudflare R2
bun run upload-covers    # Upload covers to newsletter-assets/covers/
```

### Individual commands

**Sync link list** with Substack RSS feed (appends new posts to `link_list.txt`):

```sh
bun run scripts/sync_links.ts
```

**Batch fetch** filtered HTML for all posts in `link_list.txt`:

```sh
bash scripts/get_text.sh link_list.txt output/html-filtered
```

**Single post** fetch and convert to markdown (outputs to stdout):

```sh
bun run scripts/process_html_to_markdown.ts --mode link https://www.newsletter.kahvipatel.com/p/january-2025
```

**Batch convert** to markdown files (writes to `output/markdown/`):

```sh
bun run scripts/process_html_to_markdown.ts --mode list link_list.txt --output output/markdown
```

Without `--output`, markdown is printed to stdout.

**Generate combined.md** from all markdown files:

```sh
bun run scripts/combine_markdown.ts [directory]
```

Default directory is `output/markdown`. Output is written to `output/combined.md`.

**Organize** into year/month folders:

```sh
bash cleanup.sh
```

Moves HTML files from `output/html/` into `output/archive/YYYY/MM/` directories, then runs pandoc to generate `.md` and `.txt` alongside each `.html`.

**Structural analysis** — word counts, link/domain analysis, image counts, heading structure, keyword extraction via [compromise](https://github.com/spencermountain/compromise):

```sh
bun run scripts/analyze_markdown.ts output/markdown
```

**NLP analysis** — sentiment, TF-IDF, readability, bigrams, vocabulary complexity via [natural](https://github.com/NaturalNode/natural):

```sh
bun run scripts/analyze_natural.ts output/markdown
```

**Quick topic extraction** from combined markdown:

```sh
bun run scripts/x.ts
```

**Inventory post-body image assets and archive covers:**

```sh
bun run inventory-images
```

This reads `substack_data_export/posts/*.html` and paginates the public Substack archive API to inventory both post-body images and each post's `cover_image`. It writes reviewable JSON and CSV manifests to `output/images/`, plus separate headerless download lists for post-body assets and covers. Cover assets are classified as `post-cover`; covers that are also present in a post body are recorded as duplicate references in the manifest, while the cover download list retains them so every cover gets its own file under `output/images/covers/`. It records original and canonical URLs, every `srcset` candidate, Substack `data-attrs`, dimensions, MIME/byte metadata, classifications, and duplicate references. Custom paths and cover behavior are supported:

```sh
bun run scripts/inventory_images.ts --help
```

To inventory only the exported post HTML without making archive API requests, pass `--no-covers`. The archive endpoint and page size can be overridden with `--archive-api` and `--archive-page-size`.

```sh
bun run scripts/inventory_images.ts --input path/to/posts --output path/to/manifests
```

**Download inventoried post-body image originals:**

```sh
bun run download-images
```

The downloader consumes `output/images/download-list.tsv`, saves MIME-detected post-body originals under `output/images/assets/`, and writes `output/images/download-report.json`.

**Download archive-cover originals:**

```sh
bun run download-covers
```

This consumes `output/images/cover-download-list.tsv`, saves covers under `output/images/covers/`, converts any downloaded HEIC/HEIF covers to JPEG, and writes `output/images/cover-download-report.json`. The standalone conversion command is also available as `bun run convert-covers`. The downloader uses bounded concurrency, redirects, timeouts, exponential retries, a per-image size limit, atomic file moves, SHA-256 checksums, hardlink deduplication, and resumable existing-file validation. When `manifest.json` is available, it verifies byte counts, MIME types, URL dimensions, and the largest advertised `srcset` width. Failures or verification warnings produce a non-zero exit status.

Use `--help` to see path and network controls:

```sh
bun run scripts/download_images.ts --help
```

**Upload downloaded post-body originals to Cloudflare R2:**

```sh
bun run upload-images
```

This uses the same `rclone` remote and `~/.config/immich-to-r2.env` configuration as `~/scripts/immich-to-r2.sh`. Post-body files are copied without image processing to `${R2_BUCKET}/newsletter-assets/`, assigned an immutable one-year cache header, and verified with `rclone check`. The generated `output/images/r2-upload-list.tsv` maps asset IDs to R2 keys and public CDN URLs. `SOURCE_DIR`, `R2_PREFIX`, `UPLOAD_LIST`, and `CHECK_REPORT` can be overridden through environment variables.

**Upload downloaded covers to Cloudflare R2:**

```sh
bun run upload-covers
```

This uploads `output/images/covers/` to `${R2_BUCKET}/newsletter-assets/covers/` and writes the cover-specific upload list and verification report to `output/images/r2-covers-upload-list.tsv` and `output/images/r2-covers-check.txt`.

## Known Issues

- **Readability grades may still be approximate.** Markdown is now stripped before computing Flesch-Kincaid, but edge cases (embedded code blocks, unusual formatting) may still affect results.
