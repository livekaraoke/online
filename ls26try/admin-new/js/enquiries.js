/* Copyright © 2026 LiveSuite. All rights reserved.
 * admin-new/js/enquiries.js — preserved application behaviour and compatibility support.
 * Original notices and functionality retained below. See FUNCTIONS.txt.
 */
(() => {
  "use strict";
  const COLLECTION="bookingEnquiries";
  const $=id=>document.getElementById(id);
  const db=window.LK?.db || (window.firebase?.firestore?firebase.firestore():null);
  let enquiries=[];
  let unsub=null;

  function esc(v){return String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
  function timeMs(v){if(v?.toMillis)return v.toMillis();if(v?.toDate)return v.toDate().getTime();return 0;}
  function fmtDate(v){const ms=timeMs(v);return ms?new Date(ms).toLocaleString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—";}

  function sourceLabel(e){
    const raw=String(e?.source||e?.sourceKey||"website").trim();
    const key=raw.toLowerCase();
    if(key==="billylee26" || key==="billy lee" || key==="billy lee website") return "Billy Lee Website";
    if(key==="roxanna" || key==="roxanna website") return "Roxanna Website";
    if(key==="live-karaoke" || key==="live karaoke" || key==="live karaoke website") return "Live Karaoke Website";
    return raw||"Website";
  }
  function filtered(){
    const q=String($("enquirySearch")?.value||"").trim().toLowerCase();
    const status=String($("enquiryStatusFilter")?.value||"");
    return enquiries.filter(e=>{
      if(status && String(e.status||"pending")!==status)return false;
      if(!q)return true;
      return [e.name,e.email,e.phone,e.eventType,e.venueOrLocality,e.company,e.message,e.type,e.source].join(" ").toLowerCase().includes(q);
    }).sort((a,b)=>timeMs(b.createdAt)-timeMs(a.createdAt));
  }
  function details(e){
    const items=[
      ["EVENT / BOOKING TYPE",e.eventType],
      ["PREFERRED DATE",e.preferredDate],
      ["VENUE / LOCALITY",e.venueOrLocality],
      ["COMPANY / ORGANISATION",e.company],
      ["ESTIMATED GUESTS",e.estimatedGuests!=null?String(e.estimatedGuests):""],
      ["PERFORMER TYPE",e.type||e.performerType],
      ["SOURCE WEBSITE",sourceLabel(e)]
    ].filter(([,v])=>String(v??"").trim());
    let out=items.map(([k,v])=>`<div class="enquiry-detail"><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join("");
    if(e.message)out+=`<div class="enquiry-detail enquiry-message"><b>MESSAGE / DETAILS</b><span>${esc(e.message)}</span></div>`;
    return out;
  }
  function render(){
    const pending=enquiries.filter(e=>String(e.status||"pending")==="pending").length;
    const completed=enquiries.filter(e=>String(e.status||"")==="completed").length;
    $("pendingEnquiryCount").textContent=String(pending);$("completedEnquiryCount").textContent=String(completed);$("totalEnquiryCount").textContent=String(enquiries.length);
    const rows=filtered();$("enquiriesResultCount").textContent=`${rows.length} enquir${rows.length===1?"y":"ies"}`;
    $("enquiriesList").innerHTML=rows.length?rows.map(e=>{
      const status=String(e.status||"pending");
      return `<article class="enquiry-card${status==="completed"?" is-completed":""}"><div class="enquiry-meta"><span class="enquiry-status ${esc(status)}">${status.toUpperCase()}</span><span class="enquiry-date">${esc(fmtDate(e.createdAt))}</span><span class="enquiry-source">${esc(sourceLabel(e))} • ${esc(e.type||e.performerType||"—")}</span></div><div class="enquiry-main"><h3>${esc(e.name||"Unnamed enquiry")}</h3><div class="enquiry-contact">${e.email?`<a href="mailto:${esc(e.email)}">${esc(e.email)}</a>`:""}${e.phone?`<a href="tel:${esc(e.phone)}">${esc(e.phone)}</a>`:""}</div><div class="enquiry-details">${details(e)}</div></div><div class="enquiry-actions"><button type="button" class="enquiries-btn ${status==="completed"?"reopen":"completed"}" data-enquiry-status="${esc(e.id)}" data-next-status="${status==="completed"?"pending":"completed"}">${status==="completed"?"REOPEN":"MARK COMPLETED"}</button></div></article>`;
    }).join(""):`<div class="enquiries-empty">No enquiries match the current filters.</div>`;
  }
  function listen(){
    if(!db){$("enquiriesList").innerHTML=`<div class="enquiries-empty">Firestore is not available.</div>`;return;}
    if(unsub)unsub();
    unsub=db.collection(COLLECTION).onSnapshot(s=>{enquiries=s.docs.map(d=>({id:d.id,...(d.data()||{})}));render();},err=>{console.error(err);$("enquiriesList").innerHTML=`<div class="enquiries-empty">Could not load enquiries.</div>`;});
  }
  async function setStatus(id,status){
    if(!db||!id)return;
    try{await db.collection(COLLECTION).doc(id).set({status,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),completedAt:status==="completed"?firebase.firestore.FieldValue.serverTimestamp():null,completedBy:status==="completed"?(firebase.auth().currentUser?.email||""):""},{merge:true});}catch(err){console.error(err);await LS26Dialogs.alert("Could not update enquiry status.");}
  }
  function bind(){
    $("enquirySearch").addEventListener("input",render);$("enquiryStatusFilter").addEventListener("change",render);$("refreshEnquiriesBtn").addEventListener("click",render);
    document.addEventListener("click",e=>{const b=e.target.closest("[data-enquiry-status]");if(b)setStatus(b.dataset.enquiryStatus,b.dataset.nextStatus);});
  }
  function show(){$("enquiriesAuthGate").classList.add("hidden");$("enquiriesApp").hidden=false;window.LK?.sidebar?.loadSidebar?.();listen();}
  function init(){bind();firebase.auth().onAuthStateChanged(user=>{if(!user){location.replace("admin.html");return;}show();});}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
