// State, persistence, themes, selectors, navigation maps
let S;try{S=JSON.parse(localStorage.getItem(KEY))}catch(e){}S=S||seed();
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}};
