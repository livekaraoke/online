/* Owner-only corrections to existing Session History records. No data migration. */
(()=>{
  "use strict";
  const $=id=>document.getElementById(id);
  const core=window.LS26SessionCorrection;
  const gigOps=window.LS26GigOps;
  const db=window.db||window.LK?.db||(window.firebase?.firestore?firebase.firestore():null);
  const auth=window.auth||(window.firebase?.auth?firebase.auth():null);
  const FV=()=>firebase.firestore.FieldValue;
  const ts=date=>firebase.firestore.Timestamp.fromDate(date);
  const escape=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let selected=null,editorMode="",onSaved=null,venues=[],isSaving=false;
  const idFields=["sessionCorrectionVenue","sessionCorrectionAct"];
  const timeFields=["sessionCorrectionScheduledStart","sessionCorrectionScheduledEnd","sessionCorrectionActualStart","sessionCorrectionActualEnd"];
  function alertMessage(message){$("sessionCorrectionMessage").textContent=message||"";}
  function close(){
    if(isSaving)return;
    $("sessionCorrectionModal").classList.add("hidden");
    selected=null;editorMode="";onSaved=null;
  }
  async function open(session,mode,callback){
    if(!session||!["identity","time"].includes(mode))return;
    if(session.status==="active"){
      await window.LS26Dialogs?.alert?.("End the live session before correcting its historical records.");
      return;
    }
    selected=session;editorMode=mode;onSaved=callback;
    $("sessionCorrectionTitle").textContent=mode==="identity"?"Correct venue and act":"Correct session timestamps";
    $("sessionCorrectionIdentity").hidden=mode!=="identity";
    $("sessionCorrectionTimes").hidden=mode!=="time";
    alertMessage("");
    $("sessionCorrectionWarning").textContent=mode==="identity"
      ?"WARNING: This changes the recorded venue and act, and renames this session and its linked gig. Linked payment venue information will also change when available. The original session ID, requests and song history are preserved. Other sessions and recurring occurrences are not changed."
      :"WARNING: This replaces actual stored timestamps (not a note). Session duration and reporting will recalculate. The linked gig schedule will also be updated. The original recorded timestamps will be retained in this session's correction audit.";
    $("sessionCorrectionModal").classList.remove("hidden");
    $("sessionCorrectionSave").disabled=true;
    if(mode==="identity"){
      try{
        const [venueSnap,typesSnap]=await Promise.all([
          db.collection("venues").get(),
          db.collection("karaokeControl").doc("eventTypes").get().catch(()=>null)
        ]);
        venues=venueSnap.docs.map(d=>({id:d.id,...(d.data()||{})})).sort((a,b)=>String(a.name||"").localeCompare(String(b.name||"")));
        const currentVenueId=String(session.venueId||session.eventSnapshot?.venueId||"");
        const matched=venues.find(v=>v.id===currentVenueId)
          ||venues.find(v=>String(v.name).trim().toLowerCase()===String(session.venue||"").trim().toLowerCase());
        $("sessionCorrectionVenue").innerHTML='<option value="">Choose saved venue…</option>'+
          venues.map(v=>'<option value="'+escape(v.id)+'">'+escape(v.name||v.id)+
          (v.locality?" — "+escape(v.locality):"")+'</option>').join("");
        $("sessionCorrectionVenue").value=matched?.id||"";
        const types=typesSnap?.data?.()?.options;
        const act=String(session.sessionType||session.type||session.eventSnapshot?.type||"Live Karaoke");
        const options=[...new Set(["Live Karaoke","Solo","Roxanna","Texanna","Other",...(Array.isArray(types)?types:[]),act])];
        $("sessionCorrectionAct").innerHTML=options.map(v=>'<option value="'+escape(v)+'">'+escape(v)+'</option>').join("");
        $("sessionCorrectionAct").value=act;
        $("sessionCorrectionSave").disabled=false;
      }catch(error){alertMessage("Could not load saved venues: "+(error.message||error));}
    }else{
      const v={
        sessionCorrectionScheduledStart:session.scheduledStartAt,
        sessionCorrectionScheduledEnd:session.scheduledEndAt,
        sessionCorrectionActualStart:session.actualStartedAt||(session.timingVersion===2?null:session.startedAt),
        sessionCorrectionActualEnd:session.actualEndedAt||(session.timingVersion===2?null:session.endedAt)
      };
      timeFields.forEach(id=>$(id).value=core.asInput(v[id]));
      $("sessionCorrectionSave").disabled=false;
    }
  }
  async function save(event){
    event.preventDefault();
    if(!selected||isSaving||!db)return;
    const id=selected.id,mode=editorMode;
    const identity=mode==="identity";
    const venue=identity?venues.find(v=>v.id===$("sessionCorrectionVenue").value):null;
    const act=identity?$("sessionCorrectionAct").value.trim():null;
    if(identity&&(!venue||!act)){alertMessage("Choose a saved venue and act type.");return;}
    let corrected={};
    if(!identity){
      try{
        const parse=id=>$(id).value?core.parseInput($(id).value,gigOps.maltaTime):null;
        corrected={
          scheduledStart:parse("sessionCorrectionScheduledStart"),
          scheduledEnd:parse("sessionCorrectionScheduledEnd"),
          actualStart:parse("sessionCorrectionActualStart"),
          actualEnd:parse("sessionCorrectionActualEnd")
        };
        core.validateTimes(corrected);
      }catch(error){alertMessage(error.message||"Invalid date and time.");return;}
    }
    const nextName=identity?core.titleFor(act,venue.name,selected.scheduledStartAt):"";
    const details=identity?"Venue: "+(selected.venue||"Unrecorded")+" → "+venue.name+
      "\nAct: "+(selected.sessionType||selected.type||"Unrecorded")+" → "+act+
      "\nNew session / linked gig name: "+nextName:
      "Scheduled: "+$("sessionCorrectionScheduledStart").value+" to "+$("sessionCorrectionScheduledEnd").value+
      "\nActual: "+($("sessionCorrectionActualStart").value||"Not recorded")+" to "+($("sessionCorrectionActualEnd").value||"Not recorded");
    const yes=await window.LS26Dialogs.confirm("Apply this historical correction?\n\n"+details+
      "\n\nLinked gig and its finance venue (if any) will be kept consistent. Recorded songs and requests remain unchanged.");
    if(!yes)return;
    isSaving=true;$("sessionCorrectionSave").disabled=true;alertMessage("Checking references and saving…");
    try{
      await db.runTransaction(async tx=>{
        const ref=db.collection("performanceSessions").doc(id);
        const snap=await tx.get(ref);
        if(!snap.exists)throw Error("This session no longer exists.");
        const current=snap.data()||{};
        if(current.status==="active")throw Error("This session is active. Finish it before making historical corrections.");
        const eventId=current.eventId||current.eventSnapshot?.id||"";
        const eventRef=eventId?db.collection("upcomingEvents").doc(eventId):null;
        const evSnap=eventRef?await tx.get(eventRef):null;
        const ev=evSnap?.exists?evSnap.data()||{}:null;
        if(ev?.linkedSessionId&&ev.linkedSessionId!==id)
          throw Error("The linked gig belongs to a different session. Nothing was changed.");
        const control=await tx.get(db.collection("karaokeControl").doc("currentSession"));
        const live=control.data()||{};
        if(live.active===true&&(live.sessionId===id||live.activeSessionId===id))
          throw Error("This session is currently live. Nothing was changed.");
        const venueSnap=identity?await tx.get(db.collection("venues").doc(venue.id)):null;
        if(identity&&!venueSnap.exists)throw Error("The selected venue was deleted. Refresh the editor.");
        const venueData=identity?{id:venue.id,...venueSnap.data()}:null;
        const financeRef=identity&&ev?db.collection("gigFinances").doc(eventId):null;
        const financeSnap=financeRef?await tx.get(financeRef):null;
        const now=FV().serverTimestamp();
        let sessionPatch={},eventPatch={};
        const before={},after={};
        if(identity){
          const name=core.titleFor(act,venueData.name,current.scheduledStartAt||current.eventSnapshot?.scheduledStartAt);
          Object.assign(sessionPatch,{venueId:venueData.id,venue:venueData.name,venueName:venueData.name,
            sessionType:act,type:act,act,title:name});
          Object.assign(eventPatch,{venueId:venueData.id,venue:venueData.name,type:act,name,
            address:venueData.address||"",venueLocality:venueData.locality||"",
            contactName:venueData.contactName||"",contact:[venueData.contactPhone,venueData.contactEmail].filter(Boolean).join(" · "),
            venueContactPhone:venueData.contactPhone||"",venueContactEmail:venueData.contactEmail||"",
            venueWebsite:venueData.website||"",venueMapUrl:venueData.mapUrl||""});
          Object.assign(before,{venueId:current.venueId||"",venue:current.venue||"",
            act:current.sessionType||current.type||"",title:current.title||""});
          Object.assign(after,{venueId:venueData.id,venue:venueData.name,act,title:name});
        }else{
          const ms=x=>x?x.getTime():null;
          const end=corrected.scheduledEnd.getTime(),start=corrected.scheduledStart.getTime();
          Object.assign(sessionPatch,{
            scheduledStartAt:ts(corrected.scheduledStart),scheduledEndAt:ts(corrected.scheduledEnd),
            scheduledDurationMs:end-start,actualStartedAt:corrected.actualStart?ts(corrected.actualStart):null,
            actualEndedAt:corrected.actualEnd?ts(corrected.actualEnd):null
          });
          const localStart=core.asInput(corrected.scheduledStart),localEnd=core.asInput(corrected.scheduledEnd);
          Object.assign(eventPatch,{
            date:localStart.slice(0,10),startTime:localStart.slice(11,16),endTime:localEnd.slice(11,16),
            scheduledStartAt:sessionPatch.scheduledStartAt,scheduledEndAt:sessionPatch.scheduledEndAt,
            scheduledDurationMs:end-start,actualStartedAt:sessionPatch.actualStartedAt,
            actualEndedAt:sessionPatch.actualEndedAt
          });
          const oldTimes={scheduledStart:current.scheduledStartAt,scheduledEnd:current.scheduledEndAt,
            actualStart:current.actualStartedAt,actualEnd:current.actualEndedAt};
          Object.keys(oldTimes).forEach(k=>before[k]=core.asInput(oldTimes[k]));
          Object.entries(corrected).forEach(([k,v])=>after[k]=v?core.asInput(v):"");
          if(ev&&(ev.name||current.title)&&
             core.titleFor(current.sessionType||current.type||ev.type||"",current.venue||ev.venue||"",corrected.scheduledStart)!==
             core.titleFor(current.sessionType||current.type||ev.type||"",current.venue||ev.venue||"",current.scheduledStartAt)){
            const oldToken=core.asInput(current.scheduledStartAt).slice(8,10)+"/"+core.asInput(current.scheduledStartAt).slice(5,7);
            const newToken=localStart.slice(8,10)+"/"+localStart.slice(5,7);
            if(oldToken!==newToken&&current.title?.endsWith(oldToken)){
              sessionPatch.title=current.title.slice(0,-oldToken.length)+newToken;
              eventPatch.name=sessionPatch.title;
            }
          }
        }
        const history=Array.isArray(current.sessionCorrectionHistory)?current.sessionCorrectionHistory.slice(-49):[];
        history.push({mode,at:new Date().toISOString(),by:auth?.currentUser?.uid||"owner",before,after});
        sessionPatch={...sessionPatch,sessionCorrectionHistory:history,sessionCorrectedAt:now,updatedAt:now};
        if(ev){
          eventPatch.updatedAt=now;
          sessionPatch.eventSnapshot={...current.eventSnapshot,...ev,...eventPatch,updatedAt:ev.updatedAt||null,id:eventId};
          // Never store serverTimestamp sentinel values inside a snapshot.
          sessionPatch.eventSnapshot.updatedAt=ev.updatedAt||null;
          tx.update(eventRef,eventPatch);
        }else if(current.eventSnapshot){
          sessionPatch.eventSnapshot={...current.eventSnapshot,
            ...(identity?eventPatch:{...eventPatch}),id:current.eventSnapshot.id||eventId};
        }
        tx.update(ref,sessionPatch);
        if(financeSnap?.exists){
          tx.update(financeRef,{venueId:venueData.id,act,updatedAt:now});
        }
      });
      alertMessage("Correction saved.");
      isSaving=false;
      close();
      if(typeof onSaved==="function")await onSaved(id);
    }catch(error){
      console.error("Session history correction failed:",error);
      alertMessage((error.code==="permission-denied"?
        "Firestore denied the correction. Check owner permissions for sessions, gigs and private gigFinances. ":"")+
        (error.message||"Could not save. No records were changed."));
    }finally{isSaving=false;$("sessionCorrectionSave").disabled=false;}
  }
  function init(){
    $("sessionCorrectionForm")?.addEventListener("submit",save);
    $("sessionCorrectionCancel")?.addEventListener("click",close);
    $("sessionCorrectionX")?.addEventListener("click",close);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
  window.LS26SessionHistoryEditor={open,close};
})();
