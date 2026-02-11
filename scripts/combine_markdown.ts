// Concatenate all .md files in a directory (recursively) into output/combined.md.
// Files are sorted alphabetically by path.
//
// Usage: deno run --allow-read --allow-write scripts/combine_markdown.ts [directory]
// Default directory: output/markdown

import { walk } from "https://deno.land/std/fs/mod.ts";

const dir = Deno.args[0] || "output/markdown";
const outPath = "output/combined.md";

const files: { path: string; name: string }[] = [];
for await (const entry of walk(dir, { exts: [".md"] })) {
  files.push({ path: entry.path, name: entry.name });
}

files.sort((a, b) => a.path.localeCompare(b.path));

const parts: string[] = [];
for (const file of files) {
  const content = await Deno.readTextFile(file.path);
  parts.push(`# ${file.name.replace(/\.md$/, "")}\n\n${content}`);
}

await Deno.writeTextFile(outPath, parts.join("\n\n---\n\n") + "\n");
console.log(`Combined ${files.length} files into ${outPath}`);
