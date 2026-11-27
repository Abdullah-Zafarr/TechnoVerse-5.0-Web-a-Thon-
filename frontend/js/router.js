// Hash router and app shell
function render(){const n=location.hash.slice(1)||"login",r=$("#root"),u=U();
 if(n==="verify"&&!u){r.innerHTML=`<div class="lgn">${V.verify()}<p style="margin-top:12px"><a href="#login">← Sign in</a></p></div>${fab()}`;return}
 if(!u||n==="login"){if(u&&n==="login"){go(HOME[u.r]);return}r.innerHTML=V.login()+fab();return}
 const ok=NAV[u.r].some(x=>x[0]===n)||HID[u.r].includes(n);if(!ok){go(HOME[u.r]);return}
 if(n!=="c-exam"&&n!=="ex-sandbox"&&iv){clearInterval(iv);iv=null}
 if(n==="c-brief"&&!S.sel){go("c-home");return}
 if(n==="c-exam"&&(!S.sel||!S.att[S.sel]||S.att[S.sel].done)){go("c-home");return}
 sbx=n==="ex-sandbox";
 const nv=NAV[u.r].map(x=>`<a href="#${x[0]}" ${x[0]===n||(n==="c-brief"||n==="c-exam")&&x[0]==="c-home"?'aria-current="page"':""}>${x[1]}</a>`).join("");
 r.innerHTML=`<header class="nb"><div class="lg"><b>EG</b><div>ExamGuard<small>${u.r[0].toUpperCase()+u.r.slice(1)} Portal</small></div></div><nav aria-label="Main">${nv}</nav><span class="sp"></span><span class="pill ${navigator.onLine?"":"off"}" id="net">${navigator.onLine?"Connected":"Offline"}</span><div class="usr"><b>${esc(u.n)}</b><small>${esc(u.reg||u.e)}</small></div><button class="btn tg" data-a="theme" aria-label="Switch theme">${theme()==="dark"?"☀ Light":"☾ Dark"}</button><button class="btn" data-a="out">Sign Out</button></header><main>${V[n]()}</main>`;
 if(n==="c-exam"||n==="ex-sandbox")startWS()}
addEventListener("hashchange",render);
