/* Copyright © 2026 Roxanna. Isolated data/workflow checks; no network access. */
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert');
const root=path.join(__dirname,'..'),policy=require('../js/policy.js');
for(const type of ['Solo','Live Karaoke','Texanna','Other','Roxanna / Solo',''])assert.equal(policy.isRoxanna({type}),false);
assert(policy.isRoxanna({type:' ROXANNA '}));assert(!policy.isRoxanna({type:'Roxanna',sessionType:'Solo'}));
const elements=new Map();const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
function el(id){if(!elements.has(id))elements.set(id,{id,value:'',textContent:'',innerHTML:'',hidden:false,open:false,style:{},classList:{add(){},remove(){},toggle(){}},addEventListener(){},setAttribute(){},showModal(){this.open=true},close(){this.open=false},focus(){},reportValidity:()=>true,reset(){}});return elements.get(id)}
for(const m of html.matchAll(/id="([^"]+)"/g))el(m[1]);
const data={
 'karaokeControl/currentSession':{active:true,sessionId:'r1',type:'Roxanna',venue:'Band Venue'},
 'performanceSessions/r1':{type:'Roxanna',status:'active'},
 'karaoke/state':{songsEnabled:true},
 'karaokeControl/runOrder':{sessionId:'r1',items:[]},
 'lyricsSetlists/rox':{name:'Roxanna',songIds:['a','b','hidden']},
 'lyrics/a':{title:'Amber Harbour',artist:'Demo'},'lyrics/b':{title:'Copper Skies',artist:'Demo'},'lyrics/hidden':{title:'Private Song',publicSongListVisible:false},
 'lyrics/solo':{title:'Solo only'},
 'upcomingEvents/rox':{type:'Roxanna',date:'2099-01-01',venue:'Band Venue'},
 'upcomingEvents/solo':{type:'Solo',date:'2099-01-01',venue:'Solo Venue'}
};
const reads=[],writes=[],listeners=[];let nextId=0;
const snap=(p)=>({id:p.split('/').at(-1),exists:!!data[p],data:()=>data[p]});
function ref(p,filters=[],limit=Infinity){return {path:p,where:(k,op,v)=>ref(p,[...filters,[k,op,v]],limit),limit:n=>ref(p,filters,n),doc:(id='new'+(++nextId))=>ref(p+'/'+id),async get(){reads.push({p,filters});if(p.includes('/'))return snap(p);return {docs:Object.keys(data).filter(k=>k.startsWith(p+'/')&&filters.every(([f,op,v])=>op==='in'?v.includes(f==='__id__'?k.split('/').at(-1):data[k][f]):data[k][f]===v)).slice(0,limit).map(snap)}},onSnapshot(fn,err){const l={p,filters,fn,err,active:true};listeners.push(l);return()=>l.active=false},async add(v){const r=ref(p).doc();writes.push({p:r.path,v});data[r.path]=v;return{id:r.path.split('/').at(-1)}},get id(){return p.split('/').at(-1)}}}
const db={collection:p=>ref(p),async runTransaction(fn){const pending=[];await fn({get:r=>r.get(),set:(r,v)=>pending.push({p:r.path,v})});for(const x of pending){writes.push(x);data[x.p]=x.v}}};
const store=new Map([['roxanna26.requestName','Test guest']]);
const context={console:{error(){},warn(){}},URL,Date,Map,Set,Promise,Number,String,Array,Math,JSON,Error,RoxannaPolicy:policy,ROXANNA_DB:db,document:{getElementById:id=>elements.get(id)||null,querySelector:()=>null,addEventListener(){}},firebase:{firestore:{FieldPath:{documentId:()=>'__id__'},FieldValue:{serverTimestamp:()=>123}}},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},location:{href:'https://example.test/roxanna26/',reload(){}},navigator:{},CSS:{escape:x=>x},setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},addEventListener(){}};context.window=context;
vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'js/config.js'),'utf8'),context);
let source=fs.readFileSync(path.join(root,'js/app.js'),'utf8');source=source.replace('  renderVideos();\n  renderAllPhotos();','  window.TEST={loadPublicSongs,selectRequestSong,sendSelectedRequest,renderMyRequests,submitBookingEnquiry,openRequestDialog,isLive,songs:()=>songs};\n  renderVideos();\n  renderAllPhotos();');vm.runInContext(source,context);
function emit(p,value){data[p]=value;for(const l of [...listeners])if(l.active&&l.p===p)l.fn(snap(p))}
const active=p=>listeners.filter(l=>l.active&&l.p===p).length;
(async()=>{
 await context.TEST.loadPublicSongs();assert.equal(context.TEST.songs().length,2);const n=reads.length;await context.TEST.loadPublicSongs();assert.equal(reads.length,n);assert(!reads.some(x=>x.p==='lyrics'&&!x.filters.length));
 emit('karaokeControl/currentSession',{active:true,type:'Solo',sessionId:'s1',venue:'Solo Venue'});assert(!context.TEST.isLive());assert.equal(active('performanceSessions/s1'),0);assert.equal(active('karaokeControl/runOrder'),0);assert(!el('heroGigs').innerHTML.includes('Solo Venue'));
 emit('karaokeControl/currentSession',{active:true,type:'Roxanna',sessionId:'r1',venue:'Band Venue'});emit('performanceSessions/r1',{type:'Roxanna',status:'active'});emit('karaoke/state',{songsEnabled:true});assert(context.TEST.isLive());assert.equal(active('karaokeControl/runOrder'),1);
 emit('karaokeControl/runOrder',{sessionId:'s1',items:[{status:'playing',songTitle:'Solo only'}]});assert.notEqual(el('currentSongTitle').textContent,'Solo only');
 emit('karaokeControl/runOrder',{sessionId:'r1',items:[{status:'playing',songTitle:'Band song',songId:'other'}]});assert.equal(el('currentSongTitle').textContent,'Band song');
 context.TEST.selectRequestSong('a');await context.TEST.sendSelectedRequest();assert.equal(writes.length,1);assert.equal(writes[0].v.sessionId,'r1');assert.equal(writes[0].v.type,'Roxanna');
 // Remote session changes before the listener reaches the client: transaction must reject.
 data['karaokeControl/currentSession']={active:true,type:'Solo',sessionId:'s2'};context.TEST.selectRequestSong('b');await context.TEST.sendSelectedRequest();assert.equal(writes.length,1);
 emit('karaokeControl/currentSession',{active:true,type:'Roxanna',sessionId:'r1'});emit('karaoke/state',{songsEnabled:false});context.TEST.selectRequestSong('b');await context.TEST.sendSelectedRequest();assert.equal(writes.length,1);
 emit('karaoke/state',{songsEnabled:true});await context.TEST.renderMyRequests();const count=active(writes[0].p);await context.TEST.renderMyRequests();assert.equal(active(writes[0].p),count);
 emit('karaokeControl/currentSession',{active:true,type:'Live Karaoke',sessionId:'k1'});assert(!context.TEST.isLive());assert.equal(active('karaokeControl/runOrder'),0);assert.equal(active(writes[0].p),0);assert.equal(el('currentSongTitle').textContent,'No active session');
 el('enquiryName').value='Guest';el('enquiryEmail').value='guest@example.test';el('enquiryEventType').value='Private Party';el('enquiryMessage').value='Band booking';await context.TEST.submitBookingEnquiry({preventDefault(){}});assert.equal(writes.at(-1).v.performerType,'Roxanna');assert.equal(writes.at(-1).v.sourceKey,'roxanna26');
 console.log('PASS: act isolation, fail-closed metadata, lazy queue listeners, foreign queue rejection, cached dedicated repertoire, no whole-library fetch, request type/session fields, submit-time session race, closed requests, listener reuse/cleanup, Roxanna bookings.');
})().catch(e=>{console.error(e);process.exit(1)});
