(() => {
  "use strict";

  const $=id=>document.getElementById(id);
  const list=$("liveKaraokeReviewsList");
  const status=$("liveKaraokeReviewsStatus");
  const publishButton=$("publishApprovedReviewsBtn");
  const saveDisplayButton=$("saveReviewDisplaySettingsBtn");
  const writtenCountInput=$("lkHomepageWrittenCount");
  const ratingCountInput=$("lkHomepageRatingCount");
  if(!list||!window.LK?.db||!window.LK?.auth)return;

  const PROFILES="websiteRequesterProfiles";
  const settingsRef=()=>LK.db.collection("karaokeControl").doc("liveKaraokeWebsiteSettings");
  let reviews=[];
  let filter="all";
  let unsubscribe=null;
  let settingsUnsubscribe=null;
  let homepageWrittenCount=2;
  let homepageRatingCount=4;

  const esc=value=>String(value??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const asDate=value=>{
    if(!value)return null;
    if(typeof value.toDate==="function")return value.toDate();
    return value instanceof Date?value:null;
  };
  const millis=value=>asDate(value)?.getTime?.()||0;
  const clampInt=(value,min,max,fallback)=>{
    const number=Math.round(Number(value));
    return Number.isFinite(number)?Math.max(min,Math.min(max,number)):fallback;
  };
  const hasPublishableFeedback=item=>Boolean(item.review)||Number(item.rating)>=1&&Number(item.rating)<=5;
  const stars=rating=>{const n=Math.max(0,Math.min(5,Math.round(Number(rating)||0)));return n?`${"★".repeat(n)}${"☆".repeat(5-n)}`:"No rating";};
  const reviewerKey=item=>String(item.reviewKey||item.requesterDeviceId||item.id||"");
  const state=item=>item.reviewApproved===true?"approved":(["rejected","withdrawn"].includes(String(item.reviewStatus||"").toLowerCase())?String(item.reviewStatus).toLowerCase():"pending");
  const orderValue=item=>Number.isFinite(Number(item.reviewOrder))?Number(item.reviewOrder):Number.MAX_SAFE_INTEGER;

  function setStatus(message,error=false){
    status.textContent=message||"";
    status.classList.toggle("error",!!error);
  }

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
      reviewHidden:data.reviewHidden===true,
      reviewOrder:Number.isFinite(Number(data.reviewOrder))?Number(data.reviewOrder):null,
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

  function publishedSorted(items=reviews){
    return items.filter(item=>state(item)==="approved").sort((a,b)=>{
      const orderDelta=orderValue(a)-orderValue(b);
      if(orderDelta)return orderDelta;
      return (millis(b.approvedAt)||millis(b.updatedAt)||millis(b.submittedAt))-(millis(a.approvedAt)||millis(a.updatedAt)||millis(a.submittedAt));
    });
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
  function anonymousCount(){return reviews.filter(item=>item.reviewPrivate===true).length;}
  function updateCounts(){
    const pending=count("pending"),approved=count("approved"),anonymous=anonymousCount(),rejected=count("rejected");
    $("lkReviewPendingCount").textContent=String(pending);
    $("lkReviewApprovedCount").textContent=String(approved);
    $("lkReviewPrivateCount").textContent=String(anonymous);
    $("lkReviewTotalCount").textContent=String(reviews.length);
    $("lkFilterAllCount").textContent=String(reviews.length);
    $("lkFilterPendingCount").textContent=String(pending);
    $("lkFilterApprovedCount").textContent=String(approved);
    $("lkFilterPrivateCount").textContent=String(anonymous);
    $("lkFilterRejectedCount").textContent=String(rejected);
  }

  function formatDate(item){
    const date=asDate(item.updatedAt)||asDate(item.submittedAt);
    if(!date)return"";
    return new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeStyle:"short"}).format(date);
  }

  function editor(item){
    return `<div class="lk-review-editor" data-review-editor="${esc(item.id)}" hidden>
      <label>Name<input data-edit-name maxlength="80" value="${esc(item.name||"")}"></label>
      <label>Country<input data-edit-country maxlength="80" value="${esc(item.country||"")}"></label>
      <label>Rating<input data-edit-rating type="number" min="1" max="5" step="1" value="${item.rating?esc(item.rating):""}" placeholder="1-5"></label>
      <label class="wide">Review<textarea data-edit-review maxlength="1200">${esc(item.review||"")}</textarea></label>
      <label class="lk-review-editor-private"><input data-edit-private type="checkbox" ${item.reviewPrivate?"checked":""}> Hide reviewer name publicly</label>
      <div class="lk-review-editor-actions">
        <button class="lk-review-action primary" type="button" data-review-save="${esc(item.id)}">Save changes</button>
        <button class="lk-review-action" type="button" data-review-cancel="${esc(item.id)}">Cancel</button>
      </div>
    </div>`;
  }

  function card(item){
    const current=state(item),hasText=!!item.review,canApprove=hasPublishableFeedback(item);
    const ordered=publishedSorted();
    const approvedIndex=ordered.findIndex(review=>review.id===item.id);
    const hiddenPublished=current==="approved"&&item.reviewHidden;
    const statusLabel=hiddenPublished?"Published - hidden":current==="approved"?"Published":current;
    let actions=`<button class="lk-review-action" type="button" data-review-edit="${esc(item.id)}">Edit</button>`;
    if(current==="approved"){
      actions+=`<button class="lk-review-action" type="button" data-review-hide="${esc(item.id)}">${item.reviewHidden?"Show on homepage":"Hide from homepage"}</button>`;
      actions+=`<button class="lk-review-action" type="button" data-review-up="${esc(item.id)}" ${approvedIndex<=0?"disabled":""}>↑ Move up</button>`;
      actions+=`<button class="lk-review-action" type="button" data-review-down="${esc(item.id)}" ${approvedIndex<0||approvedIndex>=ordered.length-1?"disabled":""}>↓ Move down</button>`;
      actions+=`<button class="lk-review-action danger" type="button" data-review-unpublish="${esc(item.id)}">Unpublish</button>`;
    }else{
      actions+=`<button class="lk-review-action primary" type="button" data-review-approve="${esc(item.id)}" ${canApprove?"":"disabled"}>Approve &amp; publish</button>`;
      actions+=`<button class="lk-review-action danger" type="button" data-review-reject="${esc(item.id)}">Reject</button>`;
    }
    const privacy=item.reviewPrivate?"Name hidden on public website":"Name eligible to appear publicly";
    const orderMeta=current==="approved"&&approvedIndex>=0?`<span>Homepage order: ${approvedIndex+1}</span>`:"";
    return `<article class="lk-review-card" data-review-id="${esc(item.id)}">
      <div class="lk-review-head">
        <div class="lk-review-person"><strong>${esc(item.name||"Live Karaoke guest")}</strong><small>${esc(item.country||"Country not provided")}</small></div>
        <span class="lk-review-status ${hiddenPublished?"hidden":esc(current)}">${esc(statusLabel)}</span>
      </div>
      <div class="lk-review-stars" aria-label="${esc(item.rating?`${item.rating} out of 5 stars`:"No rating")}">${esc(stars(item.rating))}</div>
      <p class="lk-review-copy ${hasText?"":"lk-review-empty-copy"}">${hasText?esc(item.review):(item.rating>=1?"Star rating only - no written review.":"No written review was provided.")}</p>
      <div class="lk-review-meta">${formatDate(item)?`<span>${esc(formatDate(item))}</span>`:""}<span>${privacy}</span>${orderMeta}${item.reviewHidden?'<span>Hidden from homepage</span>':""}</div>
      <div class="lk-review-actions">${actions}</div>
      ${editor(item)}
    </article>`;
  }

  function render(){
    updateCounts();
    document.querySelectorAll("[data-review-filter]").forEach(button=>button.classList.toggle("active",button.dataset.reviewFilter===filter));
    let visible;
    if(filter==="all")visible=reviews;
    else if(filter==="private")visible=reviews.filter(item=>item.reviewPrivate===true);
    else if(filter==="approved")visible=publishedSorted();
    else visible=reviews.filter(item=>state(item)===filter);
    const label=filter==="private"?"anonymous":filter;
    list.innerHTML=visible.length?visible.map(card).join(""):`<div class="lk-reviews-empty">No ${filter==="all"?"reviews":label+" reviews"} to show.</div>`;
  }

  async function publishApproved(snapshot=null){
    const snap=snapshot||await LK.db.collection(PROFILES).get();
    const approved=publishedSorted(dedupe(snap.docs.map(normalise))).filter(item=>hasPublishableFeedback(item));
    const publicReviews=approved.filter(item=>!item.reviewHidden).slice(0,60).map(item=>({
      name:item.reviewPrivate?"":(item.name||"Live Karaoke guest"),
      country:item.country||"",
      rating:item.rating||null,
      review:item.review
    }));
    await settingsRef().set({
      publicReviews,
      reviewsUpdatedAt:firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy:LK.auth.currentUser?.uid||""
    },{merge:true});
    return publicReviews.length;
  }

  function nextReviewOrder(){
    const values=publishedSorted().map(item=>Number(item.reviewOrder)).filter(Number.isFinite);
    return values.length?Math.max(...values)+1:publishedSorted().length;
  }

  async function moderate(id,action){
    const item=reviews.find(review=>review.id===id);
    if(!item||!LK.auth.currentUser)return;
    if(action==="approve"&&!hasPublishableFeedback(item))return;
    const button=list.querySelector?.(`[data-review-${action}="${CSS.escape(id)}"]`);
    if(button)button.disabled=true;
    setStatus(`${action==="approve"?"Publishing":action==="reject"?"Rejecting":"Unpublishing"} review…`);
    try{
      const now=firebase.firestore.FieldValue.serverTimestamp();
      const patch=action==="approve"
        ? {reviewApproved:true,reviewStatus:"approved",approvedAt:now,approvedBy:LK.auth.currentUser.uid,reviewHidden:false,reviewOrder:item.reviewOrder??nextReviewOrder(),updatedAt:now}
        : action==="reject"
          ? {reviewApproved:false,reviewStatus:"rejected",approvedAt:null,approvedBy:"",updatedAt:now}
          : {reviewApproved:false,reviewStatus:"pending",approvedAt:null,approvedBy:"",updatedAt:now};
      await LK.db.collection(PROFILES).doc(id).set(patch,{merge:true});
      const published=await publishApproved();
      setStatus(`Review ${action==="approve"?"published":action==="reject"?"rejected":"unpublished"}. ${published} review${published===1?"":"s"} currently available to the homepage.`);
    }catch(error){
      console.error("Could not moderate Live Karaoke review",error);
      setStatus(error.message||"Could not update the review.",true);
      if(button)button.disabled=false;
    }
  }

  async function saveEdit(id){
    const item=reviews.find(review=>review.id===id);
    const cardNode=list.querySelector?.(`[data-review-id="${CSS.escape(id)}"]`);
    const editorNode=cardNode?.querySelector?.("[data-review-editor]");
    if(!item||!editorNode||!LK.auth.currentUser)return;
    const name=String(editorNode.querySelector("[data-edit-name]")?.value||"").trim().slice(0,80);
    const country=String(editorNode.querySelector("[data-edit-country]")?.value||"").trim().slice(0,80);
    const ratingRaw=String(editorNode.querySelector("[data-edit-rating]")?.value||"").trim();
    const rating=ratingRaw?clampInt(ratingRaw,1,5,0):0;
    const review=String(editorNode.querySelector("[data-edit-review]")?.value||"").trim().slice(0,1200);
    const reviewPrivate=editorNode.querySelector("[data-edit-private]")?.checked===true;
    if(!review&&!rating){setStatus("A review needs a star rating, written text, or both.",true);return;}
    setStatus("Saving review changes…");
    try{
      await LK.db.collection(PROFILES).doc(id).set({
        name:name||"Live Karaoke guest",
        country,
        rating:rating||null,
        review,
        reviewPrivate,
        updatedAt:firebase.firestore.FieldValue.serverTimestamp()
      },{merge:true});
      const published=state(item)==="approved"?await publishApproved():null;
      setStatus(state(item)==="approved"?`Review updated and republished. ${published} review${published===1?"":"s"} available to the homepage.`:"Review updated.");
    }catch(error){
      console.error("Could not edit Live Karaoke review",error);
      setStatus(error.message||"Could not save review changes.",true);
    }
  }

  async function toggleHidden(id){
    const item=reviews.find(review=>review.id===id);
    if(!item||state(item)!=="approved")return;
    setStatus(item.reviewHidden?"Showing review on homepage…":"Hiding review from homepage…");
    try{
      await LK.db.collection(PROFILES).doc(id).set({reviewHidden:!item.reviewHidden},{merge:true});
      const published=await publishApproved();
      setStatus(`Review ${item.reviewHidden?"shown":"hidden"}. ${published} review${published===1?"":"s"} available to the homepage.`);
    }catch(error){
      console.error("Could not change review visibility",error);
      setStatus(error.message||"Could not change review visibility.",true);
    }
  }

  async function moveReview(id,direction){
    const ordered=publishedSorted();
    const index=ordered.findIndex(item=>item.id===id);
    const target=index+direction;
    if(index<0||target<0||target>=ordered.length)return;
    [ordered[index],ordered[target]]=[ordered[target],ordered[index]];
    setStatus("Updating review order…");
    try{
      for(let i=0;i<ordered.length;i++){
        await LK.db.collection(PROFILES).doc(ordered[i].id).set({reviewOrder:i},{merge:true});
      }
      const published=await publishApproved();
      setStatus(`Review order updated. ${published} review${published===1?"":"s"} available to the homepage.`);
    }catch(error){
      console.error("Could not reorder reviews",error);
      setStatus(error.message||"Could not reorder reviews.",true);
    }
  }

  function toggleEditor(id,open){
    const cardNode=list.querySelector?.(`[data-review-id="${CSS.escape(id)}"]`);
    const editorNode=cardNode?.querySelector?.("[data-review-editor]");
    if(editorNode)editorNode.hidden=!open;
  }

  function listenSettings(){
    if(settingsUnsubscribe)settingsUnsubscribe();
    const ref=settingsRef();
    if(typeof ref.onSnapshot!=="function")return;
    settingsUnsubscribe=ref.onSnapshot(snapshot=>{
      const data=snapshot?.data?.()||{};
      homepageWrittenCount=clampInt(data.homepageWrittenReviewCount,0,6,2);
      homepageRatingCount=clampInt(data.homepageRatingReviewCount,0,8,4);
      if(writtenCountInput)writtenCountInput.value=String(homepageWrittenCount);
      if(ratingCountInput)ratingCountInput.value=String(homepageRatingCount);
    },error=>console.warn("Could not load review display settings",error));
  }

  function listen(){
    if(unsubscribe)unsubscribe();
    setStatus("Loading reviews…");
    unsubscribe=LK.db.collection(PROFILES).onSnapshot(snapshot=>{
      reviews=dedupe(snapshot.docs.map(normalise));
      render();
      setStatus(`${reviews.length} review${reviews.length===1?"":"s"} loaded. ${count("pending")} waiting for approval.`);
    },error=>{
      console.error("Could not load Live Karaoke reviews",error);
      setStatus(error.message||"Could not load reviews.",true);
    });
  }

  document.addEventListener("click",event=>{
    const filterButton=event.target.closest?.("[data-review-filter]");
    if(filterButton){filter=filterButton.dataset.reviewFilter||"all";render();return;}
    const edit=event.target.closest?.("[data-review-edit]");
    if(edit){toggleEditor(edit.dataset.reviewEdit,true);return;}
    const cancel=event.target.closest?.("[data-review-cancel]");
    if(cancel){toggleEditor(cancel.dataset.reviewCancel,false);return;}
    const save=event.target.closest?.("[data-review-save]");
    if(save){void saveEdit(save.dataset.reviewSave);return;}
    const hide=event.target.closest?.("[data-review-hide]");
    if(hide){void toggleHidden(hide.dataset.reviewHide);return;}
    const up=event.target.closest?.("[data-review-up]");
    if(up){void moveReview(up.dataset.reviewUp,-1);return;}
    const down=event.target.closest?.("[data-review-down]");
    if(down){void moveReview(down.dataset.reviewDown,1);return;}
    const approve=event.target.closest?.("[data-review-approve]");
    if(approve){void moderate(approve.dataset.reviewApprove,"approve");return;}
    const reject=event.target.closest?.("[data-review-reject]");
    if(reject){void moderate(reject.dataset.reviewReject,"reject");return;}
    const unpublish=event.target.closest?.("[data-review-unpublish]");
    if(unpublish)void moderate(unpublish.dataset.reviewUnpublish,"unpublish");
  });

  saveDisplayButton?.addEventListener("click",async()=>{
    homepageWrittenCount=clampInt(writtenCountInput?.value,0,6,2);
    homepageRatingCount=clampInt(ratingCountInput?.value,0,8,4);
    if(writtenCountInput)writtenCountInput.value=String(homepageWrittenCount);
    if(ratingCountInput)ratingCountInput.value=String(homepageRatingCount);
    saveDisplayButton.disabled=true;
    setStatus("Saving homepage review display settings…");
    try{
      await settingsRef().set({
        homepageWrittenReviewCount:homepageWrittenCount,
        homepageRatingReviewCount:homepageRatingCount,
        reviewsDisplayUpdatedAt:firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy:LK.auth.currentUser?.uid||""
      },{merge:true});
      setStatus(`Homepage review display saved: ${homepageWrittenCount} written and ${homepageRatingCount} rating-only visible at once.`);
    }catch(error){
      console.error("Could not save review display settings",error);
      setStatus(error.message||"Could not save review display settings.",true);
    }finally{
      saveDisplayButton.disabled=false;
    }
  });

  publishButton?.addEventListener("click",async()=>{
    publishButton.disabled=true;
    setStatus("Republishing approved reviews…");
    try{
      const published=await publishApproved();
      setStatus(`${published} approved review${published===1?"":"s"} published to the website.`);
    }catch(error){
      console.error(error);
      setStatus(error.message||"Could not publish approved reviews.",true);
    }finally{
      publishButton.disabled=false;
    }
  });

  LK.auth.onAuthStateChanged(user=>{
    if(user){listen();listenSettings();}
    else{
      reviews=[];
      render();
      setStatus("Sign in to manage reviews.");
    }
  });
  addEventListener("beforeunload",()=>{
    unsubscribe?.();
    settingsUnsubscribe?.();
  },{once:true});
})();