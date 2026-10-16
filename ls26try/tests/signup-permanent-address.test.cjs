const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const script=fs.readFileSync(require.resolve('../../signup/signup.js'),'utf8');
function run(responses,query=''){
 const nodes={},calls=[];
 function node(){return {value:'',hidden:false,disabled:false,textContent:'',children:[],appendChild(x){this.children.push(x)},setAttribute(){}}}
 const document={getElementById(id){return nodes[id]||(nodes[id]=node());},createElement:node,addEventListener(){},hidden:false};
 document.getElementById('success').hidden=true;
 function XHR(){this.open=(method,url)=>{calls.push({method,url})};this.send=()=>{const r=responses.shift();assert.ok(r,'unexpected network operation');this.status=r.status||200;this.readyState=4;this.responseText=JSON.stringify(r.body||{});this.onreadystatechange()};}
 const window={document,LKSignupPolicy:{rulesVerified:true,projectId:'demo-test'},location:{search:query},addEventListener(){}};
 vm.runInNewContext(script,{window,document,location:window.location,XMLHttpRequest:XHR,clearTimeout(){},setTimeout(){return 1;}});
 return {nodes,calls};
}
const token='a'.repeat(64),field=x=>typeof x==='string'?{stringValue:x}:typeof x==='boolean'?{booleanValue:x}:{integerValue:String(x)};
const doc=obj=>({body:{fields:Object.fromEntries(Object.entries(obj).map(([k,v])=>[k,field(v)]))}});
const view={body:{fields:{...doc({schemaVersion:1,sessionId:'s',revision:'r',enabled:true}).body.fields,songs:{mapValue:{fields:{}}}}}};
test('bare URL discovers current kiosk, loads snapshot, never writes',()=>{const r=run([doc({schemaVersion:1,enabled:true,token}),view]);assert.equal(r.calls.length,2);assert.ok(r.calls[0].url.endsWith('/karaokeControl/signupKioskPublic'));assert.ok(r.calls[1].url.endsWith('/signupKioskViews/'+token));assert.ok(r.calls.every(c=>c.method==='GET'));assert.match(r.nodes.notice.textContent,/Requests go straight to the host/);assert.equal(r.nodes.fields.disabled,false)});
test('disabled public kiosk never loads songs or writes',()=>{const r=run([doc({schemaVersion:1,enabled:false})]);assert.equal(r.calls.length,1);assert.match(r.nodes.notice.textContent,/SIGN-UP CLOSED/);assert.equal(r.nodes.fields.disabled,true)});
test('unpublished kiosk shows host setup rather than demanding a link',()=>{const r=run([{status:404}]);assert.match(r.nodes.notice.textContent,/SIGN-UP NOT OPEN YET/);assert.equal(r.nodes.send.disabled,true)});
test('discovery connection failure never enables submission',()=>{const r=run([{status:500}]);assert.match(r.nodes.notice.textContent,/NO CONNECTION/);assert.equal(r.nodes.send.disabled,true)});
test('legacy keyed links still use one snapshot read',()=>{const r=run([view],'?k='+token);assert.equal(r.calls.length,1);assert.ok(r.calls[0].url.includes('/signupKioskViews/'))});
test('host publishes discovery with snapshot and removes key from generated URL',()=>{const s=fs.readFileSync(require.resolve('../shared/signup-kiosk.js'),'utf8');assert.match(s,/tx.set\(ref\('karaokeControl\/signupKioskPublic'\),\{schemaVersion:1,enabled:result.enabled,token:kioskToken/);assert.match(s,/enabled:false,updatedAt:stamp\(\)/);assert.match(s,/\$\('kioskUrl'\)\.href=publicPage;/);});
