// Import required modules
import TurndownService from "turndown";
import { parseArgs } from "@std/cli/parse-args";

// Usage: deno run --allow-run process_html_to_markdown.ts --mode link https://example.com
// Usage: deno run --allow-run process_html_to_markdown.ts --mode list links.txt

const Mode = {
  LIST: "list",
  LINK: "link",
} as const;

// Get CLI arguments
const args = parseArgs(Deno.args);

const { mode } = args;

if (![Mode.LIST, Mode.LINK].includes(mode)) {
  console.log("Invalid mode");
  Deno.exit(1);
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
    lines.forEach((line) => {
      // validate link is a URL
      if (!validateUrl(line)) {
        console.error(`Invalid URL: ${line}`);
        return;
      }
      processUrlToMarkdown(line).then((md) => {
        console.log(md);
      });
    });
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

    processUrlToMarkdown(args._[0]).then((md) => {
      console.log(md);
    });
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

const turndownService = new TurndownService();

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

  const selector =
    "#main > div:nth-child(2) > div > div.container > div > div > article > div:nth-child(4) > div.available-content";
  const selectedHtml = await selectHtml(html, selector);

  const md = turndownService.turndown(selectedHtml);

  return md;
}

function validateUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
}
