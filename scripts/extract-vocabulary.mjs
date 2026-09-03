import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd());
const sourceDir = path.join(root, "data");
const output = path.join(root, "src/data/vocabulary.json");

const posPattern = "(?:n|v|adj|adv|prep|conj|pron|aux|art|num|det|modal|interj)(?:[./()a-z-]*)?";
const entryPattern = new RegExp(`([A-Za-z][A-Za-z'./()-]*(?:\\s+[A-Za-z][A-Za-z'./()-]*)?)\\s+(${posPattern})\\.?`);
const zhPattern = /[\u4e00-\u9fff][\u4e00-\u9fff\s，、；：:（）()「」…\-]*$/;
const levelPattern = /第[一二三四五六七八九十]+級/;

function normalizeWord(word) {
  return word.replace(/\s+/g, " ").replace(/[.。]+$/, "").trim().toLowerCase();
}

function parseJunior(text) {
  const records = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\f/g, " ").trim();
    if (!line || /^\d+$/.test(line) || line.includes("英文單字 2000") || /^[A-Z]$/.test(line)) continue;
    const match = line.match(new RegExp(`^([A-Za-z][A-Za-z'./()-]*(?:\\s+[A-Za-z][A-Za-z'./()-]*)?)\\s+(${posPattern})\\.?\\s*(.*)$`));
    if (!match) continue;
    const word = normalizeWord(match[1]);
    const meaning = (match[3].match(/[\u4e00-\u9fff][\u4e00-\u9fff\s，、；：:（）()「」…\-]*/) ?? [""])[0].trim();
    if (/^[a-z]/.test(word) && word.length <= 40 && meaning) records.push({ word, meaning, partOfSpeech: match[2], track: "junior", source: "國中英文 2000 字 PDF" });
  }
  return dedupe(records);
}

function parseSenior(text) {
  const records = [];
  let currentLevel = "senior";
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\f/g, " ").trim();
    const level = line.match(levelPattern)?.[0];
    if (level) currentLevel = "senior";
    if (!line || /^\d+$/.test(line) || line.includes("高中英文參考詞彙表") || line.includes("依級別排序")) continue;
    let rest = line;
    while (rest) {
      const match = rest.match(entryPattern);
      if (!match) break;
      const word = normalizeWord(match[1]);
      const pos = match[2];
      if (/^[a-z]/.test(word) && word.length <= 40 && !word.includes("參考詞彙")) {
        records.push({ word, meaning: "", partOfSpeech: pos, track: "senior", source: "高中英文參考詞彙表 PDF" });
      }
      rest = rest.slice((match.index ?? 0) + match[0].length);
    }
  }
  return dedupe(records);
}

function dedupe(records) {
  const map = new Map();
  for (const record of records) {
    const key = `${record.track}:${record.word}`;
    if (!map.has(key) || (!map.get(key).meaning && record.meaning)) map.set(key, record);
  }
  return [...map.values()].sort((a, b) => a.track.localeCompare(b.track) || a.word.localeCompare(b.word));
}

const junior = parseJunior(fs.readFileSync(path.join(sourceDir, "junior-raw.txt"), "utf8"));
const senior = parseSenior(fs.readFileSync(path.join(sourceDir, "senior-raw.txt"), "utf8"));
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify([...junior, ...senior], null, 2)}\n`);
console.log(JSON.stringify({ junior: junior.length, senior: senior.length, output }, null, 2));
