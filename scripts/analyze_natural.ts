// analyze_natural.ts

import natural from "natural";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

interface DocumentAnalysis {
  filename: string;
  tokens: string[];
  uniqueWords: Set<string>;
  sentences: string[];
  wordFrequencies: Map<string, number>;
  bigrams: string[][];
  rawContent: string;
}

// 1. Sentiment Analysis
function analyzeSentiment(text: string): {
  score: number;
  comparative: number;
} {
  const analyzer = new natural.SentimentAnalyzer(
    "English",
    natural.PorterStemmer,
    "afinn"
  );
  const tokens = new natural.WordTokenizer().tokenize(text);
  const score = analyzer.getSentiment(tokens);
  return {
    score,
    comparative: score / tokens.length,
  };
}

// 2. Language Detection
function analyzeLanguageDistribution(text: string) {
  return natural.LanguageDetect().detect(text);
}

// 3. String Distance Analysis (find similar words/phrases)
function findSimilarTerms(term: string, wordList: string[], threshold = 0.8) {
  const metaphone = natural.Metaphone;
  const similar = wordList.filter((word) => {
    const distance = natural.JaroWinklerDistance(term, word);
    return distance > threshold;
  });
  return similar;
}

// 4. Part of Speech Tagging
function analyzePartsOfSpeech(text: string) {
  const language = new natural.LanguageProcessor();
  return language.tag(text);
}

// 5. Stemming Analysis (find root words)
function analyzeWordStems(words: string[]) {
  const stemmer = natural.PorterStemmer;
  return words.map((word) => ({
    original: word,
    stem: stemmer.stem(word),
  }));
}

