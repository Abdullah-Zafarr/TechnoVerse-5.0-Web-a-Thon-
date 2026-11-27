// Event handlers: clicks, inputs, forms
// ---- events ----
document.addEventListener("click",ev=>{const b=ev.target.closest("[data-a]");if(!b)return;const a=b.dataset.a,id=b.dataset.id;if(b.tagName==="A")ev.preventDefault();
 const X=ATT();
 switch(a){
 case"theme":S.prefs.theme=theme()==="dark"?"light":"dark";save();applyTheme();render();break;
 case"out":S.user=null;save();go("login");render();break;
 case"reset":try{localStorage.removeItem(KEY)}catch(e){}S=seed();render();toast("Demo data reset");break;
 case"tab":TAB=id;render();break;
 case"brief":S.sel=+id;save();go("c-brief");break;
 case"enter":{const e=EXs(S.sel),s=st(e);if(s!=="available"&&s!=="progress")return toast("This exam isn’t open right now");if(!S.att[e.id])S.att[e.id]=mkAtt(e);save();go("c-exam");break}
 case"rep":REP=id;{const s=S.subs.find(x=>x.id===id);if(U().r==="candidate"&&location.hash!=="#c-results")go("c-results");else render();setTimeout(()=>{const r=$("#rep");r&&r.scrollIntoView({behavior:"smooth"})},50)}break;
 case"opt":{const e=EX(),q=Q(e,X.cur),i=+id;if(q.k==="multi"){const A=X.A[X.cur];X.A[X.cur]=A.includes(i)?A.filter(x=>x!==i):[...A,i]}else X.A[X.cur]=X.A[X.cur]===i?null:i;changed();drawX();break}
 case"q":X.cur=+id;drawX();break;
 case"nv":{const e=EX(),n=X.cur+ +id;if(n>=e.qs.length){review();break}X.cur=Math.max(0,n);if(!sbx)save();drawX();break}
 case"fl":X.F[X.cur]=!X.F[X.cur];if(!sbx)save();paint();break;
 case"rv":review();break;
 case"cl":$("#dlg").close();break;
 case"sub":$("#dlg").close();finalize(false);break;
 case"pub":EXs(id).s="published";save();render();toast("Published to candidates");break;
 case"sbx":S.sbxId=+id;SB=null;go("ex-sandbox");render();break;
 case"del":{const u=S.users[id];if(u.e===S.user)return toast("You can’t remove yourself");S.users.splice(id,1);save();render();break}
 case"ann":S.ann=$("#an").value.trim();save();toast(S.ann?"Announcement sent":"Announcement cleared");break;
 case"annx":S.ann="";save();render();break;
 case"grade":{const el=$("#g"+id),v=el.value,x=parseFloat(v),s=S.subs[id];if(v===""||isNaN(x)||x<0||x>s.wmax){$("#ge"+id).textContent=`Enter a value between 0 and ${s.wmax}`;return}s.w=x;save();render();toast("Grade saved");break}
 case"pubr":S.subs.filter(s=>s.ex==id).forEach(s=>s.pub=true);save();render();toast("Results published — candidates can now view their own");break;
 case"imp":{const L=$("#csv").value.trim().split(/\r?\n/).slice(1),er=[];let ok=0;L.forEach((l,i)=>{const[n,e,r]=l.split(",").map(s=>(s||"").trim()),p=[];if(!n)p.push("name is required");if(!mailOK(e||""))p.push("invalid email");else if(S.users.some(u=>u.e===e))p.push("already exists");if(!p.length){S.users.push({n,e,r:"candidate",reg:r||"—",dep:"Computer Science"});ok++}else er.push(`Row ${i+2}: ${p.join(", ")}`)});save();$("#ir").innerHTML=`<span class="bdg b-ok">${ok} imported</span> ${er.length?`<span class="bdg b-bad">${er.length} rejected</span><ul style="color:var(--bad)">${er.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`:""}`;break}
 case"ver":{const v=$("#vi").value.trim().toUpperCase(),s=S.subs.find(x=>x.id===v&&x.pub);$("#vr").innerHTML=s?`<div class="card" style="border-color:var(--okl);margin:0"><span class="bdg b-ok">✓ Authentic report</span><p style="margin-top:8px">Issued to <b>${s.n.split(" ").map(w=>w[0]+".").join(" ")}</b> for <b>${esc(EXs(s.ex).t)}</b>.</p><p class="mut" style="font-size:.85rem">Scores and personal details aren’t shown here.</p></div>`:`<div class="card" style="border-color:var(--badl);margin:0"><span class="bdg b-bad">No match</span><p style="margin-top:8px">That ID doesn’t correspond to an issued report.</p></div>`;break}
 }});
