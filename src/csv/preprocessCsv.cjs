const {minMaxFit,minMaxTransform}=require("../utils/normalization.cjs");
const CATS=["Needs","Feelings","Actions","People","Objects","Places"];
const TIMES=["morning","afternoon","evening","night"];
function oneHot(value,values){const o={};for(const v of values)o[v]=(value===v?1:0);return o;}
function preprocess(rows){
  const cleaned=rows.filter(r=>r.prev_category&&r.time_bucket&&r.next_category&&r.session_len!==""&&r.user_speed!==""&&r.prev_word_len!=="");
  const numKeys=["session_len","user_speed","prev_word_len"];
  const stats=minMaxFit(cleaned,numKeys);
  const data=cleaned.map(r=>{
    const norm=minMaxTransform(r,stats);
    const input={
      ...oneHot(r.prev_category,CATS),
      ...Object.fromEntries(Object.entries(oneHot(r.time_bucket,TIMES)).map(([k,v])=>[`time_${k}`,v])),
      session_len:Number(norm.session_len),
      user_speed:Number(norm.user_speed),
      prev_word_len:Number(norm.prev_word_len)
    };
    const output=oneHot(r.next_category,CATS);
    return {input,output,label:r.next_category};
  });
  return {data,stats,categories:CATS};
}
module.exports={preprocess};
