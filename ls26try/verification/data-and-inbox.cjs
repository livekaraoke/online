/* Isolated logic tests: no browser, network or live Firebase. */
const vm=require('vm'),fs=require('fs'),assert=require('assert'),{webcrypto}=require('crypto');
function storage(){const map=new Map();return {getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)}}
const context={console,crypto:webcrypto,TextEncoder,Date,Map,Set,Promise,localStorage:storage(),sessionStorage:storage(),navigator:{onLine:true},document:{addEventListener(){}},Event:class{},queueMicrotask,window:null};context.window=context;context.dispatchEvent=()=>{};vm.createContext(context);vm.runInContext(fs.readFileSync(require('path').join(__dirname,'firebase-fixture.js'),'utf8'),context);context.firebase.initializeApp({projectId:'isolated-test'});context.db=context.firebase.firestore();context.LK={sessionTools:{getSession:()=>({id:'s1',venue:'Demo venue'}),getSessionId:()=> 's1'}};
vm.runInContext(fs.readFileSync(require('path').join(__dirname,'../shared/data.js'),'utf8'),context);vm.runInContext(fs.readFileSync(require('path').join(__dirname,'../shared/inbox.js'),'utf8'),context);
(async()=>{
 await Promise.all([context.LS26Data.collection('lyrics'),context.LS26Data.collection('lyrics')]);assert.equal(context.__fixture.calls.filter(x=>x[0]==='get'&&x[1]==='lyrics').length,1);
 await context.LS26Data.collection('lyrics');assert.equal(context.__fixture.calls.filter(x=>x[0]==='get'&&x[1]==='lyrics').length,1);
 context.LS26Data.invalidate('lyrics');await context.LS26Data.collection('lyrics');assert.equal(context.__fixture.calls.filter(x=>x[0]==='get'&&x[1]==='lyrics').length,2);
 await context.LS26Inbox.capture({title:'Missing SONG!',artist:'The Demo',requester:'Pat'});await context.LS26Inbox.capture({title:'missing song',artist:'the demo',requester:'Lee'});
 const entries=Object.entries(context.__fixture.data).filter(([k])=>k.startsWith('songInbox/'));assert.equal(entries.length,1);assert.equal(entries[0][1].requestCount,2);assert.equal(entries[0][1].lastSessionId,'s1');assert.equal(entries[0][1].lastVenue,'Demo venue');assert.equal(context.LS26Inbox.readDrafts().length,0);
 context.navigator.onLine=false;await assert.rejects(()=>context.LS26Inbox.capture({title:'Offline Song'}));assert.equal(context.LS26Inbox.readDrafts().length,1);const entry=context.LS26Inbox.readDrafts()[0];context.navigator.onLine=true;await context.LS26Inbox.commit(entry);await context.LS26Inbox.commit(entry);assert.equal(Object.values(context.__fixture.data).find(x=>x.title==='Offline Song').requestCount,1);
 console.log('PASS: cached and concurrent reads, explicit refresh, duplicate capture counter, session/venue capture, offline draft retention, idempotent retry.');
})().catch(e=>{console.error(e);process.exit(1)});
