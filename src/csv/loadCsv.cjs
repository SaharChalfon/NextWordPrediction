const fs=require("fs");
const {parse}=require("csv-parse/sync");
function loadCsv(filePath){
  const csv=fs.readFileSync(filePath,"utf-8");
  return parse(csv,{columns:true,skip_empty_lines:true,trim:true});
}
module.exports={loadCsv};
