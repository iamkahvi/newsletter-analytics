// fetch_metadata.ts -- scrapes posted_date and subject_line from each newsletter post
// Reads link_list.txt, fetches JSON-LD from each page, writes output/metadata.json
//
// Usage: bun run scripts/fetch_metadata.ts

import { readFile, mkdir } from "node:fs/promises";

const LINK_LIST = "link_list.txt";
const OUTPUT = "output/metadata.json";
const BATCH_SIZE = 5;
const TIMEOUT = 10000;

interface PostMetadata {
  slug: string;
  filename: string;
  url: string;
  postedDate: string | null;
  subjectLine: string | null;
  subtitle: string | null;
}

function slugToFilename(slug: string): string {
  return `${slug}.md`;
}

async function fetchPostMetadata(url: string): Promise<{
  postedDate: string | null;
  subjectLine: string | null;
  subtitle: string | null;
}> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      console.warn(`  ${url}: HTTP ${res.status}`);
      return { postedDate: null, subjectLine: null, subtitle: null };
    }

    const html = await res.text();

    // Extract JSON-LD script blocks
    const jsonLdBlocks = html.matchAll(
      /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
    );

    let postedDate: string | null = null;
    let subjectLine: string | null = null;
    let subtitle: string | null = null;

    for (const match of jsonLdBlocks) {
      try {
        const data = JSON.parse(match[1]);
        if (data.datePublished) {
          postedDate = data.datePublished;
        }
        if (data.headline) {
          subjectLine = data.headline;
        }
        if (data.description) {
          subtitle = data.description;
        }
      } catch {
        // malformed JSON-LD, skip
      }
    }

    // Fallback: try og:title meta tag
    if (!subjectLine) {
      const ogTitle = html.match(
        /<meta[^>]*property="og:title"[^>]*content="([^"]*)"[^>]*>/i
      );
      if (ogTitle) subjectLine = ogTitle[1];
    }

    // Fallback: try article:published_time meta tag
    if (!postedDate) {
      const ogDate = html.match(
        /<meta[^>]*property="article:published_time"[^>]*content="([^"]*)"[^>]*>/i
      );
      if (ogDate) postedDate = ogDate[1];
    }

    return { postedDate, subjectLine, subtitle };
  } catch (err) {
    console.warn(`  ${url}: ${(err as Error).message}`);
    return { postedDate: null, subjectLine: null, subtitle: null };
  }
}

async function main() {
  const links = (await readFile(LINK_LIST, "utf-8"))
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  console.log(`Fetching metadata for ${links.length} posts...`);

  const results: PostMetadata[] = [];

  for (let i = 0; i < links.length; i += BATCH_SIZE) {
    const batch = links.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (url) => {
      const slug = url.split("/p/")[1] || url.split("/").pop() || "";
      const filename = slugToFilename(slug);
      console.log(`  ${filename}`);
      const meta = await fetchPostMetadata(url);
      results.push({
        slug,
        filename,
        url,
        postedDate: meta.postedDate,
        subjectLine: meta.subjectLine,
        subtitle: meta.subtitle,
      });
    });
    await Promise.all(promises);
  }

  // Sort by posted date where available, then by slug
  results.sort((a, b) => {
    if (a.postedDate && b.postedDate) return a.postedDate.localeCompare(b.postedDate);
    if (a.postedDate) return -1;
    if (b.postedDate) return 1;
    return a.slug.localeCompare(b.slug);
  });

  await mkdir("output", { recursive: true });
  await Bun.write(OUTPUT, JSON.stringify(results, null, 2));
  console.log(`\nWrote ${OUTPUT} (${results.length} posts)`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
