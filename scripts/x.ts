import nlp from "compromise";

const regexMdLinks = /\[([^\[]+)\](\(.*\))/gm;
const regexMdImages = /!\[(.*)\]\((.+)\)/gm;

const content = await Bun.file("./output/combined.md").text();

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
