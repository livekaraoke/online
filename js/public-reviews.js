/* Approved Live Karaoke testimonials: reuse LiveSuite's existing publicReviews
   projection in karaokeControl/liveKaraokeWebsiteSettings via LKPublicStore.
   Never read websiteRequesterProfiles or publish pending/unapproved submissions. */
(() => {
  "use strict";
  const section=document.getElementById("publicReviewSection");
  const writtenArea=document.getElementById("publicWrittenReviews");
  const writtenCards=document.getElementById("publicWrittenReviewCards");
  const starsArea=document.getElementById("publicStarReviews");
  const starCards=document.getElementById("publicStarReviewCards");
  if(!section||!writtenArea||!writtenCards||!starsArea||!starCards||!window.LKPublicStore)return;

  const text=(tag,cls,value)=>{
    const node=document.createElement(tag);
    if(cls)node.className=cls;
    node.textContent=value;
    return node;
  };
  const author=review=>String(review.name||"").trim()||"Anonymous guest";
  const validRating=value=>Number.isInteger(Number(value))&&Number(value)>=1&&Number(value)<=5?Number(value):0;
  const clampInt=(value,min,max,fallback)=>{
    const number=Math.round(Number(value));
    return Number.isFinite(number)?Math.max(min,Math.min(max,number)):fallback;
  };
  function normalise(published){
    if(!Array.isArray(published))return [];
    return published.slice(0,60).map(item=>({
      name:String(item?.name||"").trim().slice(0,80),
      country:String(item?.country||"").trim().slice(0,80),
      review:String(item?.review||"").trim().slice(0,1200),
      rating:validRating(item?.rating)
    })).filter(item=>item.review||item.rating);
  }
  function starLine(rating){
    const count=validRating(rating);
    const node=text("span","lk-review-stars","★".repeat(count)+"☆".repeat(5-count));
    node.setAttribute("aria-label",count+" out of 5 stars");
    return node;
  }
  function writtenCard(item){
    const card=document.createElement("blockquote");
    card.className="lk-testimonial";

    const body=document.createElement("div");
    body.className="lk-testimonial-body";
    if(item.rating)body.appendChild(starLine(item.rating));
    body.appendChild(text("p","",item.review));
    card.appendChild(body);

    const reviewer=document.createElement("footer");
    reviewer.className="lk-testimonial-reviewer";
    const icon=text("span","lk-reviewer-icon","");
    icon.setAttribute("aria-hidden","true");
    reviewer.appendChild(icon);
    reviewer.appendChild(text("strong","lk-reviewer-name",author(item)));
    if(item.country)reviewer.appendChild(text("span","lk-reviewer-country",item.country));
    card.appendChild(reviewer);
    return card;
  }
  function starCard(item){
    const card=document.createElement("div");
    card.className="lk-star-review";
    card.appendChild(starLine(item.rating));
    card.appendChild(text("strong","",author(item)));
    return card;
  }

  let written=[];
  let ratings=[];
  let writtenPage=0;
  let ratingPage=0;
  let writtenPerPage=2;
  let ratingsPerPage=4;
  let rotation=null;
  let fade=null;
  const reducedMotion=window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches===true;

  function pageNodes(items,page,count,renderer){
    if(!items.length||count<=0)return [];
    const visible=Math.min(count,items.length);
    const start=(page*count)%items.length;
    return Array.from({length:visible},(_,index)=>renderer(items[(start+index)%items.length]));
  }

  function showPages(){
    writtenCards.replaceChildren(...pageNodes(written,writtenPage,writtenPerPage,writtenCard));
    starCards.replaceChildren(...pageNodes(ratings,ratingPage,ratingsPerPage,starCard));
  }

  function clearRotation(){
    if(rotation)clearInterval(rotation);
    if(fade)clearTimeout(fade);
    rotation=null;
    fade=null;
    writtenCards.classList.remove("is-changing");
    starCards.classList.remove("is-changing");
  }

  function render(settings){
    const reviews=normalise(settings?.publicReviews);
    const nextWritten=reviews.filter(item=>item.review);
    const nextRatings=reviews.filter(item=>!item.review&&item.rating);
    const nextWrittenPerPage=clampInt(settings?.homepageWrittenReviewCount,0,6,2);
    const nextRatingsPerPage=clampInt(settings?.homepageRatingReviewCount,0,8,4);
    const changed=
      JSON.stringify(nextWritten)!==JSON.stringify(written)||
      JSON.stringify(nextRatings)!==JSON.stringify(ratings)||
      nextWrittenPerPage!==writtenPerPage||
      nextRatingsPerPage!==ratingsPerPage;

    if(changed){
      written=nextWritten;
      ratings=nextRatings;
      writtenPerPage=nextWrittenPerPage;
      ratingsPerPage=nextRatingsPerPage;
      writtenPage=0;
      ratingPage=0;
      showPages();
    }

    const showWritten=written.length>0&&writtenPerPage>0;
    const showRatings=ratings.length>0&&ratingsPerPage>0;
    writtenArea.hidden=!showWritten;
    starsArea.hidden=!showRatings;
    section.hidden=!showWritten&&!showRatings;

    clearRotation();
    const writtenOverflow=showWritten&&written.length>writtenPerPage;
    const ratingsOverflow=showRatings&&ratings.length>ratingsPerPage;
    if((writtenOverflow||ratingsOverflow)&&!reducedMotion){
      rotation=setInterval(()=>{
        if(document.hidden||section.hidden)return;
        if(writtenOverflow)writtenCards.classList.add("is-changing");
        if(ratingsOverflow)starCards.classList.add("is-changing");
        fade=setTimeout(()=>{
          if(writtenOverflow)writtenPage=(writtenPage+1)%Math.ceil(written.length/writtenPerPage);
          if(ratingsOverflow)ratingPage=(ratingPage+1)%Math.ceil(ratings.length/ratingsPerPage);
          showPages();
          writtenCards.classList.remove("is-changing");
          starCards.classList.remove("is-changing");
          fade=null;
        },290);
      },5800);
    }
  }

  const unsubscribe=window.LKPublicStore.subscribe(state=>render(state.settings||{}));
  addEventListener("pagehide",()=>{
    clearRotation();
    unsubscribe?.();
  },{once:true});
})();