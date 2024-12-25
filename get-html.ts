// Import required modules
import { readLines } from "https://deno.land/std@0.123.0/io/mod.ts";

// Get CLI arguments
const args = Deno.args;
if (args.length < 2) {
  console.error(
    "Usage: deno run --allow-read --allow-write --allow-run monolith.ts <link_file> <output_dir>",
  );
  Deno.exit(1);
}

const filePath = args[0];
const outputDir = args[1];

// Ensure the output directory exists
await Deno.mkdir(outputDir, { recursive: true });

async function streamToString(
  stream: ReadableStream<Uint8Array>,
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = "";
  let done = false;

  while (!done) {
    const { value, done: streamDone } = await reader.read();
    done = streamDone;
    if (value) {
      result += decoder.decode(value, { stream: true });
    }
  }

  return result;
}

async function processLinks(filePath: string) {
  try {
    const file = await Deno.open(filePath);

    // Iterate over each line in the file
    for await (const link of readLines(file)) {
      if (link.trim()) {
        const fileName = link.split("/").pop() + ".html";
        const outputFilePath = `${outputDir}/${fileName}`;

        console.log(`Processing: ${link}`);

        // Run the monolith command
        const command = new Deno.Command("monolith", {
          args: [link, "-o", outputFilePath],
          stdout: "piped",
          stderr: "piped",
        });

        const process = command.spawn();
        const { success } = await process.status;

        if (success) {
          console.log(`Saved to: ${outputFilePath}`);
        } else {
          const errorOutput = await streamToString(process.stderr);
          console.error(`Error processing ${link}: ${errorOutput}`);
        }
      }
    }

    file.close();
  } catch (err) {
    console.error("Error:", err);
  }
}

await processLinks(filePath);

// #main > div:nth-child(2) > div
// curl --silent <link> | htmlq  --text "#main > div:nth-child(2) > div > div.container > div > div > article > div:nth-child(4) > div.available-content"
