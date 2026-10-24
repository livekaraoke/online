from pathlib import Path
p=Path("ls26try/admin-new/js/top-statusbar-session-tools.js")
s=p.read_text()
def change(old,new):
 global s
 if s.count(old)!=1: raise ValueError(f"{p}: expected one match ({s.count(old)}): {old[:90]}")
 s=s.replace(old,new)
change(
 "    const finish=$(\"smartRunTools\"); if (finish&&finish.parentElement!==row) row.append(finish);",
 """    // Keep the one existing Finish/Next control with Song Complete in LyricView.
    const finish=$("smartRunTools");
    const panel=$("endCompletionPanel"),slot=$("endCompletionFinishSlot");
    const destination=slot&&panel&&!panel.hidden?slot:row;
    if(finish&&finish.parentElement!==destination)destination.append(finish);"""
)
change(
 """    return state.db.runTransaction(async tx=>{
      const snap=await tx.get(ref),data=snap.data()||{};
      if((state.sessionId||"")!==sessionId)throw Error('Session changed. Refresh before reordering.');
      if((data.sessionId||"")!==sessionId)throw Error('Run Order changed. Refresh before reordering.');
      const items=(data.items||[]).map(x=>({...x}));
      const terminal=new Set(['playing','played','abandoned','left','declined','deleted','deletedbyhost','cancelled']);
      const indexes=items.map((x,i)=>terminal.has(String(x.status||'').toLowerCase())?-1:i).filter(i=>i>=0);
      const at=indexes.findIndex(i=>items[i].id===itemId),to=at+direction;
      if(at<0||to<0||to>=indexes.length)return false;
      [items[indexes[at]],items[indexes[to]]]=[items[indexes[to]],items[indexes[at]]];
      tx.set(ref,{items,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
      return true;
    });""",
 """    const updated=await state.db.runTransaction(async tx=>{
      const snap=await tx.get(ref),data=snap.data()||{};
      if((state.sessionId||"")!==sessionId)throw Error('Session changed. Refresh before reordering.');
      if((data.sessionId||"")!==sessionId)throw Error('Run Order changed. Refresh before reordering.');
      const items=(data.items||[]).map(x=>({...x}));
      const terminal=new Set(['playing','played','completed','finished','abandoned','left','declined','deleted','deletedbyhost','cancelled']);
      const indexes=items.map((x,i)=>terminal.has(String(x.status||'').toLowerCase())?-1:i).filter(i=>i>=0);
      const at=indexes.findIndex(i=>items[i].id===itemId),to=at+direction;
      if(at<0||to<0||to>=indexes.length)return null;
      [items[indexes[at]],items[indexes[to]]]=[items[indexes[to]],items[indexes[at]]];
      tx.set(ref,{items,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
      return items;
    });
    if(!updated)return false;
    // Show the committed order immediately; keep the existing Firestore snapshot
    // as authoritative when it arrives. No extra listener or write.
    if(state.sessionId===sessionId){
      state.runOrder={...state.runOrder,sessionId,items:updated};
      renderRunOrder();
      window.dispatchEvent(new CustomEvent('lk:runorder-updated',{detail:{sessionId,items:updated}}));
    }
    return true;"""
)
p.write_text(s)
p=Path("ls26try/shared/performance-tools-ui.js")
s=p.read_text()
def change2(old,new):
 global s
 if s.count(old)!=1:raise ValueError(f"{p}: expected one match ({s.count(old)}): {old[:85]}")
 s=s.replace(old,new)
change2(
 "if(box.parentElement!==row)row.append(box);",
 """const panel=$('endCompletionPanel'),finishSlot=$('endCompletionFinishSlot');
  const completeView=Boolean(finishSlot&&panel&&!panel.hidden);
  const finishDestination=completeView?finishSlot:row;
  if(box.parentElement!==finishDestination)finishDestination.append(box);"""
)
change2(
 """  box.innerHTML=`<div class="smart-finish"><button type="button" data-smart-finish="${esc(current?.id||'')}" ${!current||busy?'disabled':''}>FINISH &amp; NEXT</button><select id="smartOutcome" aria-label="Optional crowd response"><option value="">Not rated</option><option value="great">Great response</option><option value="good">Good</option><option value="average">Average</option><option value="weak">Weak</option></select><span>${current?'Complete current · '+esc(next?.songTitle||'Queue empty'):'No song playing'}</span></div><p id="smartRunError" role="status"></p>`;""",
 """  box.innerHTML=`<div class="smart-finish"><button type="button" ${completeView?'data-smart-next':'data-smart-finish="'+esc(current?.id||'')+'"'} ${(completeView?!next:!current)||busy?'disabled':''}>${completeView?'NEXT SONG':'FINISH &amp; NEXT'}</button>${completeView?'':`<select id="smartOutcome" aria-label="Optional crowd response"><option value="">Not rated</option><option value="great">Great response</option><option value="good">Good</option><option value="average">Average</option><option value="weak">Weak</option></select>`}<span>${completeView?(next?'Up next · '+esc(next.songTitle||'Queued song'):'Run Order empty'):current?'Complete current · '+esc(next?.songTitle||'Queue empty'):'No song playing'}</span></div><p id="smartRunError" role="status"></p>`;"""
)
change2(
 " if(button.hasAttribute('data-smart-finish')){",
 """ if(button.hasAttribute('data-smart-next')){
   const next=tools()?.getRunOrder?.().find(r=>!I.terminal(r.status)&&r.status!=='playing');
   if(next)await tools().actions.openRunOrderSong(next.id);
   return;
 }
 if(button.hasAttribute('data-smart-finish')){"""
)
change2(
 "for(const event of ['lk:session-updated','lk:runorder-updated','ls26:rotation-updated','ls26:requests-updated'])window.addEventListener(event,render);",
 "for(const event of ['lk:session-updated','lk:runorder-updated','ls26:rotation-updated','ls26:requests-updated','ls26:completion-state'])window.addEventListener(event,render);"
)
p.write_text(s)
print("Run Order and shared performance tools patched")
