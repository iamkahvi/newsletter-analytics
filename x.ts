import nlp from "https://esm.sh/compromise@14.10.1";

const regexMdLinks = /\[([^\[]+)\](\(.*\))/gm;
const regexMdImages = /!\[(.*)\]\((.+)\)/gm;

const content = await Deno.readTextFile("./combined.md");

const cleanContent = content
  .replace(regexMdImages, "")
  .replace(regexMdLinks, "$1");

const doc = nlp(cleanContent);
const wordCount = doc.wordCount();

const nounFreq = doc.topics().out("freq");

nounFreq.slice(0, 100).forEach(({ normal, count }) => {
  console.log(`${normal}: ${count}`);
});

// console.log(cleanContent);
// console.log(wordCount);
// console.log(doc.nouns().out("array"));
