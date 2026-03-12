// Import required modules
import { Defuddle } from "defuddle/node";
import { JSDOM } from "jsdom";
import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";

// Usage: bun run scripts/process_html_to_markdown.ts --mode link https://example.com
// Usage: bun run scripts/process_html_to_markdown.ts --mode list links.txt
// Usage: bun run scripts/process_html_to_markdown.ts --mode list links.txt --output output/markdown

const Mode = {
  LIST: "list",
  LINK: "link",
} as const;

// Get CLI arguments
const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    mode: { type: "string" },
    output: { type: "string" },
  },
  allowPositionals: true,
});

const { mode, output } = values;

if (![Mode.LIST, Mode.LINK].includes(mode as string)) {
  console.log("Invalid mode");
  process.exit(1);
}

function slugFromUrl(url: string): string {
  const u = new URL(url);
  const slug = u.pathname.split("/").filter(Boolean).pop() || "output";
  return slug.replace(/[^a-zA-Z0-9_-]/g, "_");
}

async function writeOrPrint(md: string, url: string) {
  if (output) {
    await mkdir(output, { recursive: true });
    const filename = `${slugFromUrl(url)}.md`;
    const path = `${output}/${filename}`;
    await Bun.write(path, md);
    console.log(`Written: ${path}`);
  } else {
    console.log(md);
  }
}

switch (mode) {
  case Mode.LIST: {
    console.log("List mode");
    if (positionals.length < 1 || typeof positionals[0] !== "string") {
      console.error(
        "Usage: bun run process_html_to_markdown.ts --mode list <file>"
      );
      process.exit(1);
    }
    const lines = getLinesFromFile(positionals[0]);
    for (const line of lines) {
      if (!validateUrl(line)) {
        if (line.length > 0) console.error(`Invalid URL: ${line}`);
        continue;
      }
      const md = await processUrlToMarkdown(line);
      await writeOrPrint(md, line);
    }
    break;
  }
  case Mode.LINK: {
    console.log("Link mode");
    if (positionals.length < 1 || typeof positionals[0] !== "string") {
      console.error(
        "Usage: bun run process_html_to_markdown.ts --mode link <link>"
      );
      process.exit(1);
    }

    // validate link is a URL
    if (!validateUrl(positionals[0])) {
      console.error(`Invalid URL: ${positionals[0]}`);
      process.exit(1);
    }

    const md = await processUrlToMarkdown(positionals[0]);
    await writeOrPrint(md, positionals[0]);
    break;
  }
  default:
    console.log("Invalid mode");
    process.exit(1);
}

function getLinesFromFile(filePath: string): string[] {
  const file = readFileSync(filePath, "utf-8");
  return file.split("\n").map((line) => line.trim());
}

async function processUrlToMarkdown(url: string): Promise<string> {
  const response = await fetch(url);
  const html = await response.text();
  const dom = new JSDOM(html, { url });
  const result = await Defuddle(dom, url, { markdown: true });
  return result.content;
}

function validateUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch (_e) {
    return false;
  }
}
