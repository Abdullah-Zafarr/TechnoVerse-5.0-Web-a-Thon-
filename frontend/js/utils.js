// Utilities: DOM helpers, escaping, dates, toast, IDs
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const fd=t=>new Date(t).toLocaleString("en-US",{month:"short",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"});
const toast=m=>{const t=$("#toast");t.textContent=m;t.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>t.hidden=true,2600)};
const KEY="examguard-v1",MIN=6e4,rid=()=>Math.random().toString(36).slice(2,6).toUpperCase(),vid=()=>"EXM-"+rid()+"-"+rid(),mailOK=e=>/^\S+@\S+\.\S+$/.test(e);
