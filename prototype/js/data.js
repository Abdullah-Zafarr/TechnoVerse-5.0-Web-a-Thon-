const $=s=>document.querySelector(s);
const U=[{id:1,name:"Admin Rauf",email:"admin@examguard.pk",role:"Administrator"},{id:2,name:"Dr. Sana Malik",email:"sana@secureexam.pk",role:"Examiner"},{id:3,name:"Amina Tariq",email:"amina@secureexam.pk",role:"Candidate",reg:"FA23-BCS-0419"},{id:4,name:"Bilal Ahmed",email:"bilal@secureexam.pk",role:"Candidate",reg:"FA23-BCS-0102"},{id:5,name:"Hira Khan",email:"hira@secureexam.pk",role:"Candidate",reg:"FA23-BCS-0233"}];
const Q=[
{id:1,t:"Which protocol guarantees consensus among nodes using a leader and replicated log?",ty:"mcq",cat:"Consensus",d:"Easy",m:5,o:["Raft","Gossip","Two-Phase Locking","CSMA/CD"],a:[0],ok:82,sk:3},
{id:2,t:"Select ALL properties of the CAP theorem trade-off a partition-tolerant system must choose between.",ty:"multi",cat:"Theory",d:"Medium",m:5,o:["Consistency","Availability","Durability","Latency"],a:[0,1],ok:51,sk:9},
{id:3,t:"Which mechanism detects crashed nodes using periodic liveness messages?",ty:"mcq",cat:"Failure detection",d:"Easy",m:5,o:["Heartbeats","Checksums","Sharding","Quorum reads"],a:[0],ok:90,sk:1},
{id:4,t:"Which of these are valid replication strategies?",ty:"multi",cat:"Replication",d:"Medium",m:5,o:["Leader-follower","Multi-leader","Leaderless","Round-robin DNS"],a:[0,1,2],ok:44,sk:12},
{id:5,t:"Explain eventual consistency and give one real-world system that uses it.",ty:"text",cat:"Theory",d:"Hard",m:5,o:[],a:[],ok:60,sk:18},
{id:6,t:"Describe how a quorum of W + R > N prevents stale reads.",ty:"text",cat:"Consensus",d:"Hard",m:5,o:[],a:[],ok:38,sk:25}];
const S={user:null,page:"dash",tab:"Available",ex:null,at:null,exams:[
{id:"cs301",code:"CS-301-MID",title:"Distributed Systems & Fault Tolerance",desc:"Consensus protocols, replication, failure detection and eventual consistency.",dur:45,marks:30,pass:15,st:"Ongoing",win:"Nov 27, 11:17 AM – 4:17 PM",qs:[1,2,3,4,5,6],cand:[3,4,5],rnd:true},
{id:"se402",code:"SE-402-FIN",title:"Software Security & Web Architecture",desc:"OWASP Top 10 mitigations, server-side authorization and secure API design.",dur:60,marks:40,pass:20,st:"Ongoing",win:"Nov 27, 11:47 AM – 3:17 PM",qs:[1,2,3],cand:[3],rnd:false},
{id:"ml210",code:"ML-210-QZ",title:"Applied Machine Learning Quiz",desc:"Supervised learning, evaluation metrics and model selection.",dur:30,marks:20,pass:10,st:"Published",win:"Nov 28, 10:00 AM – 12:00 PM",qs:[1,3],cand:[3,4],rnd:true},
{id:"db204",code:"DB-204-MID",title:"Database Internals & Indexing",desc:"B-trees, query planning and transaction isolation.",dur:60,marks:50,pass:25,st:"Completed",win:"Nov 20",qs:[],cand:[3],rnd:false,res:{got:43,pub:true,id:"VR-7F3K-92QX"}},
{id:"os101",code:"OS-101-DR",title:"Operating Systems Draft",desc:"Scheduling and memory management.",dur:40,marks:25,pass:12,st:"Draft",win:"Unscheduled",qs:[],cand:[],rnd:false}]};
let qbank=Q,inc=[{n:"Hira Khan",e:"Switched tab (2s)",t:"11:42"},{n:"Bilal Ahmed",e:"Connection lost 40s, recovered",t:"11:51"}],disputes=[{id:1,n:"Amina Tariq",ex:"DB-204-MID",why:"Q4 wording ambiguous",st:"Open"}],ann=[],att=[{n:"Amina Tariq",p:4,of:6,st:"Active"},{n:"Bilal Ahmed",p:3,of:6,st:"Active"},{n:"Hira Khan",p:6,of:6,st:"Submitted"}];
const pref=(()=>{try{return JSON.parse(localStorage.getItem("sx")||"{}")}catch(e){return{}}})();const sp=()=>{try{localStorage.setItem("sx",JSON.stringify(pref))}catch(e){}};
const E=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const pc=s=>({Ongoing:"ok",Published:"in",Draft:"gr",Completed:"wn"}[s]||"gr");
