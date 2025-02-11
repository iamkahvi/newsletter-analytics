// server.ts
import { Application, Router } from "https://deno.land/x/oak/mod.ts";
import { walk } from "https://deno.land/std/fs/walk.ts";

interface WordCount {
  word: string;
  count: number;
}

interface NewsletterStats {
  month: string;
  wordCount: number;
}

// Function to read and process markdown files
async function processNewsletters(directory: string): Promise<{
  wordFrequency: WordCount[];
  monthlyStats: NewsletterStats[];
}> {
  try {
    const wordCounts = new Map<string, number>();
    const monthlyStats: NewsletterStats[] = [];

    // Check if directory exists
    try {
      await Deno.stat(directory);
    } catch (error) {
      console.error(`Directory error: ${error.message}`);
      throw new Error(`Newsletter directory not found: ${directory}`);
    }

    // Walk through the directory
    for await (const entry of walk(directory, {
      match: [/[a-zA-Z]+-\d{4}\.md$/],
    })) {
      console.log(`Processing file: ${entry.path}`);

      try {
        const content = await Deno.readTextFile(entry.path);

        // Count words in the current newsletter
        const words = content
          .toLowerCase()
          .replace(/[^\w\s]/g, "")
          .split(/\s+/)
          .filter((word) => word.length > 3); // Filter out small words

        // Update global word frequency
        words.forEach((word) => {
          wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
        });

        // Get month stats
        const fileName = entry.name.replace(".md", "");
        monthlyStats.push({
          month: fileName,
          wordCount: words.length,
        });
      } catch (error) {
        console.error(`Error processing file ${entry.path}: ${error.message}`);
        continue; // Skip this file but continue processing others
      }
    }

    // Handle case where no files were processed
    if (monthlyStats.length === 0) {
      throw new Error("No markdown files found in the specified directory");
    }

    // Convert word frequency map to sorted array
    const wordFrequency = Array.from(wordCounts.entries())
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50); // Get top 50 words

    return {
      wordFrequency,
      monthlyStats: monthlyStats.sort((a, b) => {
        // Parse dates from filenames (format: month-year)
        const [aMonth, aYear] = a.month.split("-");
        const [bMonth, bYear] = b.month.split("-");

        // Compare years first
        if (aYear !== bYear) {
          return parseInt(aYear) - parseInt(bYear);
        }

        // If years are same, compare months
        const months = [
          "january",
          "february",
          "march",
          "april",
          "may",
          "june",
          "july",
          "august",
          "september",
          "october",
          "november",
          "december",
        ];
        return (
          months.indexOf(aMonth.toLowerCase()) -
          months.indexOf(bMonth.toLowerCase())
        );
      }),
    };
  } catch (error) {
    console.error(`Process newsletters error: ${error.message}`);
    throw error;
  }
}

// Create the application
const app = new Application();
const router = new Router();

// Serve static files (HTML, CSS, JS)
router.get("/", async (ctx) => {
  ctx.response.type = "text/html";
  ctx.response.body = `
<!DOCTYPE html>
<html>
<head>
  <title>Newsletter Analysis</title>
  <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
  <style>
    .chart { width: 100%; height: 500px; margin-bottom: 2em; }
    .error { color: red; padding: 1em; }
  </style>
</head>
<body>
  <h1>Newsletter Analysis</h1>
  <div id="error" class="error" style="display: none;"></div>
  <div id="wordHistogram" class="chart"></div>
  <div id="monthlyWordCount" class="chart"></div>
  <script>
    async function loadData() {
      try {
        const [freqResponse, statsResponse] = await Promise.all([
          fetch('/api/word-frequency'),
          fetch('/api/monthly-stats')
        ]);

        if (!freqResponse.ok || !statsResponse.ok) {
          throw new Error(await freqResponse.text() || await statsResponse.text());
        }

        const freqData = await freqResponse.json();
        const statsData = await statsResponse.json();

        // Create word frequency histogram
        Plotly.newPlot('wordHistogram', [{
          x: freqData.map(d => d.word),
          y: freqData.map(d => d.count),
          type: 'bar',
          name: 'Word Frequency'
        }], {
          title: 'Most Frequent Words',
          xaxis: { tickangle: 45 }
        });

        // Create monthly word count bar chart
        Plotly.newPlot('monthlyWordCount', [{
          x: statsData.map(d => d.month),
          y: statsData.map(d => d.wordCount),
          type: 'bar',
          name: 'Word Count'
        }], {
          title: 'Monthly Newsletter Word Count',
          xaxis: { tickangle: 45 }
        });

        document.getElementById('error').style.display = 'none';
      } catch (error) {
        console.error('Error:', error);
        const errorDiv = document.getElementById('error');
        errorDiv.textContent = 'Error loading data: ' + error.message;
        errorDiv.style.display = 'block';
      }
    }

    loadData();
  </script>
</body>
</html>
  `;
});

// API endpoints
router.get("/api/word-frequency", async (ctx) => {
  try {
    const { wordFrequency } = await processNewsletters("./filtered-md-output");
    ctx.response.body = wordFrequency;
  } catch (error) {
    console.error(`Word frequency endpoint error: ${error.message}`);
    ctx.response.status = 500;
    ctx.response.body = { error: error.message };
  }
});

router.get("/api/monthly-stats", async (ctx) => {
  try {
    const { monthlyStats } = await processNewsletters("./filtered-md-output");
    ctx.response.body = monthlyStats;
  } catch (error) {
    console.error(`Monthly stats endpoint error: ${error.message}`);
    ctx.response.status = 500;
    ctx.response.body = { error: error.message };
  }
});

app.use(router.routes());
app.use(router.allowedMethods());

// Start the server
const port = 8000;
console.log(`Server running on http://localhost:${port}`);
await app.listen({ port });
