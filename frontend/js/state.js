// State, persistence, themes, selectors, navigation maps
let S;try{S=JSON.parse(localStorage.getItem(KEY))}catch(e){}S=S||seed();
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}};
const sysDark=()=>!!(window.matchMedia&&matchMedia("(prefers-color-scheme:dark)").matches),theme=()=>S.prefs.theme||(sysDark()?"dark":"light"),applyTheme=()=>{document.documentElement.dataset.theme=theme()},fab=()=>`<button class="btn tg fx" data-a="theme" aria-label="Switch theme">${theme()==="dark"?"☀ Light":"☾ Dark"}</button>`;
