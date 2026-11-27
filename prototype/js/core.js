function toast(m){$("#tt").innerHTML=`<div class="toast">${m}</div>`;setTimeout(()=>$("#tt").innerHTML="",2600)}
function modal(h){$("#ov").innerHTML=h?`<div class="ov" onclick="if(event.target==this)modal()"><div class="md">${h}</div></div>`:""}
function go(p,x){S.page=p;if(x!==undefined)S.ex=x;clearInterval(S.tm);R()}
function login(r){S.user=U.find(u=>u.role==r);S.page="dash";R()}
const NAV={Candidate:[["dash","Examinations"],["results","Published Results"],["verify","Verify Report"]],Examiner:[["dash","Examinations"],["bank","Question Bank"],["monitor","Monitoring"],["grade","Grading"],["analytics","Analytics"],["disputes","Disputes"],["verify","Verify Report"]],Administrator:[["dash","Users & Roles"],["verify","Verify Report"]]};
function R(){const u=S.user,a=$("#app");if(!u){a.innerHTML=loginV();return}
if(S.page=="work"){a.innerHTML=work();return}
a.innerHTML=`<header class="noprint"><div class="logo"><b>EG</b><div>ExamGuard<small>${u.role} Portal</small></div></div><nav>${NAV[u.role].map(n=>`<a href="#" class="${S.page==n[0]?"on":""}" onclick="go('${n[0]}');return false">${n[1]}</a>`).join("")}</nav>
<span class="pill ok" id="net"><span class="dot"></span>Connected</span><div class="sm" style="text-align:right"><b>${u.name}</b><br><span class="mu">${u.reg||u.email}</span></div><button class="btn g s" onclick="S.user=null;R()">Sign out</button></header><main>${({dash:u.role=="Candidate"?cDash:u.role=="Examiner"?eDash:aDash,results:cRes,verify:verifyV,bank:bank,monitor:monitor,grade:grade,analytics:analytics,disputes:disp,instr:instr,create:create,report:report})[S.page]()}</main>`}
