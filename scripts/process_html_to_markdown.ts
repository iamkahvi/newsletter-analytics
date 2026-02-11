// Import required modules
import TurndownService from "turndown";
import { parseArgs } from "@std/cli/parse-args";

// Usage: deno run --allow-run --allow-read --allow-net scripts/process_html_to_markdown.ts --mode link https://example.com
// Usage: deno run --allow-run --allow-read --allow-net scripts/process_html_to_markdown.ts --mode list links.txt
// Usage: deno run --allow-run --allow-read --allow-write --allow-net scripts/process_html_to_markdown.ts --mode list links.txt --output output/markdown

const Mode = {
  LIST: "list",
  LINK: "link",
} as const;

// Get CLI arguments
const args = parseArgs(Deno.args);

const { mode, output } = args;

const turndownService = new TurndownService();

if (![Mode.LIST, Mode.LINK].includes(mode)) {
  console.log("Invalid mode");
  Deno.exit(1);
}

function slugFromUrl(url: string): string {
  const u = new URL(url);
  const slug = u.pathname.split("/").filter(Boolean).pop() || "output";
  return slug.replace(/[^a-zA-Z0-9_-]/g, "_");
}

async function writeOrPrint(md: string, url: string) {
  if (output) {
    await Deno.mkdir(output, { recursive: true });
    const filename = `${slugFromUrl(url)}.md`;
    const path = `${output}/${filename}`;
    await Deno.writeTextFile(path, md);
    console.log(`Written: ${path}`);
  } else {
    console.log(md);
  }
}

switch (mode) {
  case Mode.LIST: {
    console.log("List mode");
    if (args._.length < 1 || typeof args._[0] !== "string") {
      console.error(
        "Usage: deno run --allow-read process_html_to_markdown.ts --mode list <file>"
      );
      Deno.exit(1);
    }
    const lines = getLinesFromFile(args._[0]);
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
    if (args._.length < 1 || typeof args._[0] !== "string") {
      console.error(
        "Usage: deno run --allow-run process_html_to_markdown.ts --mode link <link>"
      );
      Deno.exit(1);
    }

    // validate link is a URL
    if (!validateUrl(args._[0])) {
      console.error(`Invalid URL: ${args._[0]}`);
      Deno.exit(1);
    }

    const md = await processUrlToMarkdown(args._[0]);
    await writeOrPrint(md, args._[0]);
    break;
  }
  default:
    console.log("Invalid mode");
    Deno.exit(1);
}

function getLinesFromFile(filePath: string): string[] {
  const file = Deno.readTextFileSync(filePath);
  return file.split("\n").map((line) => line.trim());
}

async function getHtml(link: string) {
  const command = new Deno.Command("curl", {
    args: ["--silent", link],
  });
  const output = await command.output();
  return new TextDecoder().decode(output.stdout);
}

async function selectHtml(html: string, selector: string) {
  const htmlqCommand = new Deno.Command("htmlq", {
    args: [selector],
    stdin: "piped",
    stdout: "piped",
  });
  const htmlqProcess = htmlqCommand.spawn();

  const writer = htmlqProcess.stdin.getWriter();
  await writer.write(new TextEncoder().encode(html));
  writer.close();

  const htmlqOutput = await htmlqProcess.output();
  return new TextDecoder().decode(htmlqOutput.stdout);
}

async function processUrlToMarkdown(url: string): Promise<string> {
  const html = await getHtml(url);

  const selector = ".available-content";
  const selectedHtml = await selectHtml(html, selector);

  let md = turndownService.turndown(selectedHtml);

  // Clean up image links wrapped in markdown link syntax
  md = md.replace(/^\s+\[\n+(\n\s+!\[\]\(.*\))\s+\]\(.*\)/gm, "$1");
  md = md.replace(/\[\n+(!\[\]\(.*\))\n+\]\(.*\)/g, "$1");

  return md;
}

function validateUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch (_e) {
    return false;
  }
}
