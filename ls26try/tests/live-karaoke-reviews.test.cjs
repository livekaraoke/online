const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const root=path.join(__dirname,"../admin-new");
const js=fs.readFileSync(path.join(root,"js/live-karaoke-reviews.js"),"utf8");
const html=fs.readFileSync(path.join(root,"live-karaoke-reviews.html"),"utf8");

function setup(data) {
  const rows=new Map(data.map((entry,i)=>[entry.id||"review_"+i,{...entry}]));
  const actions={};
  const elements=new Map();
  const el=id=>{
    if(!elements.has(id))elements.set(id,{
      textContent:"",innerHTML:"",disabled:false,classList:{toggle(){}},
      querySelector:()=>({disabled:false}),
      addEventListener(type,fn){actions[id+":"+type]=fn;}
    });
    return elements.get(id);
  };
  const docSnap=(id,value)=>({id,ref:{id},data:()=>({...value})});
  const snapshot=()=>({docs:[...rows].map(([id,value])=>docSnap(id,value))});
  const writes=[];
  const db={collection(name){
    if(name==="websiteRequesterProfiles")return {
      get:async()=>snapshot(),
      onSnapshot(fn){fn(snapshot());return ()=>{};},
      doc(id){return {async set(patch){
        assert.ok(rows.has(id));rows.set(id,{...rows.get(id),...patch});
        writes.push({path:name+"/"+id,patch});
      }};}
    };
    assert.equal(name,"karaokeControl");
    return {doc(id){
      assert.equal(id,"liveKaraokeWebsiteSettings");
      return {async set(patch,options){writes.push({path:name+"/"+id,patch,options});}};
    }};
  }};
  const auth={currentUser:{uid:"host-uid"},onAuthStateChanged(fn){fn(this.currentUser);}};
  const listeners={};
  const document={
    getElementById:el,
    querySelectorAll:()=>[],
    addEventListener(type,fn){listeners[type]=fn;}
  };
  const LK={db,auth};
  const context={
    document,LK,window:{LK},console,
    CSS:{escape:s=>s},
    firebase:{firestore:{FieldValue:{serverTimestamp(){return {serverTime:true};}}}},
    addEventListener(){}
  };
  vm.runInNewContext(js,context,{filename:"live-karaoke-reviews.js"});
  const click=(action,id)=>{
    assert.equal(typeof listeners.click,"function");
    const selector="[data-review-"+action+"]";
    listeners.click({
      target:{closest(query){return query===selector?{dataset:{
        reviewApprove:id,reviewReject:id,reviewUnpublish:id
      }}:null;}}
    });
  };
  const settle=async()=>{for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve));};
  return {el,rows,writes,click,settle};
}

test("pending five-star review with no comment can be approved and published",async()=>{
  const ui=setup([{id:"r1",name:"Ben",country:"Malta",rating:5,review:"",
    reviewApproved:false,reviewStatus:"pending",reviewKey:"guest-1",reviewRecord:true}]);
  const card=ui.el("liveKaraokeReviewsList").innerHTML;
  assert.match(card,/Star rating only - no written review/);
  assert.match(card,/data-review-approve="r1"/);
  assert.doesNotMatch(card,/data-review-approve="r1" disabled/);
  ui.click("approve","r1");await ui.settle();
  assert.equal(ui.rows.get("r1").reviewApproved,true);
  const publicWrite=ui.writes.find(w=>w.path==="karaokeControl/liveKaraokeWebsiteSettings");
  assert.ok(publicWrite,"approved ratings should reach the public review projection");
  assert.equal(publicWrite.patch.publicReviews.length,1);
  const review=publicWrite.patch.publicReviews[0];
  assert.equal(review.name,"Ben");
  assert.equal(review.country,"Malta");
  assert.equal(review.rating,5);
  assert.equal(review.review,"");
  assert.equal(ui.el("liveKaraokeReviewsStatus").textContent.includes("published"),true);
});

test("private rating-only reviews remain anonymous, written-only reviews also remain valid",async()=>{
  const ui=setup([
    {id:"r1",name:"Secret",country:"Malta",rating:4,review:"",reviewPrivate:true,
      reviewApproved:true,reviewStatus:"approved",reviewKey:"a",reviewRecord:true},
    {id:"r2",name:"Guest",country:"Italy",rating:0,review:"Great night!",reviewPrivate:false,
      reviewApproved:false,reviewStatus:"pending",reviewKey:"b",reviewRecord:true}
  ]);
  ui.click("approve","r2");await ui.settle();
  const published=ui.writes.find(w=>w.path==="karaokeControl/liveKaraokeWebsiteSettings").patch.publicReviews;
  assert.equal(published.length,2);
  assert.equal(published[0].name,"");
  assert.equal(published[0].rating,4);
  assert.equal(published[0].review,"");
  assert.equal(published[1].name,"Guest");
  assert.equal(published[1].review,"Great night!");
});

test("empty rating and empty review cannot be approved",async()=>{
  const ui=setup([{id:"r1",name:"Blank",country:"",rating:0,review:"",
    reviewApproved:false,reviewStatus:"pending"}]);
  const card=ui.el("liveKaraokeReviewsList").innerHTML;
  assert.doesNotMatch(card,/data-review-approve="r1"/);
  assert.equal(ui.writes.length,0);
});

test("review page cache-busts updated moderation script",()=>{
  assert.match(html,/js\/live-karaoke-reviews\.js\?v=20261110-rating-only-approval/);
  assert.match(html,/Approved feedback can be a star rating/);
});
