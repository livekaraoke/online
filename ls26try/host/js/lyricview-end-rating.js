/* LyricView completed-performance rating. Reuses performedSongs.crowdResponse.
 * No additional Firestore listeners; one guarded transaction per selected rating.
 */
(()=>{
  "use strict";
  const $=id=>document.getElementById(id);
  const labels={great:"Great response",good:"Good",average:"Average",weak:"Weak","":"Not rated"};
  let completed=null,selected=null,busy=false;

  function updateButtons(){
    const card=$("endSongRating");
    if(!card)return;
    card.querySelectorAll("[data-crowd-rating]").forEach(button=>{
      const value=button.dataset.crowdRating;
      button.disabled=busy||!completed;
      button.classList.toggle("is-selected",selected!==null&&selected===value);
      button.setAttribute("aria-pressed",String(selected!==null&&selected===value));
    });
  }
  function status(message,error=false){
    const node=$("endRatingStatus");
    if(!node)return;
    node.textContent=message;
    node.classList.toggle("is-error",error);
  }
  window.addEventListener("ls26:performance-completed",event=>{
    const detail=event.detail||{};
    if(!detail.sessionId||!detail.performanceId||!detail.songId)return;
    completed={
      sessionId:String(detail.sessionId),
      performanceId:String(detail.performanceId),
      songId:String(detail.songId)
    };
    selected=null;
    status("How did this song go? Tap a rating to save it.");
    updateButtons();
  });

  document.addEventListener("click",async event=>{
    const button=event.target.closest?.("[data-crowd-rating]");
    if(!button||!$("endSongRating")?.contains(button)||busy)return;
    const value=button.dataset.crowdRating;
    if(!(value in labels)||!completed)return;
    if(selected===value){status("Saved: "+labels[value]);return;}
    const info={...completed};
    const db=window.LK?.db||window.db;
    if(!db?.runTransaction){status("Can't save rating: Firestore unavailable.",true);return;}
    busy=true;
    updateButtons();
    status("Saving rating...");
    try{
      const ref=db.collection("performanceSessions").doc(info.sessionId)
        .collection("performedSongs").doc(info.performanceId);
      await db.runTransaction(async tx=>{
        const snap=await tx.get(ref);
        const data=snap.exists?snap.data()||{}:{};
        if(!snap.exists||data.status!=="completed"||String(data.songId||"")!==info.songId){
          throw new Error("The completed performance was not found. Rating was not saved.");
        }
        const outcome=value
          ?value
          :firebase.firestore.FieldValue.delete();
        tx.update(ref,{crowdResponse:outcome});
      });
      // A song change during the write must not update the wrong screen.
      if(completed?.sessionId===info.sessionId&&completed?.performanceId===info.performanceId){
        selected=value;
        status("Saved: "+labels[value]);
      }
    }catch(error){
      status("Rating not saved: "+(error.message||"Please retry."),true);
    }finally{
      busy=false;
      updateButtons();
    }
  });
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",updateButtons);
  else updateButtons();
})();
