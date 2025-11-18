function norm(s){
  if(!s) return "";
  let t=(""+s).trim();
  if(t.startsWith("```")) t=t.replace(/^```[a-z0-9-]*\s*/i,"").replace(/```$/i,"").trim();
  if((t.startsWith('"')&&t.endsWith('"'))||(t.startsWith("'")&&t.endsWith("'"))) t=t.slice(1,-1);
  t=t.replace(/(^|\n)---BEGIN TEXT---(\n|$)/gi,"").replace(/(^|\n)---END TEXT---(\n|$)/gi,"").trim();
  return t;
}

function toast(msg,isErr){
  const d=document.createElement("div");
  Object.assign(d.style,{
    position:"fixed",left:"50%",top:"24px",transform:"translateX(-50%)",zIndex:2147483647,
    background:isErr?"#c8333b":"rgba(15,20,30,.95)",color:"#fff",padding:"10px 14px",
    border:"1px solid rgba(255,255,255,.25)",borderRadius:"10px",boxShadow:"0 8px 30px rgba(0,0,0,.35)",font:"14px system-ui"
  });
  d.textContent=msg||"(empty)"; document.documentElement.appendChild(d); setTimeout(()=>d.remove(),3000);
}

function replaceSel(text){
  const t=norm(text);
  const a=document.activeElement; const sel=window.getSelection();
  if(a&&(a.tagName==="TEXTAREA"||(a.tagName==="INPUT"&&a.type==="text"))){
    const s=a.selectionStart,e=a.selectionEnd; const v=a.value;
    a.value=v.slice(0,s)+t+v.slice(e); a.setSelectionRange(s+t.length,s+t.length);
    a.dispatchEvent(new Event("input",{bubbles:true}));
    return true;
  }
  if(sel&&sel.rangeCount){ const r=sel.getRangeAt(0); r.deleteContents(); r.insertNode(document.createTextNode(t)); r.collapse(false); return true; }
  return false;
}

chrome.runtime.onMessage.addListener((msg)=>{
  // Accept both the new and legacy message types
  if(msg.type==="SHOW_TOAST" || msg.type==="TOAST"){
    const text = msg.payload?.translated ?? msg.text ?? msg.payload?.text ?? "";
    const isErr = !!(msg.payload?.error || msg.error);
    toast(text||"(empty)", isErr);
  }
  if(msg.type==="COPY_TO_CLIPBOARD"){
    const text = msg.payload?.text || msg.payload?.translated || msg.text || "";
    navigator.clipboard?.writeText(text).catch(()=>{});
  }
  if(msg.type==="REPLACE_SELECTION" || msg.type==="REPLACE"){
    const text = msg.payload?.translated ?? msg.text ?? "";
    if(!replaceSel(text)) toast("Can't replace here; copy from toast.", true);
  }
});