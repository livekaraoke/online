(() => {
  "use strict";

  const $=id=>document.getElementById(id);
  const list=$("liveKaraokeReviewsList");
  const status=$("liveKaraokeReviewsStatus");
  const publishButton=$("publishApprovedReviewsBtn");
  if(!list||!window.LK?.db||!window.LK?.auth)return;

  const PROFILES="websiteRequesterProfiles";
  const settingsRef=()=>LK.db.collection("karaokeControl").doc("liveKaraokeWebsiteSettings");
  let reviews=[];
  let filter="all";
  let unsubscribe=null;

  const esc=value=>String(value??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const asDate=value=>value?.toDate?.()||value instanceof Date?value?.toDate?.()||value:null;
  const millis=value=>asDate(value)?.getTime?.()||0;
  const stars=rating=>{const n=Math.max(0,Math.min(5,Math.round(Number(rating)||0)));return n?`${"★".repeat(n)}${"☆".repeat(5-n)}`:"No rating";};
  const reviewerKey=item=>String(item.reviewKey||item.requesterDeviceId||item.id||"");
  const state=item=>item.reviewPrivate===true?"private":item.reviewApproved===true?"approved":(["rejected","withdrawn"].includes(String(item.reviewStatus||"").toLowerCase())?String(item.reviewStatus).toLowerCase():"pending");

  function setStatus(message,error=false){status.textContent=message||"";status.classList.toggle("error",!!error);}

  function normalise(doc){
    const data=doc.data()||{};
    return {
      id:doc.id,
      ref:doc.ref,
      name:String(data.name||data.displayName||"Live Karaoke guest").trim().slice(0,80),
      country:String(data.country||"").trim().slice(0,80),
      rating:Math.max(0,Math.min(5,Number(data.rating)||0)),
      review:String(data.review||"").trim().slice(0,1200),
      reviewPrivate:data.reviewPrivate===true,
      reviewApproved:data.reviewApproved===true,
      reviewStatus:String(data.reviewStatus||"").trim().toLowerCase(),
      reviewRecord:data.reviewRecord===true,
      reviewKey:String(data.reviewKey||""),
      requesterDeviceId:String(data.requesterDeviceId||""),
      submittedAt:data.submittedAt||null,
      updatedAt:data.updatedAt||null,
      approvedAt:data.approvedAt||null,
      source:String(data.source||"")
    };
  }

  function dedupe(items){
    const grouped=new Map();
    for(const item of items){
      if(!item.review&&item.rating<=0)continue;
      const key=reviewerKey(item)||item.id;
      const previous=grouped.get(key);
      if(!previous){grouped.set(key,item);continue;}
      const itemPriority=(item.reviewRecord?2:0)+(millis(item.updatedAt)/1e15);
      const prevPriority=(previous.reviewRecord?2:0)+(millis(previous.updatedAt)/1e15);
      if(itemPriority>=prevPriority)grouped.set(key,item);
    }
    return [...grouped.values()].sort((a,b)=>(millis(b.updatedAt)||millis(b.submittedAt))-(millis(a.updatedAt)||millis(a.submittedAt)));
  }

  function count(kind){return reviews.filter(item=>state(item)===kind).length;}
  function updateCounts(){
    const pending=count("pending"),approved=count("approved"),privateCount=count("private"),rejected=count("rejected");
    $("lkReviewPendingCount").textContent=String(pending);$("lkReviewApprovedCount").textContent=String(approved);$("lkReviewPrivateCount").textContent=String(privateCount);$("lkReviewTotalCount").textContent=String(reviews.length);
    $("lkFilterAllCount").textContent=String(reviews.length);$("lkFilterPendingCount").textContent=String(pending);$("lkFilterApprovedCount").textContent=String(approved);$("lkFilterPrivateCount").textContent=String(privateCount);$("lkFilterRejectedCount").textContent=String(rejected);
  }

  function formatDate(item){
    const date=asDate(item.updatedAt)||asDate(item.submittedAt);if(!date)return"";
    return new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeStyle:"short"}).format(date);
  }

  function card(item){
    const current=state(item),hasText=!!item.review,canApprove=current!=="private"&&hasText;
    const actions=current==="approved"
      ? `<button class="lk-review-action" type="button" data-review-unpublish="${esc(item.id)}">Unpublish</button>`
      : `<button class="lk-review-action primary" type="button" data-review-approve="${esc(item.id)}" ${canApprove?"":"disabled"}>Approve &amp; publish</button>${current!=="private"?`<button class="lk-review-action danger" type="button" data-review-reject="${esc(item.id)}">Reject</button>`:""}`;
    return `<article class="lk-review-card" data-review-id="${esc(item.id)}"><div class="lk-review-head"><div class="lk-review-person"><strong>${esc(item.name||"Live Karaoke guest")}</strong><small>${esc(item.country||"Country not provided")}</small></div><span class="lk-review-status ${esc(current)}">${esc(current==="approved"?"Published":current)}</span></div><div class="lk-review-stars" aria-label="${esc(item.rating?`${item.rating} out of 5 stars`:"No rating")}">${esc(stars(item.rating))}</div><p class="lk-review-copy ${hasText?"":"lk-review-empty-copy"}">${hasText?esc(item.review):"No written review was provided."}</p><div class="lk-review-meta">${formatDate(item)?`<span>${esc(formatDate(item))}</span>`:""}<span>${item.reviewPrivate?"Marked private by reviewer":"Eligible for public review"}</span></div><div class="lk-review-actions">${actions}</div></article>`;
  }

  function render(){
    updateCounts();
    document.querySelectorAll("[data-review-filter]").forEach(button=>button.classList.toggle("active",button.dataset.reviewFilter===filter));
    const visible=filter==="all"?reviews:reviews.filter(item=>state(item)===filter);
    list.innerHTML=visible.length?visible.map(card).join(""):`<div class="lk-reviews-empty">No ${filter==="all"?"reviews":filter+" reviews"} to show.</div>`;
  }

  async function publishApproved(snapshot=null){
    const snap=snapshot||await LK.db.collection(PROFILES).get();
    const approved=dedupe(snap.docs.map(normalise)).filter(item=>item.reviewApproved===true&&item.reviewPrivate!==true&&item.review).slice(0,24);
    const publicReviews=approved.map(item=>({id:item.reviewKey||item.id,name:item.name||"Live Karaoke guest",country:item.country||"",rating:item.rating||null,review:item.review}));
    await settingsRef().set({publicReviews,reviewsUpdatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:LK.auth.currentUser?.uid||""},{merge:true});
    return publicReviews.length;
  }

  async function moderate(id,action){
    const item=reviews.find(review=>review.id===id);if(!item||!LK.auth.currentUser)return;
    if(action==="approve"&&(item.reviewPrivate||!item.review))return;
    const button=list.querySelector(`[data-review-${action}="${CSS.escape(id)}"]`);if(button)button.disabled=true;
    setStatus(`${action==="approve"?"Publishing":action==="reject"?"Rejecting":"Unpublishing"} review…`);
    try{
      const now=firebase.firestore.FieldValue.serverTimestamp();
      const patch=action==="approve"
        ? {reviewApproved:true,reviewStatus:"approved",approvedAt:now,approvedBy:LK.auth.currentUser.uid,updatedAt:now}
        : action==="reject"
          ? {reviewApproved:false,reviewStatus:"rejected",approvedAt:null,approvedBy:"",updatedAt:now}
          : {reviewApproved:false,reviewStatus:"pending",approvedAt:null,approvedBy:"",updatedAt:now};
      await LK.db.collection(PROFILES).doc(id).set(patch,{merge:true});
      const published=await publishApproved();
      setStatus(`Review ${action==="approve"?"published":action==="reject"?"rejected":"unpublished"}. ${published} review${published===1?"":"s"} currently shown on the website.`);
    }catch(error){console.error("Could not moderate Live Karaoke review",error);setStatus(error.message||"Could not update the review.",true);if(button)button.disabled=false;}
  }

  function listen(){
    if(unsubscribe)unsubscribe();
    setStatus("Loading reviews…");
    unsubscribe=LK.db.collection(PROFILES).onSnapshot(snapshot=>{
      reviews=dedupe(snapshot.docs.map(normalise));render();setStatus(`${reviews.length} review${reviews.length===1?"":"s"} loaded. ${count("pending")} waiting for approval.`);
    },error=>{console.error("Could not load Live Karaoke reviews",error);setStatus(error.message||"Could not load reviews.",true);});
  }

  document.addEventListener("click",event=>{
    const filterButton=event.target.closest?.("[data-review-filter]");if(filterButton){filter=filterButton.dataset.reviewFilter||"all";render();return;}
    const approve=event.target.closest?.("[data-review-approve]");if(approve){void moderate(approve.dataset.reviewApprove,"approve");return;}
    const reject=event.target.closest?.("[data-review-reject]");if(reject){void moderate(reject.dataset.reviewReject,"reject");return;}
    const unpublish=event.target.closest?.("[data-review-unpublish]");if(unpublish)void moderate(unpublish.dataset.reviewUnpublish,"unpublish");
  });

  publishButton?.addEventListener("click",async()=>{
    publishButton.disabled=true;setStatus("Republishing approved reviews…");
    try{const count=await publishApproved();setStatus(`${count} approved review${count===1?"":"s"} published to the website.`);}catch(error){console.error(error);setStatus(error.message||"Could not publish approved reviews.",true);}finally{publishButton.disabled=false;}
  });

  LK.auth.onAuthStateChanged(user=>{if(user)listen();else{reviews=[];render();setStatus("Sign in to manage reviews.");}});
  addEventListener("beforeunload",()=>unsubscribe?.(),{once:true});
})();
