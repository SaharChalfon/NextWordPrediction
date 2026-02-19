# 
Next Word Prediction

Bilingual (`English` + `Hebrew`) next-word prediction for AAC, using:
- `Brain.js` LSTM text models
- `Brain.js` feedforward behavioral model (CSV)
- behavior-aware reranking in a local demo UI

## What This Project Includes
- Text prediction pipeline for EN/HE (`train`, `evaluate`, `serve`)
- Behavioral category prediction (`Needs`, `Feelings`, `Actions`, `People`, `Objects`, `Places`)
- UI for live prediction and stats display
- Saved outputs in `models/` (networks + eval JSON files)

## Setup
```bash
npm install
```

## Data
Use your own data in `data/` if you already have it.

Generate full synthetic data (replaces text corpora + CSV):
```bash
npm run gen:data
```

Generate behavioral CSV only (keeps text corpora):
```bash
npm run gen:data:csv
```

## Train
```bash
npm run train:text:en
npm run train:text:he
npm run train:csv
```

## Evaluate
```bash
npm run eval:text:en
npm run eval:text:he
npm run eval:csv
```

## Run UI
```bash
npm run serve:ui
```
Open: `http://127.0.0.1:3000/ui/index.html`

## UI Demo Steps
1. Click `Load models from /models`.
2. Choose language (`English` or `עברית`).
3. Enter a `Prefix` (example: `i want to` / `אני רוצה`).
4. Set behavioral context:
- `timeBucket`
- `prevCategory`
- `sessionLen`
- `userSpeed`
- `prevWordLen`
5. Click `Predict`.
6. Review outputs:
- `CSV predicted category`
- `Next word (LSTM)`
- `Suggestions (raw)`
- `Suggestions (reranked)`
7. Click `Show eval stats`.

## Important Files
- `src/text/trainLSTM.cjs`: LSTM training (includes stability retries)
- `src/text/evaluateLSTM.cjs`: validation/test evaluation
- `src/text/cleanText.cjs`: text normalization + `<eos>` handling
- `src/csv/trainCsvNet.cjs`: behavioral CSV model training
- `src/csv/evaluateCsvNet.cjs`: CSV accuracy + confusion matrix
- `ui/main.js`: UI logic, model loading, prediction, reranking
- `src/utils/serve.cjs`: local static HTTP server
- `models/`: trained models and evaluation artifacts

## Common Issues
- `Load failed` in UI: run training first and verify files exist in `models/`.
- Port `3000` already in use: stop other `node` process.
- Missing dependencies: run `npm install`.
- Lower EN quality vs HE: currently expected in this dataset/setup.

---

<div dir="rtl" align="right">

## תיאור קצר בעברית
המערכת מנבאת את המילה הבאה בשתי שפות (אנגלית ועברית) עבור תרחיש AAC.

היא משלבת:
- מודל LSTM לטקסט
- מודל CSV התנהגותי לניבוי קטגוריה
- ריראנקינג להצעות ב-UI לפי ההקשר ההתנהגותי

התיקייה `models/` כוללת את המודלים ואת קבצי ההערכה.

</div>
