// Import required modules
import TurndownService from "turndown";

// Get CLI arguments
const args = Deno.args;
if (args.length < 1) {
  console.error(
    "Usage: deno run --allow-read --allow-write --allow-run process_html_to_markdown.ts <link_file> <output_dir>"
  );
  Deno.exit(1);
}

const filePath = args[0];
const turndownService = new TurndownService();

async function processHtml(filePath: string) {
  try {
    const fileContent = await Deno.readTextFile(filePath);
    const md = turndownService.turndown(fileContent);
    console.log(md);
  } catch (err) {
    console.error("Error:", err);
  }
}

await processHtml(filePath);

// #main > div:nth-child(2) > div
// curl --silent <link> | htmlq  --text "#main > div:nth-child(2) > div > div.container > div > div > article > div:nth-child(4) > div.available-content"
