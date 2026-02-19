const {mulberry32}=require("../utils/seed.cjs");
function splitTrainValTest(lines,seed=42,trainRatio=0.7,valRatio=0.15){
  const rng=mulberry32(seed);
  const arr=[...lines];
  for(let i=arr.length-1;i>0;i--){
    const j=Math.floor(rng()*(i+1));
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
  const n=arr.length;
  const nTrain=Math.floor(n*trainRatio);
  const nVal=Math.floor(n*valRatio);
  return {train:arr.slice(0,nTrain), val:arr.slice(nTrain,nTrain+nVal), test:arr.slice(nTrain+nVal)};
}
module.exports={splitTrainValTest};
