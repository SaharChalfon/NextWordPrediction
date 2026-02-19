function cleanSentence(line,lang){
  if(!line) return "";
  let s=String(line).trim().replace(/\s+/g," ");

  const hasEos=/<\s*eos\s*>/i.test(s);
  s=s.replace(/<\s*eos\s*>/gi," ");

  if(lang==="en"){
    s=s.toLowerCase();
    s=s.replace(/[^a-z0-9\s]/g,"");
  } else if(lang==="he"){
    s=s.replace(/[\u0591-\u05C7]/g,""); // remove niqqud
    s=s.replace(/[^\u05D0-\u05EA0-9\s]/g,"");
  }

  s=s.replace(/\s+/g," ").trim();
  if(hasEos) s=`${s} <eos>`.trim();
  return s;
}
function tokenize(line){return line.split(" ").filter(Boolean);}
module.exports={cleanSentence,tokenize};
