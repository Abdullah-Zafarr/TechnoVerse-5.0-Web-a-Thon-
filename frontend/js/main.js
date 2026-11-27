// Connectivity indicators and bootstrap
addEventListener("offline",()=>{const n=$("#net");if(n){n.className="pill off";n.textContent="Offline"}const o=$("#off");o&&(o.hidden=false);changed()});
addEventListener("online",()=>{const n=$("#net");if(n){n.className="pill";n.textContent="Connected"}const o=$("#off");o&&(o.hidden=true);changed();toast("Back online — answers synced")});
document.addEventListener("visibilitychange",()=>{if(document.hidden&&iv&&!sbx&&S.sel){S.inc.unshift({n:U().n,e:"Left the exam tab",t:new Date().toLocaleTimeString()});save()}});
document.documentElement.style.setProperty("--fs",S.prefs.fs+"px");
applyTheme();window.matchMedia&&matchMedia("(prefers-color-scheme:dark)").addEventListener("change",()=>{if(!S.prefs.theme){applyTheme();render()}});
if(!location.hash)location.hash="login";render();
