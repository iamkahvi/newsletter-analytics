# newsletter_backup

Backup and analysis pipeline for [newsletter.kahvipatel.com](https://www.newsletter.kahvipatel.com) (Substack).

## Overview

This repo archives Substack newsletter posts and runs content analysis on them. The pipeline has four stages:

1. **Fetch** — download raw HTML from Substack, extract article content via CSS selector
2. **Convert** — transform HTML to markdown and plaintext using pandoc/turndown
3. **Organize** — sort files into `YYYY/MM/` directory structure
4. **Analyze** — run structural and NLP analysis on the markdown corpus

Currently tracks 32 posts from December 2022 through early 2025.

## Prerequisites

- [Deno](https://deno.land/)
- [htmlq](https://github.com/mgdm/htmlq) — `brew install htmlq`
- [pandoc](https://pandoc.org/) — `brew install pandoc`

## Repository Structure

```
link_list.txt           Master list of all newsletter post URLs (32 entries)
scripts/
  get_text.sh           Batch fetch filtered HTML from Substack
  process_html_to_markdown.ts   Fetch + convert single/multiple URLs to markdown
  analyze_markdown.ts   Structural analysis (word counts, links, images, keywords)
  analyze_natural.ts    NLP analysis (sentiment, TF-IDF, readability, bigrams)
  x.ts                  Quick topic extraction from combined.md
cleanup.sh              Organize HTML into YYYY/MM/ and convert formats

html-ouput/             Raw full-page HTML snapshots (~500MB)
html-ouput-no-js/       HTML with JavaScript stripped
filtered-html-output/   HTML filtered to article content only
filtered-md-output/     Converted markdown files, organized by year
text-output/            Plaintext versions
wordlists/              Extracted top nouns, verbs, adjectives, topics, etc.
2022-2025/              Year/month archived HTML, markdown, and plaintext
```

## Usage

### Step 1: Fetch HTML from Substack

**Batch fetch** filtered HTML for all posts in `link_list.txt`:

```sh
bash scripts/get_text.sh link_list.txt filtered-html-output
```

This curls each URL, pipes through `htmlq` to extract the article content, and saves as `.html`.

**Single post** fetch and convert to markdown (outputs to stdout):

```sh
deno run --allow-run --allow-read --allow-net scripts/process_html_to_markdown.ts --mode link https://www.newsletter.kahvipatel.com/p/january-2025
```

**Batch convert** all URLs in a file to markdown (outputs to stdout):

```sh
deno run --allow-run --allow-read --allow-net scripts/process_html_to_markdown.ts --mode list link_list.txt
```

### Step 2: Organize into year/month folders

```sh
bash cleanup.sh
```

Moves HTML files from `html-ouput/` into `YYYY/MM/` directories, then runs pandoc to generate `.md` and `.txt` alongside each `.html`.

### Step 3: Structural analysis

Word counts, link/domain analysis, image counts, heading structure, keyword extraction via [compromise](https://github.com/spencermountain/compromise):

```sh
deno run --allow-read --no-lock scripts/analyze_markdown.ts filtered-md-output/2024
```

Pass any directory of `.md` files. `--no-lock` is needed due to a stale lockfile entry for the compromise dependency.

**Output includes:**
- Total/average word counts per post
- Top 10 referenced domains
- Image statistics
- Heading structure (H1-H6 breakdown)
- Top 20 keywords with occurrence counts
- Monthly trends (words, images, links per month)

### Step 4: NLP analysis

Sentiment, TF-IDF, readability, bigrams, vocabulary complexity via [natural](https://github.com/NaturalNode/natural):

```sh
deno run --allow-read --allow-env scripts/analyze_natural.ts filtered-md-output/2024
```

**Output includes:**
- Corpus statistics (total/unique words, averages)
- Most common words and bigrams (stopwords excluded)
- TF-IDF important terms per document
- Flesch-Kincaid readability grade level
- Sentiment scores (AFINN lexicon)
- Vocabulary complexity and diversity ratio
- Content evolution across time windows

### Quick topic extraction

Extract top topics from a combined markdown file:

```sh
deno run --allow-read --no-lock scripts/x.ts
```

Reads `combined.md` and outputs topic frequency counts.

## Known Issues

- **CSS selector is broken.** Both `get_text.sh` and `process_html_to_markdown.ts` use a deeply-nested CSS selector (`#main > div:nth-child(2) > ...`) that no longer matches Substack's current page structure. The simpler selector `.available-content` works as of February 2025.
- **`cleanup.sh` fails on macOS.** Uses `date -d` (GNU coreutils), which does not exist on macOS. Replace with `date -j -f '%B' "$mon" +%m` or install GNU coreutils (`brew install coreutils` and use `gdate`).
- **`process_html_to_markdown.ts` has dead code.** The `md.replace()` calls on lines 114-115 don't mutate — strings are immutable. Should be `md = md.replace(...)`.
- **TF-IDF output is noisy.** The top terms per document are mostly stopwords ("the", "i", "to", "a") because the TF-IDF tokenizer isn't filtering them out.
- **Readability grades are wildly inflated.** Flesch-Kincaid reports grades like 288 and 3139, suggesting the sentence segmentation is failing on markdown formatting artifacts.

## Improvements to Consider

- **Fix the CSS selector.** Update both `get_text.sh` and `process_html_to_markdown.ts` to use `.available-content` (or `.body.markup` for just the body text). This is the most urgent fix — fetching is currently non-functional.
- **Fix `cleanup.sh` for macOS.** Replace `date -d` with a portable alternative, or rewrite in Deno for consistency with the rest of the scripts.
- **Add `--output` flag to `process_html_to_markdown.ts`.** Currently outputs to stdout only. Writing directly to files (with automatic naming from the URL slug) would make batch processing more useful.
- **Filter stopwords from TF-IDF.** The `analyze_natural.ts` script already filters stopwords for word frequency but not for TF-IDF extraction. Apply the same stopword list to get meaningful terms.
- **Fix readability calculation.** The Flesch-Kincaid implementation is likely choking on markdown syntax (links, image tags, heading markers). Strip markdown formatting before computing readability.
- **Automate the full pipeline.** A single `deno task` or Makefile that runs fetch -> convert -> organize -> analyze would reduce manual steps.
- **Add 2025 posts.** `link_list.txt` only has January and February 2025. Could auto-discover new posts via the Substack RSS feed at `newsletter.kahvipatel.com/feed`.
- **Deduplicate `combined.md`.** It's a manually-created aggregate of 2024 posts. Could be auto-generated from the markdown files in a directory.
- **Rename `html-ouput` to `html-output`.** Typo in the directory name.
