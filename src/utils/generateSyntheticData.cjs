const fs=require("fs");const path=require("path");const {mulberry32}=require("./seed.cjs");
const root=path.resolve(process.cwd());const dataDir=path.join(root,"data");fs.mkdirSync(dataDir,{recursive:true});
const csvOnly=process.argv.includes("--csvOnly");

const enTemplates=[
  "i want to {verb} {obj} <eos>",
  "i need {obj} please <eos>",
  "please help me {verb} <eos>",
  "i feel {feel} today <eos>",
  "can you {verb} with {obj} <eos>",
  "i am {feel} <eos>",
  "i want to go to {place} <eos>"
];
const heTemplates=[
  "אני רוצה {verb} {obj} <eos>",
  "אני צריך {obj} בבקשה <eos>",
  "בבקשה תעזור לי {verb} <eos>",
  "אני מרגיש {feel} היום <eos>",
  "אפשר {verb} עם {obj} <eos>",
  "אני {feel} <eos>",
  "אני רוצה ללכת ל{place} <eos>"
];

const verbsEn=["drink","eat","call","go","rest","open","close","find"];
const objsEn=["water","food","doctor","mom","phone","bathroom","music","medicine"];
const feelsEn=["tired","happy","sad","hungry","thirsty","in pain","okay"];
const placesEn=["home","school","hospital","outside"];

const verbsHe=["לשתות","לאכול","להתקשר","לנוח","לפתוח","לסגור","למצוא"];
const objsHe=["מים","אוכל","רופא","אמא","טלפון","שירותים","מוזיקה","תרופה"];
const feelsHe=["עייף","שמח","עצוב","רעב","צמא","כואב לי","בסדר"];
const placesHe=["בית","בית ספר","בית חולים","בחוץ"];

function fill(t,rng,lang){
  const pick=(arr)=>arr[Math.floor(rng()*arr.length)];
  if(lang==="en"){
    return t.replace("{verb}",pick(verbsEn)).replace("{obj}",pick(objsEn)).replace("{feel}",pick(feelsEn)).replace("{place}",pick(placesEn));
  }
  return t.replace("{verb}",pick(verbsHe)).replace("{obj}",pick(objsHe)).replace("{feel}",pick(feelsHe)).replace("{place}",pick(placesHe));
}
function buildCorpus(templates,lang,seed,n){
  const rng=mulberry32(seed);const lines=[];
  for(let i=0;i<n;i++){
    const t=templates[Math.floor(rng()*templates.length)];
    lines.push(fill(t,rng,lang));
  }
  return lines;
}

if(!csvOnly){
  fs.writeFileSync(path.join(dataDir,"text_corpus_en.txt"), buildCorpus(enTemplates,"en",123,1200).join("\n"), "utf-8");
  fs.writeFileSync(path.join(dataDir,"text_corpus_he.txt"), buildCorpus(heTemplates,"he",456,1200).join("\n"), "utf-8");
}

// CSV logs
const categories=["Needs","Feelings","Actions","People","Objects","Places"];
const timeBuckets=["morning","afternoon","evening","night"];
const rng=mulberry32(999);

function ruleNext(prevCat,timeB,sessionLen,userSpeed,prevWordLen){
  // Deterministic and learnable rules, using all behavioral parameters.
  if(prevWordLen>=8) return "Objects";
  if(userSpeed<0.2) return "Needs";
  if(timeB==="night" && sessionLen>=8) return "Feelings";
  if(userSpeed>0.75 && prevWordLen<=3) return "Actions";

  if(prevCat==="People") return "People";
  if(timeB==="afternoon") return "Places";
  if(timeB==="evening") return "People";
  if(prevCat==="Actions") return "Actions";
  if(prevCat==="Needs") return "Actions";
  return "Needs";
}

const rows=["prev_category,time_bucket,session_len,user_speed,prev_word_len,next_category"];
for(let i=0;i<3000;i++){
  const prev_category=categories[Math.floor(rng()*categories.length)];
  const time_bucket=timeBuckets[Math.floor(rng()*timeBuckets.length)];
  const session_len=1+Math.floor(rng()*12);
  const user_speed=Math.round(rng()*100)/100;
  const prev_word_len=1+Math.floor(rng()*10);
  const next_category=ruleNext(prev_category,time_bucket,session_len,user_speed,prev_word_len);
  rows.push([prev_category,time_bucket,session_len,user_speed,prev_word_len,next_category].join(","));
}
fs.writeFileSync(path.join(dataDir,"usage_logs.csv"), rows.join("\n"), "utf-8");
console.log(csvOnly ? "Synthetic CSV generated: /data/usage_logs.csv" : "Synthetic data generated in /data");
