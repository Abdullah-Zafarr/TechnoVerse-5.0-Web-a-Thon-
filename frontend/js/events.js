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
function review(){const e=EX(),a=ATT(),un=e.qs.map((_,i)=>i).filter(i=>!answered(a,i)),fl=a.F.map((f,i)=>f?i+1:0).filter(Boolean),d=$("#dlg");d.innerHTML=`<h2>Ready to submit?</h2><p style="margin:10px 0"><b>${e.qs.length-un.length}</b> answered · <b>${un.length}</b> unanswered${un.length?` (Q${un.map(i=>i+1).join(", Q")})`:""} · <b>${fl.length}</b> marked for review.</p><p class="mut" style="font-size:.9rem">You can’t change answers after submitting.</p><div class="row" style="margin-top:14px"><button class="btn" data-a="cl">Keep working</button><button class="btn p" data-a="sub">Submit</button></div>`;d.showModal()}
document.addEventListener("input",ev=>{const t=ev.target,k=t.dataset.in;if(!k)return;
 if(k==="ans"){const a=ATT();a.A[a.cur]=t.value;changed();paint()}
 else if(k==="pad"){ATT().pad=t.value;changed()}
 else if(k==="fs"){S.prefs.fs=+t.value;document.documentElement.style.setProperty("--fs",t.value+"px");save()}
 else if(k==="role"){S.users[t.dataset.id].r=t.value;save();toast("Role updated")}
 else if(k==="rx"){RX=+t.value;render()}});
document.addEventListener("change",ev=>{if(ev.target.id==="fi"){const f=ev.target.files[0];f&&f.text().then(t=>$("#csv").value=t)}if(ev.target.id==="c1"||ev.target.id==="c2"){$("#go").disabled=!($("#c1").checked&&$("#c2").checked)}if(ev.target.dataset.in==="role"||ev.target.dataset.in==="rx")ev.target.dispatchEvent(new Event("input",{bubbles:true}))});
document.addEventListener("click",ev=>{const r=ev.target.closest("#rs button");if(r){$$("#rs button").forEach(x=>x.setAttribute("aria-selected",x===r));$("#em").value=r.dataset.r+"@examguard.test"}});
document.addEventListener("submit",ev=>{ev.preventDefault();const f=ev.target.id;
 if(f==="lf"){const e=$("#em").value.trim(),p=$("#pw").value;$("#e1").textContent=mailOK(e)?"":"Enter a valid email address";$("#e2").textContent=p.length>=6?"":"At least 6 characters";if(!mailOK(e)||p.length<6)return;const u=S.users.find(x=>x.e===e);if(!u||p!=="demo1234"){$("#e2").textContent="Email or password is incorrect";return}S.user=u.e;save();go(HOME[u.r]);render()}
 if(f==="uf"){const n=$("#un").value.trim(),e=$("#ue").value.trim();if(!n||!mailOK(e)){$("#ue1").textContent="Name and a valid email are required";return}if(S.users.some(u=>u.e===e)){$("#ue1").textContent="That email already exists";return}S.users.push({n,e,r:$("#ur").value,reg:"—",dep:"—"});save();render();toast("User created")}
 if(f==="xf"){const c=$("#xc").value.trim(),t=$("#xt").value.trim(),w=$("#xw").value,d=+$("#xd").value,n=+$("#xn").value;if(!c||!t||!w||d<1||n<1||n>S.bank.length){$("#xe").textContent=`Code, title, opening time, a positive duration and 1–${S.bank.length} questions are required`;return}const from=new Date(w).getTime(),ids=S.bank.map((_,i)=>i).sort(()=>Math.random()-.5).slice(0,n);S.exams.unshift({id:Date.now(),code:c,dep:"Computer Science",t,desc:"Examiner-created assessment.",d,from,to:from+d*MIN+36e5,s:"draft",qs:ids.map(i=>[i,5])});save();render();toast("Saved as draft")}
 if(f==="qf"){const t=$("#qt").value.trim(),k=$("#qk").value,tp=$("#qp").value.trim(),o=$("#qo").value.split("\n").map(s=>s.trim()).filter(Boolean),c=$("#qc").value.split(",").map(s=>+s.trim()-1).filter(x=>!isNaN(x));let m="";if(t.length<10||!tp)m="Write the question (10+ characters) and add a topic";else if(k!=="text"){if(o.length<2||o.length>4)m="Provide 2–4 options";else if(!c.length||c.some(x=>x<0||x>=o.length))m="Correct option numbers must match the options";else if(k==="mcq"&&c.length>1)m="Single-answer questions have one correct option"}if(m){$("#qe").textContent=m;return}S.bank.push(k==="text"?{t,k,tp,d:$("#qd").value,sk:0,ok:0}:{t,k,tp,d:$("#qd").value,o,c:k==="mcq"?c[0]:c,sk:0,ok:0});save();render();toast("Question added")}});
