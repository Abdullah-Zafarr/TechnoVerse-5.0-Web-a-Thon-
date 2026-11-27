// Exam workspace: timer, renderer, autosave, finalize
// ---- workspace ----
const ATT=()=>sbx?SB:S.att[S.sel],EX=()=>sbx?EXs(SB.ex):EXs(S.sel);
function mkAtt(e){return{ex:e.id,start:Date.now(),cur:0,pad:"",F:e.qs.map(()=>false),A:e.qs.map((x,i)=>S.bank[x[0]].k==="multi"?[]:S.bank[x[0]].k==="text"?"":null),done:false}}
V["c-exam"]=V["ex-sandbox"]=()=>`<div id="xr"></div>`;
function startWS(){if(sbx&&!SB){SB=mkAtt(S.exams.find(e=>e.id===+(S.sbxId||1)));SB.start=Date.now()}drawX();if(iv)clearInterval(iv);iv=setInterval(tick,1000)}
const answered=(a,i)=>Array.isArray(a.A[i])?a.A[i].length>0:!!a.A[i];
const dl=()=>{const e=EX(),a=ATT();return sbx?a.start+e.d*MIN:Math.min(a.start+e.d*MIN,e.to)};
