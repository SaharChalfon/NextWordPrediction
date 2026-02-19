import "/ui/vendor/brain.min.js";
const brain = window.brain;

let lstmEn = null;
let lstmHe = null;
let csvNet = null;
let csvMeta = null;
let lastStats = null;
let backoffEn = null;
let backoffHe = null;

const el = (id) => document.getElementById(id);

function argmax(obj) {
  let bestK = null;
  let bestV = -Infinity;
  for (const [k, v] of Object.entries(obj)) {
    if (v > bestV) {
      bestV = v;
      bestK = k;
    }
  }
  return bestK;
}

async function fetchJson(p) {
  const r = await fetch(p);
  if (!r.ok) throw new Error(`Failed: ${p}`);
  return r.json();
}

const CATEGORY_WORDS_EN = {
  Needs: ["help", "please", "need"],
  Feelings: ["happy", "sad", "tired", "hungry", "thirsty", "calm", "stressed", "scared"],
  Actions: ["go", "eat", "drink", "call", "open", "close", "read", "draw", "play", "rest", "wait", "talk"],
  People: ["mom", "dad", "doctor", "nurse", "teacher", "friend"],
  Objects: ["water", "food", "juice", "tea", "coffee", "bread", "soup", "rice", "phone", "music", "medicine", "blanket", "pillow"],
  Places: ["home", "school", "hospital", "room", "kitchen", "bathroom", "outside", "garden", "class"],
};

const CATEGORY_WORDS_HE = {
  Needs: ["עזרה", "בבקשה", "צריך", "רוצה"],
  Feelings: ["שמח", "עצוב", "עייף", "רעב", "צמא", "רגוע", "לחוץ", "מפחד"],
  Actions: ["ללכת", "לאכול", "לשתות", "להתקשר", "לפתוח", "לסגור", "לקרוא", "לצייר", "לשחק", "לנוח", "לחכות", "לדבר"],
  People: ["אמא", "אבא", "רופא", "אחות", "מורה", "חבר"],
  Objects: ["מים", "אוכל", "מיץ", "תה", "קפה", "לחם", "מרק", "אורז", "טלפון", "מוזיקה", "תרופה", "שמיכה", "כרית"],
  Places: ["בית", "ספר", "חולים", "חדר", "מטבח", "שירותים", "בחוץ", "גינה", "כיתה"],
};

const CATEGORY_FALLBACK_EN = {
  Needs: ["help", "please", "need"],
  Feelings: ["tired", "sad", "happy"],
  Actions: ["go", "eat", "drink"],
  People: ["mom", "doctor", "dad"],
  Objects: ["water", "food", "phone"],
  Places: ["home", "bathroom", "hospital"],
};

const CATEGORY_FALLBACK_HE = {
  Needs: ["עזרה", "בבקשה", "צריך"],
  Feelings: ["עייף", "עצוב", "שמח"],
  Actions: ["ללכת", "לאכול", "לשתות"],
  People: ["אמא", "רופא", "אבא"],
  Objects: ["מים", "אוכל", "טלפון"],
  Places: ["בית", "שירותים", "חולים"],
};

function normalizeWord(word, lang) {
  if (!word) return "";
  const s = String(word).replace(/[<>]/g, "").trim();
  if (lang === "he") return s.replace(/[\u0591-\u05C7]/g, "").replace(/[^\u05D0-\u05EA0-9\s]/g, "").trim();
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
}

function wordCategory(word, lang) {
  const token = normalizeWord(word, lang);
  if (!token) return null;

  const map = lang === "he" ? CATEGORY_WORDS_HE : CATEGORY_WORDS_EN;
  for (const [cat, words] of Object.entries(map)) {
    if (words.includes(token)) return cat;
  }
  return null;
}

function getBackoffCandidates(backoff, prefix, limit = 8) {
  if (!backoff || !backoff.tables) return [];
  const toks = prefix.trim().split(/\s+/).filter(Boolean);
  const maxContext = Number(backoff.maxContext || 0);

  for (let k = Math.min(maxContext, toks.length); k >= 1; k--) {
    const key = toks.slice(-k).join(" ");
    const counts = backoff.tables[String(k)]?.[key];
    if (!counts) continue;

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([word, count]) => ({ word, count }));
  }

  return [];
}

function extractLstmNextWord(net, prefix, lang) {
  const cont = net.run(prefix);
  const full = (prefix + " " + cont).replace(/\s+/g, " ").trim();
  const pt = prefix.trim().split(/\s+/).filter(Boolean);
  const ft = full.split(/\s+/).filter(Boolean);
  const next = ft[pt.length] || "";
  const clean = normalizeWord(next, lang);
  if (!clean || clean.toLowerCase() === "eos") return "";
  return clean;
}

function buildSuggestions(net, prefix, backoff, lang, limit = 8) {
  const scoreByWord = new Map();
  const add = (rawWord, score) => {
    const word = normalizeWord(rawWord, lang);
    if (!word || word.toLowerCase() === "eos") return;
    const prev = scoreByWord.get(word) ?? -Infinity;
    if (score > prev) scoreByWord.set(word, score);
  };

  const variants = [prefix, `${prefix} `, `${prefix}  `];
  for (let v = 0; v < variants.length; v++) {
    const p = variants[v];

    const lstmWord = extractLstmNextWord(net, p, lang);
    add(lstmWord, 3 - v * 0.2);

    const backoffCandidates = getBackoffCandidates(backoff, p, limit + 4);
    for (let i = 0; i < backoffCandidates.length; i++) {
      const c = backoffCandidates[i];
      add(c.word, 2.5 - i * 0.12 - v * 0.05);
    }
  }

  return [...scoreByWord.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)
    .slice(0, limit);
}

