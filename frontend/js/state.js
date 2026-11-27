// State, persistence, themes, selectors, navigation maps
let S;try{S=JSON.parse(localStorage.getItem(KEY))}catch(e){}S=S||seed();
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}};
const sysDark=()=>!!(window.matchMedia&&matchMedia("(prefers-color-scheme:dark)").matches),theme=()=>S.prefs.theme||(sysDark()?"dark":"light"),applyTheme=()=>{document.documentElement.dataset.theme=theme()},fab=()=>`<button class="btn tg fx" data-a="theme" aria-label="Switch theme">${theme()==="dark"?"☀ Light":"☾ Dark"}</button>`;
const U=()=>S.users.find(u=>u.e===S.user),EXs=id=>S.exams.find(e=>e.id==id),em=e=>e.m??e.qs.reduce((a,x)=>a+x[1],0),qn=e=>e.qn??e.qs.length;
const tot=s=>s.obj+(s.w??0),mx=s=>s.ow+s.wmax,Q=(e,i)=>({...S.bank[e.qs[i][0]],m:e.qs[i][1]});
const mine=id=>S.subs.find(s=>s.ex==id&&s.n===U().n);
function st(e){const a=S.att[e.id],t=Date.now();if((a&&a.done)||mine(e.id))return"completed";if(t<e.from)return"upcoming";if(t>e.to)return"missed";return a?"progress":"available"}
const NAV={candidate:[["c-home","Examinations"],["c-results","Published Results"],["verify","Verify Report"]],examiner:[["ex-exams","Examinations"],["ex-bank","Question Bank"],["ex-monitor","Monitor"],["ex-grading","Grading"],["ex-results","Results"],["ex-import","Import"],["verify","Verify Report"]],admin:[["admin-users","Users & Roles"],["verify","Verify Report"]]};
const HID={candidate:["c-brief","c-exam"],examiner:["ex-sandbox"],admin:[]},HOME={candidate:"c-home",examiner:"ex-exams",admin:"admin-users"};
const go=n=>{location.hash=n};let TAB="available",REP=null,RX=1,SB=null,iv=null,sbx=false;
const V={};
