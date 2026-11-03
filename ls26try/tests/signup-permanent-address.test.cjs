const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const script=fs.readFileSync(require.resolve('../../signup/signup.js'),'utf8');
function run(responses,query=''){
 const nodes={},calls=[],timers=[];let discoveryReads=0;
 function node(){return {value:'',hidden:false,disabled:false,textContent:'',children:[],style:{},attributes:{},
 appendChild(x){if(x.fragment){while(x.children.length)this.appendChild(x.children.shift())}else this.children.push(x)},
 removeChild(x){this.children.splice(this.children.indexOf(x),1)},
 get firstChild(){return this.children[0]||null},
 setAttribute(name,value){this.attributes[name]=String(value)},blur(){},focus(){},getElementsByTagName(){return [node()]},clientHeight:768,
 getBoundingClientRect(){return {top:0,bottom:200,height:200}},offsetHeight:140};}
 const document={getElementById(id){return nodes[id]||(nodes[id]=node());},createElement:node,createDocumentFragment(){const f=node();f.fragment=true;return f},addEventListener(){},documentElement:{clientHeight:768},hidden:false};
 document.getElementById('success').hidden=true;
 function XHR(){
 this.open=(method,url)=>{this.url=url;calls.push({method,url,availability:url.endsWith(':runQuery')||url.includes('/publicSites/'),gate:url.includes('/currentSession')||url.endsWith('/karaoke/state')})};
 this.setRequestHeader=()=>{};
 this.send=()=>{
  let r;
  if(this.url.endsWith('/karaokeControl/currentSession'))r=doc({active:true,sessionId:'s'});
  else if(this.url.endsWith('/karaoke/state'))r=doc({songsEnabled:true});
  else if(this.url.endsWith('/karaokeControl/signupKioskPublic')&&(query||discoveryReads++>0))r=doc({schemaVersion:1,enabled:true,token});
  else if(this.url.endsWith(':runQuery'))r={body:[]};
  else if(this.url.includes('/publicSites/'))r={status:404};
  else r=responses.shift();
  assert.ok(r,'unexpected network operation '+this.url);
  this.status=r.status||200;this.readyState=4;
  this.responseText=JSON.stringify(r.body===undefined?{}:r.body);this.onreadystatechange();
 };
 }

 const window={document,LKSignupPolicy:{rulesVerified:true,projectId:'demo-test'},location:{search:query,reload(){}},addEventListener(){},scrollTo(){},innerHeight:768,crypto:{getRandomValues(bytes){for(let i=0;i<bytes.length;i++)bytes[i]=i+1;return bytes;}}};
 vm.runInNewContext(script,{window,document,location:window.location,XMLHttpRequest:XHR,clearTimeout(){},setTimeout(fn,ms){timers.push({fn,ms});return timers.length;}});
 return {nodes,calls,timers};
}
const token='a'.repeat(64),field=x=>typeof x==='string'?{stringValue:x}:typeof x==='boolean'?{booleanValue:x}:{integerValue:String(x)};
const doc=obj=>({body:{fields:Object.fromEntries(Object.entries(obj).map(([k,v])=>[k,field(v)]))}});
const view={body:{fields:{...doc({schemaVersion:1,sessionId:'s',revision:'r',enabled:true}).body.fields,songs:{mapValue:{fields:{}}}}}};
test('bare URL discovers current kiosk, loads snapshot, never writes',()=>{const r=run([doc({schemaVersion:1,enabled:true,token}),view]);assert.equal(r.calls.filter(c=>!c.availability&&!c.gate&&c.url.includes('/signupKioskViews/')).length,1);assert.ok(r.calls[0].url.endsWith('/karaokeControl/signupKioskPublic'));assert.ok(r.calls[1].url.endsWith('/signupKioskViews/'+token));assert.ok(r.calls.filter(c=>!c.availability).every(c=>c.method==='GET'));
 assert.ok(r.calls.some(c=>c.url.endsWith(':runQuery')));assert.match(r.nodes.notice.textContent,/Requests go straight to the host/);assert.equal(r.nodes.fields.disabled,false)});
