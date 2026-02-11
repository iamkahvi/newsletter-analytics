// deep_analysis.ts -- computes all metrics, writes JSON to output/analysis.json

import nlp from "compromise";
import natural from "natural";
import { readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";

// ── Types ──────────────────────────────────────────────────────────────────

interface PostMetadataEntry {
  slug: string;
  filename: string;
  url: string;
  postedDate: string | null;
  subjectLine: string | null;
  subtitle: string | null;
}

interface PostAnalysis {
  filename: string;
  date: string | null;
  postedDate: string | null;
  subjectLine: string | null;
  subtitle: string | null;
  wordCount: number;
  sentenceStats: { mean: number; median: number; stdev: number };
  questionDensity: number;
  listProseRatio: number;
  openingLine: string;
  readability: number;
  selfReferences: number;
  namedEntities: Array<{ name: string; count: number }>;
  tfidfTerms: Array<{ term: string; score: number }>;
}

interface AnalysisOutput {
  posts: PostAnalysis[];
  global: {
    vocabGrowth: Array<{
      post: string;
      cumulativeUnique: number;
      newWords: number;
    }>;
    similarityMatrix: number[][];
    topEntitiesOverTime: Record<
      string,
      Array<{ post: string; count: number }>
    >;
    linkRot: Array<{ url: string; status: number | "error"; source: string }>;
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getMonthNumber(month: string): number {
  const months: Record<string, number> = {
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
  return months[month.toLowerCase()] ?? -1;
}

function parseDateFromFilename(filename: string): string | null {
  const match = filename.match(/^([a-z]+)-(\d{4}).*\.md$/i);
  if (!match) return null;
  const [, monthStr, year] = match;
  const firstMonth = monthStr.match(
    /^(january|february|march|april|may|june|july|august|september|october|november|december)/i
  );
  if (!firstMonth) return null;
  const monthNum = getMonthNumber(firstMonth[1]);
  if (monthNum === -1) return null;
  return `${year}-${monthNum.toString().padStart(2, "0")}-01`;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "")
    .replace(/<img[^>]+>/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[#*`_~>|]/g, "")
    .replace(/^-{3,}$/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

function countWordSyllables(word: string): number {
  word = word.toLowerCase();
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
  word = word.replace(/^y/, "");
  const syllables = word.match(/[aeiouy]{1,2}/g);
  return syllables ? syllables.length : 1;
}

function calculateReadability(text: string): number {
  const clean = stripMarkdown(text);
  const sentences = clean.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const words = clean.split(/\s+/).filter((w) => w.length > 0);
  if (sentences.length === 0 || words.length === 0) return 0;
  const syllables = words.reduce(
    (sum, w) => sum + countWordSyllables(w),
    0
  );
  const avgSentenceLength = words.length / sentences.length;
  const avgSyllablesPerWord = syllables / words.length;
  return 0.39 * avgSentenceLength + 11.8 * avgSyllablesPerWord - 15.59;
}

function extractLinks(content: string): Array<{ text: string; url: string }> {
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const links: Array<{ text: string; url: string }> = [];
  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    links.push({ text: match[1], url: match[2] });
  }
  return links;
}

function getSentences(text: string): string[] {
  const clean = stripMarkdown(text);
  return clean
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function sentenceWordCounts(sentences: string[]): number[] {
  return sentences.map((s) => s.split(/\s+/).filter((w) => w.length > 0).length);
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stdev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

function questionDensity(text: string): number {
  const clean = stripMarkdown(text);
  // Split into sentence-like units including keeping the delimiter
  const allSentences = clean
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim().length > 0);
  if (allSentences.length === 0) return 0;
  const questions = allSentences.filter((s) => s.trim().endsWith("?"));
  return questions.length / allSentences.length;
}

function listProseRatio(content: string): number {
  const lines = content.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return 0;
  const listLines = lines.filter((l) =>
    /^\s*[-*+]\s+/.test(l) || /^\s*\d+\.\s+/.test(l)
  );
  return listLines.length / lines.length;
}

function openingLine(content: string): string {
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    if (/^#{1,6}\s+/.test(trimmed)) continue;
    if (/^-{3,}$/.test(trimmed)) continue;
    if (/^!\[/.test(trimmed)) continue;
    // Strip markdown links for display
    return trimmed.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").slice(0, 200);
  }
  return "";
}

function selfReferenceCount(content: string): number {
  const links = extractLinks(content);
  return links.filter((l) => {
    try {
      const url = new URL(l.url);
      return url.hostname.includes("newsletter.kahvipatel.com");
    } catch {
      return false;
    }
  }).length;
}

function extractNamedEntities(
  content: string
): Array<{ name: string; count: number }> {
  const clean = stripMarkdown(content);
  const doc = nlp(clean);
  const topics = doc.topics().out("array") as string[];
  const counts = new Map<string, number>();
  for (const t of topics) {
    const normalized = t.toLowerCase().trim();
    if (normalized.length < 2) continue;
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name, count]) => ({ name, count }));
}

// ── TF-IDF + Cosine Similarity ────────────────────────────────────────────

const stopWords = new Set([
  "the", "be", "to", "of", "and", "a", "in", "that", "have", "i",
  "it", "for", "not", "on", "with", "he", "as", "you", "do", "at",
  "this", "but", "his", "by", "from", "they", "we", "say", "her",
  "she", "or", "an", "will", "my", "one", "all", "would", "there",
  "their", "what", "so", "up", "out", "if", "about", "who", "get",
  "which", "go", "me", "when", "make", "can", "like", "time", "no",
  "just", "him", "know", "take", "people", "into", "year", "your",
  "good", "some", "could", "them", "see", "other", "than", "then",
  "now", "look", "only", "come", "its", "over", "think", "also",
  "back", "after", "use", "two", "how", "our", "work", "first",
  "well", "way", "even", "new", "want", "because", "any", "these",
  "give", "day", "most", "us", "was", "were", "had", "has", "been",
  "is", "are", "am", "being", "more", "very", "much", "really",
  "thing", "things", "lot", "bit",
]);

function tokenize(text: string): string[] {
  const tokenizer = new natural.WordTokenizer();
  return tokenizer
    .tokenize(stripMarkdown(text))
    .map((t) => t.toLowerCase())
    .filter((t) => t.length > 2 && !stopWords.has(t));
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (const [term, val] of a) {
    magA += val * val;
    if (b.has(term)) dot += val * b.get(term)!;
  }
  for (const [, val] of b) magB += val * val;
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// ── Link Rot Checker ──────────────────────────────────────────────────────

async function checkLinkRot(
  allLinks: Array<{ url: string; source: string }>
): Promise<Array<{ url: string; status: number | "error"; source: string }>> {
  const results: Array<{
    url: string;
    status: number | "error";
    source: string;
  }> = [];

  // Dedupe by URL, keep first source
  const seen = new Map<string, string>();
  const unique: Array<{ url: string; source: string }> = [];
  for (const link of allLinks) {
    if (!seen.has(link.url)) {
      seen.set(link.url, link.source);
      unique.push(link);
    }
  }

  console.log(`  Checking ${unique.length} unique URLs...`);

  // Process in batches of 10
  const BATCH_SIZE = 10;
  const TIMEOUT = 5000;

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async ({ url, source }) => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT);
        const res = await fetch(url, {
          method: "HEAD",
          signal: controller.signal,
          redirect: "follow",
        });
        clearTimeout(timer);
        if (res.status >= 400) {
          results.push({ url, status: res.status, source });
        }
      } catch {
        results.push({ url, status: "error", source });
      }
    });
    await Promise.all(promises);
    if ((i + BATCH_SIZE) % 50 === 0) {
      console.log(`  Checked ${Math.min(i + BATCH_SIZE, unique.length)}/${unique.length}`);
    }
  }

  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const skipLinks = process.argv.includes("--skip-links");
  const directoryPath = "output/markdown";

  console.log("Deep Analysis starting...");

  // Load metadata if available
  let metadata: PostMetadataEntry[] = [];
  const metaFile = Bun.file("output/metadata.json");
  if (await metaFile.exists()) {
    metadata = JSON.parse(await metaFile.text());
    console.log(`Loaded metadata for ${metadata.length} posts`);
  } else {
    console.log("No metadata.json found -- run 'bun run fetch-metadata' to get posted dates and subject lines");
  }
  const metaByFilename = new Map(metadata.map((m) => [m.filename, m]));

  // Read all markdown files
  const entries = await readdir(directoryPath, {
    withFileTypes: true,
    recursive: true,
  });
  const mdFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith(".md") && e.name !== "all_newsletters.md" && e.name !== "combined.md")
    .map((e) => ({
      path: join(e.parentPath ?? e.path, e.name),
      name: e.name,
    }));

  // Sort chronologically
  mdFiles.sort((a, b) => {
    const da = parseDateFromFilename(a.name);
    const db = parseDateFromFilename(b.name);
    if (da && db) return da.localeCompare(db);
    if (da) return -1;
    if (db) return 1;
    return a.name.localeCompare(b.name);
  });

  console.log(`Found ${mdFiles.length} posts`);

  // TF-IDF setup
  const TfIdf = natural.TfIdf;
  const tfidf = new TfIdf();
  const docTokens: string[][] = [];
  const rawContents: string[] = [];

  // First pass: read all files, build TF-IDF corpus
  for (const file of mdFiles) {
    const content = await Bun.file(file.path).text();
    rawContents.push(content);
    const tokens = tokenize(content);
    docTokens.push(tokens);
    tfidf.addDocument(tokens);
  }

  // ── Per-post analysis ───────────────────────────────────────────────

  console.log("Computing per-post metrics...");

  const posts: PostAnalysis[] = [];
  const allLinksForRotCheck: Array<{ url: string; source: string }> = [];
  const cumulativeVocab = new Set<string>();
  const vocabGrowth: AnalysisOutput["global"]["vocabGrowth"] = [];
  const entityTracker = new Map<string, Map<string, number>>();

  for (let i = 0; i < mdFiles.length; i++) {
    const file = mdFiles[i];
    const content = rawContents[i];
    const tokens = docTokens[i];

    // Sentence stats
    const sentences = getSentences(content);
    const wordCounts = sentenceWordCounts(sentences);

    // TF-IDF top terms
    const tfidfTerms = tfidf
      .listTerms(i)
      .slice(0, 10)
      .map((item) => ({ term: item.term, score: Math.round(item.tfidf * 1000) / 1000 }));

    // Named entities
    const entities = extractNamedEntities(content);

    // Track entities globally
    for (const ent of entities) {
      if (!entityTracker.has(ent.name)) {
        entityTracker.set(ent.name, new Map());
      }
      entityTracker.get(ent.name)!.set(file.name, ent.count);
    }

    // Links for rot check
    const links = extractLinks(content);
    for (const link of links) {
      if (link.url.startsWith("http")) {
        allLinksForRotCheck.push({ url: link.url, source: file.name });
      }
    }

    // Vocab growth
    const prevSize = cumulativeVocab.size;
    for (const token of tokens) cumulativeVocab.add(token);
    vocabGrowth.push({
      post: file.name,
      cumulativeUnique: cumulativeVocab.size,
      newWords: cumulativeVocab.size - prevSize,
    });

    // Word count via natural tokenizer
    const tokenizer = new natural.WordTokenizer();
    const allTokens = tokenizer.tokenize(stripMarkdown(content));
    const wordCount = allTokens.length;

    const meta = metaByFilename.get(file.name);

    posts.push({
      filename: file.name,
      date: parseDateFromFilename(file.name),
      postedDate: meta?.postedDate ?? null,
      subjectLine: meta?.subjectLine ?? null,
      subtitle: meta?.subtitle ?? null,
      wordCount,
      sentenceStats: {
        mean: Math.round(mean(wordCounts) * 100) / 100,
        median: median(wordCounts),
        stdev: Math.round(stdev(wordCounts) * 100) / 100,
      },
      questionDensity: Math.round(questionDensity(content) * 1000) / 1000,
      listProseRatio: Math.round(listProseRatio(content) * 1000) / 1000,
      openingLine: openingLine(content),
      readability: Math.round(calculateReadability(content) * 100) / 100,
      selfReferences: selfReferenceCount(content),
      namedEntities: entities,
      tfidfTerms,
    });
  }

  // ── Similarity matrix ───────────────────────────────────────────────

  console.log("Computing similarity matrix...");

  // Build TF-IDF vectors per document
  const tfidfVectors: Map<string, number>[] = [];
  for (let i = 0; i < mdFiles.length; i++) {
    const vec = new Map<string, number>();
    tfidf.listTerms(i).forEach((item) => {
      vec.set(item.term, item.tfidf);
    });
    tfidfVectors.push(vec);
  }

  const similarityMatrix: number[][] = [];
  for (let i = 0; i < mdFiles.length; i++) {
    const row: number[] = [];
    for (let j = 0; j < mdFiles.length; j++) {
      const sim = i === j ? 1 : cosineSimilarity(tfidfVectors[i], tfidfVectors[j]);
      row.push(Math.round(sim * 1000) / 1000);
    }
    similarityMatrix.push(row);
  }

  // ── Top entities over time ──────────────────────────────────────────

  // Find top 15 entities by total occurrence
  const entityTotals = new Map<string, number>();
  for (const [name, postMap] of entityTracker) {
    let total = 0;
    for (const count of postMap.values()) total += count;
    entityTotals.set(name, total);
  }

  const topEntityNames = [...entityTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([name]) => name);

  const topEntitiesOverTime: Record<
    string,
    Array<{ post: string; count: number }>
  > = {};
  for (const name of topEntityNames) {
    const postMap = entityTracker.get(name)!;
    topEntitiesOverTime[name] = mdFiles.map((f) => ({
      post: f.name,
      count: postMap.get(f.name) || 0,
    }));
  }

  // ── Link rot ────────────────────────────────────────────────────────

  let linkRot: AnalysisOutput["global"]["linkRot"] = [];
  if (!skipLinks) {
    console.log("Checking for link rot...");
    linkRot = await checkLinkRot(allLinksForRotCheck);
    console.log(`  Found ${linkRot.length} broken/errored links`);
  } else {
    console.log("Skipping link rot check (--skip-links)");
  }

  // ── Write output ───────────────────────────────────────────────────

  const output: AnalysisOutput = {
    posts,
    global: {
      vocabGrowth,
      similarityMatrix,
      topEntitiesOverTime,
      linkRot,
    },
  };

  await mkdir("output", { recursive: true });
  const json = JSON.stringify(output, null, 2);
  await Bun.write("output/analysis.json", json);
  await Bun.write("site/analysis.json", json);
  console.log("Wrote output/analysis.json and site/analysis.json");
  console.log("Done.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
