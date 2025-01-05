// analyze_markdown.ts

import { walk } from "https://deno.land/std/fs/mod.ts";

interface PostMetrics {
  filename: string;
  date: Date;
  wordCount: number;
  characterCount: number;
  paragraphCount: number;
  specialType?: string;
  links: Link[];
  imageCount: number;
  headings: Heading[];
  keywords: Map<string, number>;
}

interface Link {
  text: string;
  url: string;
}

interface Heading {
  level: number;
  text: string;
}

function extractLinks(content: string): Link[] {
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const links: Link[] = [];
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    links.push({
      text: match[1],
      url: match[2],
    });
  }

  return links;
}

function countImages(content: string): number {
  // Match both markdown images ![alt](url) and HTML img tags
  const markdownImages = (content.match(/!\[([^\]]*)\]\(([^)]+)\)/g) || [])
    .length;
  const htmlImages = (content.match(/<img[^>]+>/g) || []).length;
  return markdownImages + htmlImages;
}

function extractHeadings(content: string): Heading[] {
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  const headings: Heading[] = [];
  let match;

  while ((match = headingRegex.exec(content)) !== null) {
    headings.push({
      level: match[1].length,
      text: match[2].trim(),
    });
  }

  return headings;
}

function extractKeywords(content: string): Map<string, number> {
  // Remove markdown syntax, links, and common punctuation
  const cleanText = content
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Remove markdown links but keep text
    .replace(/[#*`_]/g, "") // Remove markdown formatting
    .replace(/[.,!?;:'"()]/g, "") // Remove punctuation
    .toLowerCase();

  // Enhanced stop words list
  const stopWords = new Set([
    // Original stop words...
    "the",
    "be",
    "to",
    "of",
    "and",
    "a",
    "in",
    "that",
    "have",
    "i",
    "it",
    "for",
    "not",
    "on",
    "with",
    "he",
    "as",
    "you",
    "do",
    "at",
    "this",
    "but",
    "his",
    "by",
    "from",
    "they",
    "we",
    "say",
    "her",
    "she",
    "or",
    "an",
    "will",
    "my",
    "one",
    "all",
    "would",
    "there",
    "their",
    "what",
    "so",
    "up",
    "out",
    "if",
    "about",
    "who",
    "get",
    "which",
    "go",
    "me",
    "when",
    "make",
    "can",
    "like",
    "time",
    "no",
    "just",
    "him",
    "know",
    "take",
    "people",
    "into",
    "year",
    "your",
    "good",
    "some",
    "could",
    "them",
    "see",
    "other",
    "than",
    "then",
    "now",
    "look",
    "only",
    "come",
    "its",
    "over",
    "think",
    "also",
    "back",
    "after",
    "use",
    "two",
    "how",
    "our",
    "work",
    "first",
    "well",
    "way",
    "even",
    "new",
    "want",
    "because",
    "any",
    "these",
    "give",
    "day",
    "most",
    "us",

    // Additional stop words based on your content
    "it's",
    "that's",
    "i've",
    "here's",
    "don't",
    "i'm",
    "there's",
    "won't",
    "can't",
    "didn't",
    "wouldn't",
    "couldn't",
    "shouldn't",
    "more",
    "been",
    "here",
    "very",
    "much",
    "were",
    "next",
    "something",
    "things",
    "same",
    "month",
    "newsletter",
    "being",
    "really",
    "going",
    "getting",
    "doing",
    "made",
    "still",
    "every",
    "another",
    "many",
    "while",
    "where",
    "through",
    "before",
    "after",
    "since",
    "until",
    "unless",
    "though",
    "although",
    "rather",
    "quite",
    "such",
    "within",
    "without",
    "during",
    "among",
    "those",
    "they're",
    "we're",
    "you're",
    "what's",
    "who's",
    "let's",
    "where's",
    "might",
    "shall",
  ]);

  // Split into words and count frequencies
  const words = cleanText.split(/\s+/);
  const frequencies = new Map<string, number>();
  words.forEach((word) => {
    if (word.length > 3) {
      frequencies.set(word, (frequencies.get(word) || 0) + 1);
    }
  });

  return frequencies;
}

async function analyzeNewsletter(
  directoryPath: string
): Promise<PostMetrics[]> {
  const metrics: PostMetrics[] = [];

  for await (const entry of walk(directoryPath, {
    exts: [".md"],
  })) {
    const content = await Deno.readTextFile(entry.path);
    let date: Date | null = null;
    let specialType: string | undefined;

    const monthYearMatch = entry.name.match(/^([\w-]+)-(\d{4}).*\.md$/);
    if (monthYearMatch) {
      const [, month, year] = monthYearMatch;
      const monthNum = getMonthNumber(month);
      if (monthNum !== -1) {
        date = new Date(`${year}-${monthNum.toString().padStart(2, "0")}-01`);
      }
    } else {
      specialType = entry.name.replace(".md", "");
    }

    metrics.push({
      filename: entry.name,
      date: date || new Date(0),
      wordCount: content.trim().split(/\s+/).length,
      characterCount: content.length,
      paragraphCount: content.split("\n\n").length,
      specialType: date ? undefined : specialType,
      links: extractLinks(content),
      imageCount: countImages(content),
      headings: extractHeadings(content),
      keywords: extractKeywords(content),
    });
  }

  return metrics;
}

function getMonthNumber(month: string): number {
  const months: { [key: string]: number } = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
  };
  return months[month.toLowerCase()] || -1;
}

function getDomainFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

async function generateReport(metrics: PostMetrics[]): Promise<void> {
  const regularPosts = metrics.filter((m) => !m.specialType);
  const specialPosts = metrics.filter((m) => m.specialType);
  regularPosts.sort((a, b) => a.date.getTime() - b.date.getTime());

  console.log("Newsletter Analysis Report");
  console.log("========================");

  // Basic statistics
  console.log("\nBasic Statistics:");
  console.log(`Total Regular Posts: ${regularPosts.length}`);
  console.log(`Total Special Posts: ${specialPosts.length}`);
  const totalWords = regularPosts.reduce(
    (sum, post) => sum + post.wordCount,
    0
  );
  console.log(`Total Words: ${totalWords}`);
  console.log(
    `Average Words per Post: ${(totalWords / regularPosts.length).toFixed(2)}`
  );

  // Link analysis
  const allLinks = metrics.flatMap((post) => post.links);
  const domainFrequency = new Map<string, number>();
  allLinks.forEach((link) => {
    const domain = getDomainFromUrl(link.url);
    domainFrequency.set(domain, (domainFrequency.get(domain) || 0) + 1);
  });

  console.log("\nLink Analysis:");
  console.log(`Total Links: ${allLinks.length}`);
  console.log("\nTop 10 Referenced Domains:");
  [...domainFrequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([domain, count]) => {
      console.log(`${domain}: ${count} references`);
    });

  // Image analysis
  const totalImages = metrics.reduce((sum, post) => sum + post.imageCount, 0);
  console.log("\nImage Analysis:");
  console.log(`Total Images: ${totalImages}`);
  console.log(
    `Average Images per Post: ${(totalImages / metrics.length).toFixed(2)}`
  );

  // Heading structure analysis
  console.log("\nHeading Structure Analysis:");
  const headingLevels = new Map<number, number>();
  metrics.forEach((post) => {
    post.headings.forEach((heading) => {
      headingLevels.set(
        heading.level,
        (headingLevels.get(heading.level) || 0) + 1
      );
    });
  });

  [...headingLevels.entries()]
    .sort((a, b) => a[0] - b[0])
    .forEach(([level, count]) => {
      console.log(`H${level}: ${count} occurrences`);
    });

  // Keyword analysis
  const globalKeywords = new Map<string, number>();
  metrics.forEach((post) => {
    post.keywords.forEach((count, word) => {
      globalKeywords.set(word, (globalKeywords.get(word) || 0) + count);
    });
  });

  console.log("\nTop 20 Keywords:");
  [...globalKeywords.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([word, count]) => {
      console.log(`${word}: ${count} occurrences`);
    });

  // Monthly trends
  console.log("\nMonthly Word Count Trends:");
  regularPosts.forEach((post) => {
    console.log(
      `${post.date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
      })}: ${post.wordCount} words, ${post.imageCount} images, ${
        post.links.length
      } links`
    );
  });
}

// Main execution
if (import.meta.main) {
  try {
    const directoryPath = Deno.args[0] || ".";
    const metrics = await analyzeNewsletter(directoryPath);
    await generateReport(metrics);
  } catch (error) {
    console.error("Error:", error.message);
  }
}
