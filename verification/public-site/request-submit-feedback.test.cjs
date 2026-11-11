const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'../../livekaraoke26/js/app.js'),'utf8');
const begin=source.indexOf('  async function sendSelectedRequest(){');
const end=source.indexOf('\n  function beginEditRequesterName(){',begin);
assert.ok(begin>=0&&end>begin,'public request submit handler must exist');
const handler=source.slice(begin,end);

async function fixture({failure=null,statusRefreshFails=false}={}){
  const notice={textContent:'',attributes:{},setAttribute(key,value){this.attributes[key]=value}};
  const button={disabled:false,textContent:'SEND REQUEST'};
  const elements={
    requestNote:{value:'Please sing with me'},
    sendRequestBtn:button,
    requestNotice:notice,
    requestConfirmPanel:{hidden:false},
    requestSuccess:{hidden:true},
    requestSuccessText:{textContent:''}
  };
  const panels=[{hidden:false},{hidden:true}];
  const switched=[],stored=[];
  let writes=0,rendered=0,successTitle='';
  const env={
    $:id=>elements[id],
    window:{LKRequestGate:{canSubmit:()=>true}},
    profile:{name:'Customer',email:'',country:'Malta',ageRange:'',gender:''},
    song:{id:'song-1',title:'Song One',artist:'Artist One',year:1999},
    db:{collection(name){
      assert.equal(name,'publicSongRequests');
      return {async add(data){writes++;assert.equal(data.source,'live-karaoke-website');assert.equal(data.sessionId,'session-1');if(failure)throw failure;return {id:'new-request-id'};}};
    }},
    firebase:{firestore:{FieldValue:{serverTimestamp:()=>({timestamp:true})}}},
    document:{querySelectorAll:selector=>{assert.equal(selector,'[data-request-panel]');return panels;}},
    switchRequestTab:tab=>{switched.push(tab);notice.textContent='Scroll through the songs or search above.';},
    setRequestMobileToolbar:value=>{successTitle=value;},
    trackedRequestIds:()=>stored.slice(),
    saveTrackedRequestIds:ids=>{stored.splice(0,stored.length,...ids);},
    renderMyRequests:async()=>{rendered++;if(statusRefreshFails)throw Error('read failure');},
    console:{error(){},warn(){}}
  };
  const invoke=new Function('e',`
    let requestSubmitting=false,selectedRequestSongId='song-1',songs=[e.song],
      publicSetlist={id:'list',name:'Public List'};
    const window=e.window,document=e.document,db=e.db,firebase=e.firebase,console=e.console,
      $=e.$,requestProfile=()=>e.profile,requestSessionId=()=> 'session-1',
      songSessionState=()=> 'available',liveRequestTestMode=()=>false,
      requestEmailHash=async()=>'',requestDeviceId=()=> 'device',favouriteSongIds=()=>[],
      trackedRequestIds=e.trackedRequestIds,saveTrackedRequestIds=e.saveTrackedRequestIds,
      setRequestMobileToolbar=e.setRequestMobileToolbar,
      switchRequestTab=e.switchRequestTab,renderMyRequests=e.renderMyRequests;
    ${handler}
    return sendSelectedRequest;
  `)(env);
  await invoke();
  return {notice,button,panels,switched,stored,writes,rendered,successTitle,elements};
}

test('a denied Firestore write stays visibly failed on Songs and does not mark song requested',async()=>{
  const state=await fixture({failure:Object.assign(Error('denied'),{code:'permission-denied'})});
  assert.deepEqual(state.switched,['songs']);
  assert.match(state.notice.textContent,/Request not sent.*venue or session/i);
  assert.equal(state.notice.attributes.role,'alert');
  assert.equal(state.writes,1);
  assert.deepEqual(state.stored,[]);
  assert.equal(state.button.disabled,false);
});

test('network error displays a visible failure rather than the default instruction',async()=>{
  const state=await fixture({failure:Object.assign(Error('offline'),{code:'unavailable'})});
  assert.match(state.notice.textContent,/Request not sent.*connection/i);
  assert.deepEqual(state.stored,[]);
});

test('a completed write keeps confirmation even if request-history refresh fails',async()=>{
  const state=await fixture({statusRefreshFails:true});
  assert.equal(state.writes,1);
  assert.deepEqual(state.stored,['new-request-id']);
  assert.equal(state.elements.requestSuccess.hidden,false);
  assert.equal(state.successTitle,'success');
  assert.deepEqual(state.switched,[]);
  assert.match(state.elements.requestSuccessText.textContent,/sent to the host/i);
});
