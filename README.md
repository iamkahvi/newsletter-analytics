# newsletter_backup

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
package.json            Package config with script definitions
scripts/
  sync_links.ts         Discover new posts from Substack RSS feed
  get_text.sh           Batch fetch filtered HTML from Substack
  process_html_to_markdown.ts   Fetch + convert URLs to markdown (supports --output)
  combine_markdown.ts   Generate combined.md from markdown directory
  analyze_markdown.ts   Structural analysis (word counts, links, images, keywords)
  analyze_natural.ts    NLP analysis (sentiment, TF-IDF, readability, bigrams)
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
  combined.md           Auto-generated combined markdown of all posts
```

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

## Known Issues

- **Readability grades may still be approximate.** Markdown is now stripped before computing Flesch-Kincaid, but edge cases (embedded code blocks, unusual formatting) may still affect results.
