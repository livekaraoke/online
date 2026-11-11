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
  function normalise(published){
    if(!Array.isArray(published))return [];
    return published.slice(0,24).map(item=>({
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
    if(item.rating)card.appendChild(starLine(item.rating));
    card.appendChild(text("p","",item.review));
    const byline=item.country?author(item)+" · "+item.country:author(item);
    card.appendChild(text("footer","",byline));
    return card;
  }
  function starCard(item){
    const card=document.createElement("div");
    card.className="lk-star-review";
    card.appendChild(starLine(item.rating));
    card.appendChild(text("strong","",author(item)));
    return card;
  }

  let written=[],page=0,rotation=null,fade=null;
  const reducedMotion=window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches===true;
  function showPage(){
    if(!written.length)return;
    writtenCards.replaceChildren(...Array.from({length:Math.min(2,written.length)},(_,i)=>
      writtenCard(written[(page*2+i)%written.length])));
  }
  function render(published){
    const reviews=normalise(published);
    const nextWritten=reviews.filter(item=>item.review);
    const starOnly=reviews.filter(item=>!item.review&&item.rating);
    const changed=JSON.stringify(nextWritten)!==JSON.stringify(written);
    if(changed){written=nextWritten;page=0;showPage();}
    if(!nextWritten.length)writtenCards.replaceChildren();
    writtenArea.hidden=!nextWritten.length;
    starCards.replaceChildren(...starOnly.slice(0,4).map(starCard));
    starsArea.hidden=!starOnly.length;
    section.hidden=!nextWritten.length&&!starOnly.length;
    if(rotation)clearInterval(rotation);
    rotation=null;
    if(nextWritten.length>2&&!reducedMotion){
      rotation=setInterval(()=>{
        if(document.hidden||section.hidden)return;
        writtenCards.classList.add("is-changing");
        if(fade)clearTimeout(fade);
        fade=setTimeout(()=>{
          page=(page+1)%Math.ceil(written.length/2);
          showPage();
          writtenCards.classList.remove("is-changing");
        },290);
      },5800);
    }
  }
  const unsubscribe=window.LKPublicStore.subscribe(state=>render(state.settings?.publicReviews));
  addEventListener("pagehide",()=>{
    if(rotation)clearInterval(rotation);
    if(fade)clearTimeout(fade);
    unsubscribe?.();
  },{once:true});
})();
