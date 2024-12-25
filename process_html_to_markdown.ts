// Import required modules
import TurndownService from "turndown";

// Get CLI arguments
const args = Deno.args;
if (args.length < 1) {
  console.error(
    "Usage: deno run --allow-read --allow-write --allow-run process_html_to_markdown.ts <input_dir> <output_dir>"
  );
  Deno.exit(1);
}

const inputDir = args[0];
const outputDir = args[1];

const turndownService = new TurndownService();

async function processHtml(inputDir: string, outputDir: string) {
  for await (const entry of Deno.readDir(inputDir)) {
    const fullPath = `${inputDir}/${entry.name}`;
    if (entry.isDirectory) {
      // Recursively read subdirectories
      throw Error("Not implemented");
    } else if (entry.isFile) {
      // Read and process the file
      try {
        const fileContent = await Deno.readTextFile(fullPath);
        console.log(`Content of ${fullPath}:\n${fileContent}\n`);
        const md = turndownService.turndown(fileContent);
        const filePath = `${outputDir}/${entry.name.replace(".html", ".md")}`;
        await Deno.writeTextFile(filePath, md);
        console.log(md);
      } catch (err) {
        console.error("Error:", err);
      }
    }
  }
}

await processHtml(inputDir, outputDir);

// #main > div:nth-child(2) > div
// curl --silent <link> | htmlq  --text "#main > div:nth-child(2) > div > div.container > div > div > article > div:nth-child(4) > div.available-content"