test('disabled public kiosk never loads songs or writes',()=>{const r=run([doc({schemaVersion:1,enabled:false})]);assert.equal(r.calls.length,1);assert.match(r.nodes.notice.textContent,/SIGN-UP CLOSED/);assert.equal(r.nodes.fields.disabled,true)});
test('unpublished kiosk shows host setup rather than demanding a link',()=>{const r=run([{status:404}]);assert.match(r.nodes.notice.textContent,/SIGN-UP NOT OPEN YET/);assert.equal(r.nodes.send.disabled,true)});
test('discovery connection failure never enables submission',()=>{const r=run([{status:500}]);assert.match(r.nodes.notice.textContent,/NO CONNECTION/);assert.equal(r.nodes.send.disabled,true)});
test('legacy keyed links still use one snapshot read',()=>{const r=run([view],'?k='+token);assert.equal(r.calls.filter(c=>!c.availability&&!c.gate&&c.url.includes('/signupKioskViews/')).length,1);assert.ok(r.calls[0].url.includes('/signupKioskViews/'))});
test('host publishes discovery with snapshot and removes key from generated URL',()=>{const s=fs.readFileSync(require.resolve('../shared/signup-kiosk.js'),'utf8');assert.match(s,/tx.set\(ref\('karaokeControl\/signupKioskPublic'\),\{schemaVersion:1,enabled:result.enabled,token:kioskToken/);assert.match(s,/enabled:false,updatedAt:stamp\(\)/);assert.match(s,/\$\('kioskUrl'\)\.href=publicPage;/);});

test('full 80-song list, name first, search, selection, confirmed POST reset',()=>{
 const songs={};
 for(let i=0;i<80;i++)songs['s'+i]={mapValue:{fields:{title:{stringValue:'Song '+String(i).padStart(3,'0')},artist:{stringValue:'Artist'}}}};
 const fullView={body:{fields:{...view.body.fields,songs:{mapValue:{fields:songs}}}}};
 const r=run([doc({schemaVersion:1,enabled:true,token}),fullView,{body:{writeResults:[{},{}]}},fullView]);
 assert.equal(r.nodes.idleScreen.hidden,false);
 assert.equal(r.nodes.idleScreen.disabled,false);
 r.nodes.idleScreen.onclick();
 assert.equal(r.nodes.idleScreen.hidden,true);
 assert.equal(r.nodes.songResults.children.length,80);
 assert.equal(r.nodes.nameStep.hidden,false);
 assert.equal(r.nodes.songStep.hidden,true);
 assert.equal(r.nodes.next.disabled,true);
 r.nodes.singerName.value='Jane';r.nodes.singerName.oninput();
 assert.equal(r.nodes.next.disabled,false);r.nodes.next.onclick();
 assert.equal(r.nodes.nameStep.hidden,true);assert.equal(r.nodes.songStep.hidden,false);
 r.nodes.songSearch.value='Song 079';r.nodes.songSearch.oninput();
 assert.equal(r.nodes.songResults.children.filter(x=>x.style.display==='block').length,1);
 r.nodes.songSearch.value='';r.nodes.clearSearch.onclick();
 const row=r.nodes.songResults.children[79];row.onclick();
 assert.match(row.className,/selected/);assert.match(r.nodes.selection.textContent,/Song 079/);
 assert.equal(r.nodes.send.disabled,false);
 r.nodes.signupForm.onsubmit({preventDefault(){}});
 assert.equal(r.calls.filter(x=>x.url.endsWith(':commit')).length,1);
 assert.equal(r.nodes.success.hidden,false);assert.equal(r.nodes.singerName.value,'');
 assert.equal(r.nodes.songStep.hidden,true);
 const next=r.timers.find(t=>t.ms===8000);
 assert.ok(next,'success must stay visible for eight seconds');
 next.fn();
 assert.equal(r.nodes.idleScreen.hidden,false);
 assert.equal(r.nodes.idleScreen.disabled,false);
});
