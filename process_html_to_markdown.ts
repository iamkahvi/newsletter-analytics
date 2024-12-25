// Import required modules
import TurndownService from "turndown";

// Get CLI arguments
const args = Deno.args;
// if (args.length < 1) {
//   console.error(
//     "Usage: deno run --allow-read --allow-write --allow-run process_html_to_markdown.ts <input_dir> <output_dir>"
//   );
//   Deno.exit(1);
// }


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

const inputUrl = args[0];

const html = await getHtml(inputUrl);

const selector =
  "#main > div:nth-child(2) > div > div.container > div > div > article > div:nth-child(4) > div.available-content";
const selectedHtml = await selectHtml(html, selector);

const md = turndownService.turndown(selectedHtml);

console.log(md);
