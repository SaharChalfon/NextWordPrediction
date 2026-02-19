const fs = require("fs");
const path = require("path");
const brain = require("brain.js");
const { cleanSentence, tokenize } = require("./cleanText.cjs");
const { accuracy } = require("../utils/metrics.cjs");

function arg(name, def) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return def;
  return process.argv[idx + 1] ?? def;
}

const lang = arg("--lang", "en");
if (!["en", "he"].includes(lang)) throw new Error("Use --lang en|he");

const root = path.resolve(process.cwd());
const modelPath = path.join(root, "models", `lstm_${lang}.json`);
const splitPath = path.join(root, "models", `lstm_${lang}_splits.json`);
const backoffPath = path.join(root, "models", `lstm_${lang}_backoff.json`);

if (!fs.existsSync(modelPath) || !fs.existsSync(splitPath)) {
  console.error("Missing model/splits. Train first.");
  process.exit(1);
}

const net = new brain.recurrent.LSTM();
net.fromJSON(JSON.parse(fs.readFileSync(modelPath, "utf-8")));
const splits = JSON.parse(fs.readFileSync(splitPath, "utf-8"));
const backoff = fs.existsSync(backoffPath)
  ? JSON.parse(fs.readFileSync(backoffPath, "utf-8"))
  : null;

function extractLstmNext(prefix) {
  const cont = net.run(prefix);
  const full = (prefix + " " + cont).replace(/\s+/g, " ").trim();
  const pt = prefix.trim().split(/\s+/).filter(Boolean);
  const ft = full.split(/\s+/).filter(Boolean);
  const next = ft[pt.length] || "";
  if (!next || next === "<eos>") return "";
  return next;
}

function getBackoffCandidates(prefix) {
  if (!backoff || !backoff.tables) return [];
  const toks = prefix.trim().split(/\s+/).filter(Boolean);
  const maxContext = Number(backoff.maxContext || 0);

  for (let k = Math.min(maxContext, toks.length); k >= 1; k--) {
    const key = toks.slice(-k).join(" ");
    const counts = backoff.tables[String(k)]?.[key];
    if (!counts) continue;

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([w]) => w);
  }

  return [];
}

function predictNextWord(prefix) {
  const lstmWord = extractLstmNext(prefix);
  const candidates = getBackoffCandidates(prefix);

  if (lstmWord) {
    if (candidates.includes(lstmWord)) return lstmWord;

    const startsWith = candidates.find((w) => w.startsWith(lstmWord));
    if (startsWith) return startsWith;

    if (!candidates.length) return lstmWord;
  }

  return candidates[0] || "";
}

function evalOn(lines, name) {
  const yTrue = [];
  const yPred = [];

  for (const line of lines) {
    const clean = cleanSentence(line, lang);
    const toks = tokenize(clean);
    const eosIdx = toks.indexOf("<eos>");
    const toksNoEos = eosIdx >= 0 ? toks.slice(0, eosIdx) : toks;
    if (toksNoEos.length < 2) continue;

    const prefix = toksNoEos.slice(0, toksNoEos.length - 1).join(" ");
    const trueNext = toksNoEos[toksNoEos.length - 1];
    const pred = predictNextWord(prefix);

    yTrue.push(trueNext);
    yPred.push(pred || "<empty>");
  }

  const acc = accuracy(yTrue, yPred);
  console.log(`${name} samples: ${yTrue.length}`);
  console.log(`${name} Top-1 Accuracy: ${(acc * 100).toFixed(2)}%`);
  return { name, samples: yTrue.length, acc };
}

console.log(`Evaluating LSTM (${lang})`);
const resVal = evalOn(splits.val, "Validation");
const resTest = evalOn(splits.test, "Test");

const out = {
  lang,
  hasBackoff: Boolean(backoff),
  validation: resVal,
  test: resTest,
  evaluatedAt: new Date().toISOString(),
};

fs.writeFileSync(
  path.join(root, "models", `lstm_${lang}_eval.json`),
  JSON.stringify(out, null, 2),
  "utf-8"
);
