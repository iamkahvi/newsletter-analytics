// analyze_natural.ts

import natural from "npm:natural";
import { walk } from "https://deno.land/std/fs/mod.ts";

interface DocumentAnalysis {
  filename: string;
  tokens: string[];
  uniqueWords: Set<string>;
  sentences: string[];
  wordFrequencies: Map<string, number>;
  bigrams: string[][];
}

// Helper function to write CSV data
async function writeCSV(filename: string, headers: string[], rows: string[][]) {
  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      row
        .map((cell) =>
          // Escape special characters and wrap in quotes if needed
          cell.includes(",") || cell.includes('"') || cell.includes("\n")
            ? `"${cell.replace(/"/g, '""')}"`
            : cell
        )
        .join(",")
    ),
  ].join("\n");

  await Deno.writeTextFile(filename, csvContent);
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

// Custom readability implementation
function calculateReadability(text: string): number {
  const sentences = text.split(/[.!?]+/);
  const words = text.split(/\s+/);
  const syllables = countSyllables(text);

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

  // First pass: collect all documents and build corpus
  // [Previous document collection code remains the same]

  // Prepare CSV output directory
  const outputDir = "./analysis_output";
  try {
    await Deno.mkdir(outputDir);
  } catch (e) {
    if (!(e instanceof Deno.errors.AlreadyExists)) {
      throw e;
    }
  }

  // 1. Corpus Statistics
  await writeCSV(
    `${outputDir}/corpus_statistics.csv`,
    ["metric", "value"],
    [
      ["total_documents", documents.length.toString()],
      [
        "total_words",
        documents.reduce((sum, doc) => sum + doc.tokens.length, 0).toString(),
      ],
      ["unique_words", allWords.size.toString()],
      [
        "avg_words_per_doc",
        (
          documents.reduce((sum, doc) => sum + doc.tokens.length, 0) /
          documents.length
        ).toFixed(2),
      ],
    ]
  );

  // 2. Most Common Words
  const stopWords = new Set([
    /* previous stopwords list */
  ]);
  const wordFreqTotal = new Map<string, number>();
  documents.forEach((doc) => {
    doc.wordFrequencies.forEach((count, word) => {
      if (!stopWords.has(word) && word.length > 3) {
        wordFreqTotal.set(word, (wordFreqTotal.get(word) || 0) + count);
      }
    });
  });

  await writeCSV(
    `${outputDir}/common_words.csv`,
    ["rank", "word", "frequency"],
    [...wordFreqTotal.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map((entry, index) => [
        (index + 1).toString(),
        entry[0],
        entry[1].toString(),
      ])
  );

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

  await writeCSV(
    `${outputDir}/common_phrases.csv`,
    ["rank", "phrase", "frequency"],
    [...bigramFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map((entry, index) => [
        (index + 1).toString(),
        entry[0],
        entry[1].toString(),
      ])
  );

  // 4. TF-IDF Analysis
  const tfidfRows: string[][] = [];
  documents.forEach((doc, idx) => {
    tfidf
      .listTerms(idx)
      .slice(0, 5)
      .forEach((item) => {
        tfidfRows.push([doc.filename, item.term, item.tfidf.toFixed(4)]);
      });
  });

  await writeCSV(
    `${outputDir}/tfidf_analysis.csv`,
    ["document", "term", "tfidf_score"],
    tfidfRows
  );

  // 5. Readability Metrics
  const readabilityRows: string[][] = [];
  documents.forEach((doc) => {
    const originalContent = doc.sentences.join(" ");
    const readabilityScore = calculateReadability(originalContent);
    const avgSentenceLength = (
      doc.tokens.length / doc.sentences.length
    ).toFixed(1);

    readabilityRows.push([
      doc.filename,
      readabilityScore.toFixed(1),
      avgSentenceLength,
    ]);
  });

  await writeCSV(
    `${outputDir}/readability.csv`,
    ["document", "grade_level", "avg_sentence_length"],
    readabilityRows
  );

  // 6. Sentiment Analysis
  const sentimentRows: string[][] = [];
  documents
    .sort((a, b) => a.filename.localeCompare(b.filename))
    .forEach((doc) => {
      const sentiment = analyzeSentiment(doc.sentences.join(" "));
      sentimentRows.push([
        doc.filename,
        sentiment.score.toFixed(2),
        sentiment.comparative.toFixed(2),
      ]);
    });

  await writeCSV(
    `${outputDir}/sentiment.csv`,
    ["document", "raw_score", "normalized_score"],
    sentimentRows
  );

  // 7. Similar Terms Analysis
  const similarTermsRows: string[][] = [];
  const targetWords = ["language", "model", "data", "learning"];
  targetWords.forEach((word) => {
    const similar = findSimilarTerms(word, Array.from(allWords));
    similar.forEach((term) => {
      similarTermsRows.push([word, term]);
    });
  });

  await writeCSV(
    `${outputDir}/similar_terms.csv`,
    ["target_word", "similar_term"],
    similarTermsRows
  );

  // 8. Word Stems
  const commonWords = [...wordFreqTotal.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([word]) => word);

  const stems = analyzeWordStems(commonWords);
  const stemRows: string[][] = [];
  const stemFreq = new Map<string, string[]>();

  stems.forEach(({ original, stem }) => {
    if (!stemFreq.has(stem)) stemFreq.set(stem, []);
    stemFreq.get(stem)?.push(original);
  });

  [...stemFreq.entries()]
    .filter(([_, words]) => words.length > 1)
    .forEach(([stem, words]) => {
      stemRows.push([stem, words.join(";")]);
    });

  await writeCSV(
    `${outputDir}/word_stems.csv`,
    ["stem", "related_words"],
    stemRows
  );

  // 9. Content Evolution
  if (documents.length > 1) {
    const evolutionRows: string[][] = [];
    const timeWindows = 4;
    const sortedDocs = documents.sort((a, b) =>
      a.filename.localeCompare(b.filename)
    );
    const windowSize = Math.ceil(sortedDocs.length / timeWindows);

    for (let i = 0; i < timeWindows; i++) {
      const windowDocs = sortedDocs.slice(i * windowSize, (i + 1) * windowSize);
      const windowText = windowDocs.map((d) => d.sentences.join(" ")).join(" ");
      const sentiment = analyzeSentiment(windowText);
      const avgWords = (
        windowDocs.reduce((sum, doc) => sum + doc.tokens.length, 0) /
        windowDocs.length
      ).toFixed(0);

      evolutionRows.push([
        `Period ${i + 1}`,
        windowDocs.map((d) => d.filename).join(";"),
        sentiment.comparative.toFixed(2),
        avgWords,
      ]);
    }

    await writeCSV(
      `${outputDir}/content_evolution.csv`,
      ["time_period", "documents", "sentiment", "avg_words"],
      evolutionRows
    );
  }

  // 10. Vocabulary Complexity
  const complexityRows: string[][] = [];
  documents.forEach((doc) => {
    const wordLengths = doc.tokens.map((w) => w.length);
    const avgWordLength = (
      wordLengths.reduce((a, b) => a + b) / wordLengths.length
    ).toFixed(2);
    const uniqueRatio = (
      (doc.uniqueWords.size / doc.tokens.length) *
      100
    ).toFixed(1);

    complexityRows.push([doc.filename, avgWordLength, uniqueRatio]);
  });

  await writeCSV(
    `${outputDir}/vocabulary_complexity.csv`,
    ["document", "avg_word_length", "vocabulary_diversity_percentage"],
    complexityRows
  );

  console.log(
    `Analysis complete. CSV files have been written to ${outputDir}/`
  );
}

// Run the analysis
if (import.meta.main) {
  try {
    const directoryPath = Deno.args[0] || ".";
    await analyzeNewsletter(directoryPath);
  } catch (error) {
    console.error("Error:", error.message);
  }
}
