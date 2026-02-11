// Sync link_list.txt with the Substack RSS feed.
// Discovers new posts and appends them to link_list.txt.
//
// Usage: deno run --allow-net --allow-read --allow-write scripts/sync_links.ts

const FEED_URL = "https://www.newsletter.kahvipatel.com/feed";
const LINK_LIST = "link_list.txt";

const feedXml = await (await fetch(FEED_URL)).text();

// Extract all <link> values from RSS <item> elements.
// Substack RSS uses <link>URL</link> inside each <item>.
const itemLinks: string[] = [];
for (const match of feedXml.matchAll(/<item>[\s\S]*?<\/item>/g)) {
  const linkMatch = match[0].match(/<link>(https?:\/\/[^<]+)<\/link>/);
  if (linkMatch) {
    // Normalize: strip trailing slashes, ensure www prefix
    let url = linkMatch[1].replace(/\/+$/, "");
    if (!url.includes("www.")) {
      url = url.replace("://", "://www.");
    }
    itemLinks.push(url);
  }
}

const existing = new Set(
  (await Deno.readTextFile(LINK_LIST))
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
);

const newLinks = itemLinks.filter((url) => !existing.has(url));

if (newLinks.length === 0) {
  console.log("link_list.txt is up to date.");
} else {
  const currentContent = (await Deno.readTextFile(LINK_LIST)).trimEnd();
  await Deno.writeTextFile(LINK_LIST, currentContent + "\n" + newLinks.join("\n") + "\n");
  console.log(`Added ${newLinks.length} new link(s):`);
  newLinks.forEach((url) => console.log(`  ${url}`));
}