function rerankByCategory(suggestions, predictedCategory, lang, limit = 5) {
  if (!predictedCategory) return suggestions.slice(0, limit);

  const pool = [...suggestions];
  const fallback = (lang === "he" ? CATEGORY_FALLBACK_HE : CATEGORY_FALLBACK_EN)[predictedCategory] || [];

  for (const w of fallback) {
    const nw = normalizeWord(w, lang);
    if (!nw) continue;
    if (!pool.includes(nw)) pool.push(nw);
  }

  return pool
    .map((word, index) => {
      const cat = wordCategory(word, lang);
      const match = cat === predictedCategory ? 1 : 0;
      return {
        word,
        score: match * 100 - index,
      };
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.word)
    .slice(0, limit);
}

function minMax(v, min, max) {
  if (max === min) return 0;
  return (v - min) / (max - min);
}

function buildCsvInput(meta, form) {
  const CATS = meta.categories;
  const TIMES = ["morning", "afternoon", "evening", "night"];
  const oneHot = (value, values, prefix = "") => {
    const o = {};
    for (const v of values) o[prefix + v] = value === v ? 1 : 0;
    return o;
  };

  return {
    ...oneHot(form.prevCategory, CATS, ""),
    ...oneHot(form.timeBucket, TIMES, "time_"),
    session_len: form.sessionLenNorm,
    user_speed: form.userSpeedNorm,
    prev_word_len: form.prevWordLenNorm,
  };
}

el("btnLoadModels").addEventListener("click", async () => {
  try {
    el("loadStatus").textContent = "Loading...";

    const [enJson, heJson, csvJson, csvMetaJson, enBackoff, heBackoff] = await Promise.all([
      fetchJson("/models/lstm_en.json"),
      fetchJson("/models/lstm_he.json"),
      fetchJson("/models/csv_net.json"),
      fetchJson("/models/csv_net_meta.json"),
      fetchJson("/models/lstm_en_backoff.json").catch(() => null),
      fetchJson("/models/lstm_he_backoff.json").catch(() => null),
    ]);

    lstmEn = new brain.recurrent.LSTM();
    lstmEn.fromJSON(enJson);

    lstmHe = new brain.recurrent.LSTM();
    lstmHe.fromJSON(heJson);

    csvNet = new brain.NeuralNetwork();
    csvNet.fromJSON(csvJson);
    csvMeta = csvMetaJson;

    backoffEn = enBackoff;
    backoffHe = heBackoff;

    try {
      lastStats = {
        en: await fetchJson("/models/lstm_en_eval.json"),
        he: await fetchJson("/models/lstm_he_eval.json"),
        csv: await fetchJson("/models/csv_eval.json"),
      };
    } catch {
      // keep UI usable if stats files are missing
    }

    el("loadStatus").textContent = "Loaded ✅";
  } catch (e) {
    el("loadStatus").textContent = "Load failed ❌";
    console.error(e);
    alert(e.message);
  }
});

el("btnPredict").addEventListener("click", () => {
  if (!lstmEn || !lstmHe || !csvNet || !csvMeta) {
    alert("Load models first.");
    return;
  }

  const lang = el("lang").value;
  const prefix = el("prefix").value.trim();
  if (!prefix) {
    alert("Enter a prefix");
    return;
  }

  const timeBucket = el("timeBucket").value;
  const prevCategory = el("prevCategory").value;
  const sessionLen = Number(el("sessionLen").value);
  const userSpeed = Number(el("userSpeed").value);
  const prevWordLen = Number(el("prevWordLen").value);

  const st = csvMeta.stats;
  const sessionLenNorm = minMax(sessionLen, st.session_len.min, st.session_len.max);
  const userSpeedNorm = minMax(userSpeed, st.user_speed.min, st.user_speed.max);
  const prevWordLenNorm = minMax(prevWordLen, st.prev_word_len.min, st.prev_word_len.max);

  const inp = buildCsvInput(csvMeta, {
    timeBucket,
    prevCategory,
    sessionLenNorm,
    userSpeedNorm,
    prevWordLenNorm,
  });

  const out = csvNet.run(inp);
  const predictedCategory = argmax(out);
  el("csvCat").textContent = predictedCategory || "—";

  const net = lang === "he" ? lstmHe : lstmEn;
  const backoff = lang === "he" ? backoffHe : backoffEn;

  const rawSuggestions = buildSuggestions(net, prefix, backoff, lang, 8);
  const reranked = rerankByCategory(rawSuggestions, predictedCategory, lang, 5);

  el("lstmNext").textContent = rawSuggestions[0] || "—";
  el("rawSuggestions").textContent = rawSuggestions.length ? rawSuggestions.join(" | ") : "—";
  el("suggestions").textContent = reranked.length ? reranked.join(" | ") : "—";
});

el("btnShowStats").addEventListener("click", () => {
  if (!lastStats) {
    el("stats").textContent = "No stats yet. Run eval scripts, then reload.";
    return;
  }
  el("stats").textContent = JSON.stringify(lastStats, null, 2);
});