// Strip markdown/HTML artifacts so readability metrics aren't inflated
function stripMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "") // images
    .replace(/<img[^>]+>/g, "")              // HTML images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links → keep text
    .replace(/https?:\/\/\S+/g, "")          // bare URLs
    .replace(/[#*`_~>|]/g, "")              // formatting chars
    .replace(/^-{3,}$/gm, "")               // horizontal rules
    .replace(/^\s*[-*+]\s+/gm, "")          // list markers
    .replace(/^\s*\d+\.\s+/gm, "")          // ordered list markers
    .replace(/\n{2,}/g, ". ")               // paragraph breaks → sentence boundaries
    .replace(/\s+/g, " ")
    .trim();
}

// Custom readability implementation
function calculateReadability(text: string): number {
  const clean = stripMarkdown(text);
  const sentences = clean.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const words = clean.split(/\s+/).filter((w) => w.length > 0);
  if (sentences.length === 0 || words.length === 0) return 0;
  const syllables = countSyllables(clean);

  // Flesch-Kincaid Grade Level formula
  const avgSentenceLength = words.length / sentences.length;
  const avgSyllablesPerWord = syllables / words.length;
  return 0.39 * avgSentenceLength + 11.8 * avgSyllablesPerWord - 15.59;
}

function countSyllables(text: string): number {
  const words = text.toLowerCase().split(/\s+/);
  return words.reduce((total, word) => total + countWordSyllables(word), 0);
}

function countWordSyllables(word: string): number {
  word = word.toLowerCase();
  if (word.length <= 3) return 1;

  // Remove common endings
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
  word = word.replace(/^y/, "");

  // Count syllables based on vowel groups
  const syllables = word.match(/[aeiouy]{1,2}/g);
  return syllables ? syllables.length : 1;
}

async function analyzeNewsletter(directoryPath: string) {
  const tokenizer = new natural.WordTokenizer();
  const TfIdf = natural.TfIdf;
  const tfidf = new TfIdf();
  const NGrams = natural.NGrams;

  const documents: DocumentAnalysis[] = [];
  const allWords = new Set<string>();

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
  ]);

  // First pass: collect all documents and build corpus
  const entries = await readdir(directoryPath, { withFileTypes: true, recursive: true });
  const mdFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => ({ path: join(e.parentPath ?? e.path, e.name), name: e.name }));

  for (const entry of mdFiles) {
    const content = await Bun.file(entry.path).text();

    // Clean markdown syntax
    const cleanContent = content
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "") // Remove markdown image syntax
      .replace(/<img[^>]+>/g, "") // Remove HTML image tags
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Remove markdown links but keep text
      .replace(/[#*`_]/g, "") // Remove markdown formatting
      .replace(/\n\n+/g, ". "); // Replace multiple newlines with period

    const tokens = tokenizer.tokenize(cleanContent).map((t) => t.toLowerCase());
    const sentences = cleanContent
      .split(/[.!?]+/)
      .filter((s) => s.trim().length > 0);
    const uniqueWords = new Set(tokens);
    const bigrams = NGrams.bigrams(tokens);

    const wordFrequencies = new Map<string, number>();
    tokens.forEach((token) => {
      wordFrequencies.set(token, (wordFrequencies.get(token) || 0) + 1);
    });

    documents.push({
      filename: entry.name,
      tokens,
      uniqueWords,
      sentences,
      wordFrequencies,
      bigrams,
      rawContent: content,
    });

    const filteredTokens = tokens.filter(
      (t) => !stopWords.has(t) && t.length > 2
    );
    tfidf.addDocument(filteredTokens);
    tokens.forEach((token) => allWords.add(token));
  }

  // Analysis results
  console.log("=== Newsletter Content Analysis ===\n");

  // 1. Corpus Statistics
  const totalDocuments = documents.length;
  const totalWords = documents.reduce((sum, doc) => sum + doc.tokens.length, 0);
  const uniqueWordsCount = allWords.size;
  const avgWordsPerDoc = totalWords / totalDocuments;

  console.log("Corpus Statistics:");
  console.log(`Documents analyzed: ${totalDocuments}`);
  console.log(`Total words: ${totalWords}`);
  console.log(`Unique words: ${uniqueWordsCount}`);
  console.log(`Average words per document: ${avgWordsPerDoc.toFixed(2)}`);

  // 2. Most Common Words
  const wordFreqTotal = new Map<string, number>();
  documents.forEach((doc) => {
    doc.wordFrequencies.forEach((count, word) => {
      if (!stopWords.has(word) && word.length > 3) {
        wordFreqTotal.set(word, (wordFreqTotal.get(word) || 0) + count);
      }
    });
  });

  console.log("\nMost Common Words:");
  [...wordFreqTotal.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([word, count], i) => {
      console.log(`${(i + 1).toString().padStart(2, " ")}. ${word}: ${count}`);
    });

  // 3. Common Phrases (Bigrams)
  const bigramFreq = new Map<string, number>();
  documents.forEach((doc) => {
    doc.bigrams.forEach((bigram) => {
      const bigramStr = bigram.join(" ");
      if (!bigram.some((word) => stopWords.has(word))) {
        bigramFreq.set(bigramStr, (bigramFreq.get(bigramStr) || 0) + 1);
      }
    });
  });

  console.log("\nMost Common Phrases (Bigrams):");
  [...bigramFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([phrase, count], i) => {
      console.log(
        `${(i + 1)
          .toString()
          .padStart(2, " ")}. "${phrase}": ${count} occurrences`
      );
    });

  // 4. TF-IDF Analysis
  console.log("\nImportant Terms by Document (TF-IDF):");
  documents.forEach((doc, idx) => {
    console.log(`\n${doc.filename}:`);
    const terms = tfidf
      .listTerms(idx)
      .slice(0, 5)
      .map((item) => `${item.term} (${item.tfidf.toFixed(4)})`);
    console.log(terms.join(", "));
  });

  // 5. Readability Metrics with our custom implementation
  console.log("\nReadability Metrics:");
  documents.forEach((doc) => {
    const readabilityScore = calculateReadability(doc.rawContent);
    console.log(`${doc.filename}:`);
    console.log(`  - Grade Level: ${readabilityScore.toFixed(1)}`);
    console.log(
      `  - Average Sentence Length: ${(
        doc.tokens.length / doc.sentences.length
      ).toFixed(1)} words`
    );
  });

  // 6. Sentiment Analysis Over Time
  console.log("\nSentiment Analysis:");
  documents
    .sort((a, b) => a.filename.localeCompare(b.filename))
    .forEach((doc) => {
      const sentiment = analyzeSentiment(doc.sentences.join(" "));
      console.log(`${doc.filename}:`);
      console.log(`  - Raw Score: ${sentiment.score.toFixed(2)}`);
      console.log(`  - Normalized Score: ${sentiment.comparative.toFixed(2)}`);
    });

  // 7. Similar Terms Analysis
  console.log("\nSimilar Terms Analysis:");
  const targetWords = ["language", "model", "data", "learning"];
  targetWords.forEach((word) => {
    const similar = findSimilarTerms(word, Array.from(allWords));
    console.log(`\nSimilar to "${word}":`);
    similar.forEach((term) => console.log(`  - ${term}`));
  });

  // 8. Most Common Word Stems
  console.log("\nCommon Word Stems:");
  const commonWords = [...wordFreqTotal.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([word]) => word);

  const stems = analyzeWordStems(commonWords);
  const stemFreq = new Map<string, string[]>();
  stems.forEach(({ original, stem }) => {
    if (!stemFreq.has(stem)) stemFreq.set(stem, []);
    stemFreq.get(stem)?.push(original);
  });

  [...stemFreq.entries()]
    .filter(([_, words]) => words.length > 1)
    .forEach(([stem, words]) => {
      console.log(`\nStem: ${stem}`);
      console.log(`Related words: ${words.join(", ")}`);
    });

  // 9. Content Evolution Analysis
  if (documents.length > 1) {
    console.log("\nContent Evolution:");
    const timeWindows = 4; // Divide content into quarters
    const sortedDocs = documents.sort((a, b) =>
      a.filename.localeCompare(b.filename)
    );
    const windowSize = Math.ceil(sortedDocs.length / timeWindows);

    for (let i = 0; i < timeWindows; i++) {
      const windowDocs = sortedDocs.slice(i * windowSize, (i + 1) * windowSize);
      const windowText = windowDocs.map((d) => d.sentences.join(" ")).join(" ");
      const sentiment = analyzeSentiment(windowText);

      console.log(`\nTime Period ${i + 1}:`);
      console.log(
        `  - Documents: ${windowDocs.map((d) => d.filename).join(", ")}`
      );
      console.log(`  - Sentiment: ${sentiment.comparative.toFixed(2)}`);
      console.log(
        `  - Avg Words: ${(
          windowDocs.reduce((sum, doc) => sum + doc.tokens.length, 0) /
          windowDocs.length
        ).toFixed(0)}`
      );
    }
  }

  // 10. Vocabulary Complexity Analysis
  console.log("\nVocabulary Complexity:");
  documents.forEach((doc) => {
    const wordLengths = doc.tokens.map((w) => w.length);
    const avgWordLength =
      wordLengths.reduce((a, b) => a + b) / wordLengths.length;
    const uniqueRatio = doc.uniqueWords.size / doc.tokens.length;

    console.log(`\n${doc.filename}:`);
    console.log(
      `  - Average Word Length: ${avgWordLength.toFixed(2)} characters`
    );
    console.log(`  - Vocabulary Diversity: ${(uniqueRatio * 100).toFixed(1)}%`);
  });
}

// Run the analysis
if (import.meta.main) {
  try {
    const directoryPath = process.argv[2] || ".";
    await analyzeNewsletter(directoryPath);
  } catch (error) {
    console.error("Error:", error.message);
  }
}
