const fs = require("fs");
const path = require("path");
const brain = require("brain.js");
const { cleanSentence } = require("./cleanText.cjs");
const { splitTrainValTest } = require("./splitText.cjs");
const { mulberry32 } = require("../utils/seed.cjs");

function arg(name, def) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return def;
  return process.argv[idx + 1] ?? def;
}

const lang = arg("--lang", "en");
if (!["en", "he"].includes(lang)) throw new Error("Use --lang en|he");

const root = path.resolve(process.cwd());
const dataPath = path.join(
  root,
  "data",
  lang === "en" ? "text_corpus_en.txt" : "text_corpus_he.txt"
);

if (!fs.existsSync(dataPath)) {
  console.error("Missing corpus:", dataPath);
  console.error("Put your corpus here or run: npm run gen:data");
  process.exit(1);
}

// -------------------------
// 1) Load + clean
// -------------------------

const raw = fs.readFileSync(dataPath, "utf-8").split(/\r?\n/).filter(Boolean);

function sanitizeEn(s) {
  const hasEos = /<\s*eos\s*>/i.test(s);
  s = s.replace(/<\s*eos\s*>/gi, " ");

  // Remove non-printable and normalize whitespace.
  s = s.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();

  // Keep ASCII letters/digits/spaces only.
  s = s.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();

  if (hasEos) s = `${s} <eos>`.trim();
  return s;
}

let cleanedAll = raw.map((l) => cleanSentence(l, lang)).filter(Boolean);

if (lang === "en") {
  cleanedAll = cleanedAll
    .map(sanitizeEn)
    .filter(Boolean)
    // Remove super-long words (can break training)
    .filter((s) => s.split(/\s+/).every((w) => w.length <= 20))
    // Remove very long lines
    .filter((s) => s.length <= 60);
}

// -------------------------
// 2) IMPORTANT: limit sentence length (stability)
// -------------------------
const MAX_TOKENS = Number(arg("--maxTokens", lang === "en" ? "6" : "8"));
const cleaned = cleanedAll
  .map((s) => s.trim())
  .filter(Boolean)
  .filter((s) => s.split(/\s+/).length <= MAX_TOKENS);

if (cleaned.length < 50) {
  console.error(
    `After filtering to maxTokens=${MAX_TOKENS}, only ${cleaned.length} samples remain.`
  );
  console.error("Increase --maxTokens or add more data.");
  process.exit(1);
}

// -------------------------
// 3) Split: train/val/test
// -------------------------
const splitSeed = Number(arg("--seed", "1234"));
const { train, val, test } = splitTrainValTest(cleaned, splitSeed, 0.7, 0.15);

function buildBackoffModel(lines, maxContext = 4) {
  const tables = {};
  for (let k = 1; k <= maxContext; k++) tables[k] = {};

  for (const line of lines) {
    const toks = line.trim().split(/\s+/).filter(Boolean);
    const eosIdx = toks.indexOf("<eos>");
    const seq = eosIdx >= 0 ? toks.slice(0, eosIdx) : toks;
    if (seq.length < 2) continue;

    for (let i = 1; i < seq.length; i++) {
      const nextWord = seq[i];
      const prefix = seq.slice(0, i);
      for (let k = 1; k <= maxContext; k++) {
        if (prefix.length < k) continue;
        const key = prefix.slice(-k).join(" ");
        if (!tables[k][key]) tables[k][key] = {};
        tables[k][key][nextWord] = (tables[k][key][nextWord] || 0) + 1;
      }
    }
  }

  return { maxContext, tables };
}

const backoffModel = buildBackoffModel(train, 4);

// -------------------------
// 4) Training config
// -------------------------
const hidden = Number(arg("--hidden", "8"));
const baseLr = Number(arg("--lr", lang === "he" ? "0.0005" : "0.001"));
const lrDecay = Number(arg("--lrDecay", "0.5"));
const maxRetries = Number(arg("--maxRetries", "4"));

const iterations = Number(arg("--iterations", lang === "he" ? "120" : "180"));
const errorThresh = Number(arg("--errorThresh", "0.02"));

console.log(`Training LSTM (${lang})`);
console.log({
  sourceTotal: cleanedAll.length,
  filteredTotal: cleaned.length,
  maxTokens: MAX_TOKENS,
  train: train.length,
  val: val.length,
  test: test.length,
  hiddenLayers: [hidden],
  baseLearningRate: baseLr,
  lrDecay,
  maxRetries,
  splitSeed,
});

const attempts = [];
let finalNet = null;
let result = { error: "non-finite", iterations: "stopped-after-retries" };
let usedLearningRate = null;
let crashed = true;

for (let attempt = 0; attempt <= maxRetries; attempt++) {
  const currentLr = baseLr * Math.pow(lrDecay, attempt);
  const trainingStats = [];
  let trainResult = null;
  let failure = null;

  // Deterministic init across runs/attempts.
  Math.random = mulberry32(splitSeed + attempt);
  const net = new brain.recurrent.LSTM({
    hiddenLayers: [hidden],
    learningRate: currentLr,
  });

  console.log(`Attempt ${attempt + 1}/${maxRetries + 1} with learningRate=${currentLr}`);

  try {
    trainResult = net.train(train, {
      iterations,
      log: (stats) => {
        trainingStats.push(stats);
        console.log(stats);
      },
      logPeriod: 10,
      callback: ({ error, iterations: it }) => {
        if (!Number.isFinite(error)) {
          throw new Error(
            `Training became non-finite at iteration ${it} (error=${error}).`
          );
        }
      },
      callbackPeriod: 1,
      errorThresh,
    });

    if (!Number.isFinite(trainResult?.error)) {
      throw new Error("Training finished with non-finite final error.");
    }
  } catch (e) {
    failure = String(e.message || e);
  }

  attempts.push({
    attempt: attempt + 1,
    learningRate: currentLr,
    result: trainResult,
    failure,
    trainingStats,
  });

  if (!failure) {
    finalNet = net;
    result = trainResult;
    usedLearningRate = currentLr;
    crashed = false;
    break;
  }

  console.error(`Attempt ${attempt + 1} failed: ${failure}`);
}

if (crashed) {
  console.error("Stopped after all retry attempts due to instability.");
}

// -------------------------
// 5) Save outputs
// -------------------------
const outDir = path.join(root, "models");
fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(
  path.join(outDir, `lstm_${lang}_trainstats.json`),
  JSON.stringify(
    {
      params: {
        lang,
        hiddenLayers: [hidden],
        baseLearningRate: baseLr,
        usedLearningRate,
        lrDecay,
        maxRetries,
        iterations,
        errorThresh,
        maxTokens: MAX_TOKENS,
        seed: splitSeed,
        split: { train: 0.7, val: 0.15, test: 0.15 },
      },
      result,
      attempts,
    },
    null,
    2
  ),
  "utf-8"
);

fs.writeFileSync(
  path.join(outDir, `lstm_${lang}_splits.json`),
  JSON.stringify({ train, val, test }, null, 2),
  "utf-8"
);

fs.writeFileSync(
  path.join(outDir, `lstm_${lang}_backoff.json`),
  JSON.stringify(backoffModel, null, 2),
  "utf-8"
);

if (!crashed && finalNet) {
  fs.writeFileSync(
    path.join(outDir, `lstm_${lang}.json`),
    JSON.stringify(finalNet.toJSON()),
    "utf-8"
  );
  console.log("Saved model to /models");
} else {
  console.log("Model NOT saved (training instability detected).");
}

console.log("Training result:", result);
