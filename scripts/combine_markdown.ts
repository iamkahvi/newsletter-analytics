// Concatenate all .md files in a directory (recursively) into output/combined.md.
// Files are sorted alphabetically by path.
//
// Usage: bun run scripts/combine_markdown.ts [directory]
// Default directory: output/markdown

import { readdir } from "node:fs/promises";
import { join } from "node:path";

const dir = process.argv[2] || "output/markdown";
const outPath = "output/combined.md";

const entries = await readdir(dir, { withFileTypes: true, recursive: true });
const files = entries
  .filter((e) => e.isFile() && e.name.endsWith(".md"))
  .map((e) => ({ path: join(e.parentPath ?? e.path, e.name), name: e.name }))
  .sort((a, b) => a.path.localeCompare(b.path));

const parts: string[] = [];
for (const file of files) {
  const content = await Bun.file(file.path).text();
  parts.push(`# ${file.name.replace(/\.md$/, "")}\n\n${content}`);
}

await Bun.write(outPath, parts.join("\n\n---\n\n") + "\n");
console.log(`Combined ${files.length} files into ${outPath}`);
