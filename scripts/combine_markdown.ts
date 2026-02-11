// Concatenate all .md files in a directory (recursively) into output/combined.md.
// Files are sorted chronologically by date parsed from filename.
//
// Usage: bun run scripts/combine_markdown.ts [directory]
// Default directory: output/markdown

import { readdir } from "node:fs/promises";
import { join } from "node:path";

const months: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function dateFromFilename(name: string): Date {
  const m = name.match(/^([a-z]+)-(\d{4}).*\.md$/i);
  if (!m) return new Date(0);
  const firstMonth = m[1].match(/^(january|february|march|april|may|june|july|august|september|october|november|december)/i);
  if (!firstMonth) return new Date(0);
  const num = months[firstMonth[1].toLowerCase()];
  return new Date(`${m[2]}-${String(num).padStart(2, "0")}-01`);
}

const dir = process.argv[2] || "output/markdown";
const outPath = "output/combined.md";

const entries = await readdir(dir, { withFileTypes: true, recursive: true });
const files = entries
  .filter((e) => e.isFile() && e.name.endsWith(".md"))
  .map((e) => ({ path: join(e.parentPath ?? e.path, e.name), name: e.name }))
  .sort((a, b) => dateFromFilename(a.name).getTime() - dateFromFilename(b.name).getTime());

const parts: string[] = [];
for (const file of files) {
  const content = await Bun.file(file.path).text();
  parts.push(`# ${file.name.replace(/\.md$/, "")}\n\n${content}`);
}

await Bun.write(outPath, parts.join("\n\n---\n\n") + "\n");
console.log(`Combined ${files.length} files into ${outPath}`);
