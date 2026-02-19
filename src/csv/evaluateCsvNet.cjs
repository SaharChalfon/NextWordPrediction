const fs=require("fs");
const path=require("path");
const brain=require("brain.js");
const {loadCsv}=require("./loadCsv.cjs");
const {preprocess}=require("./preprocessCsv.cjs");
const {accuracy,confusionMatrix,printConfusion}=require("../utils/metrics.cjs");
const root=path.resolve(process.cwd());
const csvPath=path.join(root,"data","usage_logs.csv");
const modelPath=path.join(root,"models","csv_net.json");
const metaPath=path.join(root,"models","csv_net_meta.json");
if(!fs.existsSync(csvPath)){console.error("Missing usage_logs.csv. Run: npm run gen:data");process.exit(1);}
if(!fs.existsSync(modelPath)||!fs.existsSync(metaPath)){console.error("Missing CSV model. Train first: npm run train:csv");process.exit(1);}
const rows=loadCsv(csvPath);
const {data}=preprocess(rows);
const split=Math.floor(data.length*0.8);
const test=data.slice(split);
const net=new brain.NeuralNetwork();net.fromJSON(JSON.parse(fs.readFileSync(modelPath,"utf-8")));
const meta=JSON.parse(fs.readFileSync(metaPath,"utf-8"));const labels=meta.categories;
function argmax(obj){let bestK=null,bestV=-Infinity;for(const [k,v] of Object.entries(obj)){if(v>bestV){bestV=v;bestK=k;}}return bestK;}
const yTrue=[], yPred=[];
for(const d of test){const out=net.run(d.input);yTrue.push(d.label);yPred.push(argmax(out));}
const acc=accuracy(yTrue,yPred);const cm=confusionMatrix(labels,yTrue,yPred);
console.log(`CSV Test samples: ${yTrue.length}`);
console.log(`CSV Accuracy: ${(acc*100).toFixed(2)}%`);
console.log("\nConfusion Matrix:");
console.log(printConfusion(labels,cm));
const out={testSamples:yTrue.length,accuracy:acc,confusionMatrix:cm,labels,evaluatedAt:new Date().toISOString()};
fs.writeFileSync(path.join(root,"models","csv_eval.json"), JSON.stringify(out,null,2), "utf-8");
