/* Global Prompter defaults. One session read, explicit conflict-checked save.
 * Existing per-device keys remain the offline cache and Singer control contract. */
(()=>{
 'use strict';
 const DEFAULTS={guidance:'normal',theme:'default',font:'default',size:'normal',spacing:'normal',background:'#00131a',bottomBar:true,autoScroll:true,speed:1,focus:40,currentScale:1.72,contextScale:1.48,mutedScale:.82,mutedOpacity:.60,currentColour:'#16d8ff',chordAbove:0,chordBelow:0};
 const KEYS={guidance:'karaokeGuidanceMode',theme:'ls26:singerTheme',font:'ls26:singerFont',size:'ls26:singerTextSize',spacing:'ls26:singerSpacing',background:'ls26:karaokeSingerBackground',bottomBar:'ls26:karaokeSingerBottomBar',autoScroll:'ls26:singerAutoScroll',speed:'ls26:singerScrollSpeed',focus:'ls26:singerFocusPosition',currentScale:'ls26:singerCurrentLineScale',contextScale:'ls26:singerContextLineScale',mutedScale:'ls26:singerMutedLineScale',mutedOpacity:'ls26:singerMutedOpacity',currentColour:'ls26:singerCurrentLineColour',chordAbove:'ls26:singerChordSpaceAbove',chordBelow:'ls26:singerChordSpaceBelow'};
 const ranges={speed:[.25,3],focus:[20,65],currentScale:[1,2.5],contextScale:[.9,2.3],mutedScale:[.45,1.4],mutedOpacity:[.2,1],chordAbove:[0,40],chordBelow:[0,40]};
 const choices={guidance:['normal','pro','guitaroke'],theme:['default','warm','contrast'],font:['default','arial','dyslexic'],size:['small','normal','large','xlarge'],spacing:['normal','loose','looser']};
 const project=window.firebase?.app?.().options?.projectId||'default';
 const cacheKey='ls26:prompterGlobal:v1:'+project,sessionKey='ls26:prompterGlobal:loaded:'+project;let revision=null,pending=null;
 function normalize(raw={}){const out={...DEFAULTS};for(const key of Object.keys(out)){const v=raw[key];if(v===undefined)continue;if(ranges[key]){const n=Number(v);if(Number.isFinite(n))out[key]=Math.max(ranges[key][0],Math.min(ranges[key][1],n));}else if(choices[key]){if(choices[key].includes(v))out[key]=v;}else if(typeof out[key]==='boolean')out[key]=v===true||v==='true';else if(/^#[0-9a-f]{6}$/i.test(v))out[key]=v;}return out;}
 function get(){const raw={};try{for(const [key,storage]of Object.entries(KEYS)){const value=localStorage.getItem(storage);if(value!==null)raw[key]=value;}}catch(_){}return normalize(raw);}
 function apply(values){const next=normalize(values);try{for(const [key,storage]of Object.entries(KEYS))localStorage.setItem(storage,String(next[key]));}catch(_){}window.dispatchEvent(new CustomEvent('ls26:prompter-settings',{detail:next}));return next;}
 const db=()=>window.db||window.LK?.db||window.firebase?.firestore?.();
 const ref=()=>db().collection('noteSettings').doc('livesuitePrompterSettings');
 function remember(values){try{localStorage.setItem(cacheKey,JSON.stringify({revision,values}));sessionStorage.setItem(sessionKey,'1');}catch(_){}}
 async function load(force=false){
  if(pending)return pending;
  if(!force)try{const cached=JSON.parse(localStorage.getItem(cacheKey)||'null');if(sessionStorage.getItem(sessionKey)==='1'&&cached){revision=cached.revision;return {remote:cached.revision>0,missing:cached.revision===0,values:cached.revision>0?apply(cached.values):get()};}}catch(_){}
  pending=(async()=>{try{
   if(!db())throw Error('Firestore unavailable');const snap=await ref().get();
   if(snap.exists){const data=snap.data();if(data.schemaVersion!==1||!Number.isSafeInteger(data.revision)||data.revision<1)throw Error('Unsupported Prompter settings version');revision=data.revision;const values=apply(data.values);remember(values);return {remote:true,values};}
   revision=0;const values=get();remember(values);return {remote:false,missing:true,values};
  }catch(error){return {remote:false,error,values:get()};}finally{pending=null;}})();return pending;
 }
 async function save(values){
  if(revision===null){const result=await load();if(result.error)throw Error('Cannot check global settings. Local settings are kept; reconnect and retry.');}
  const expected=revision,next=normalize(values);
  const result=await db().runTransaction(async tx=>{
   const target=ref(),snap=await tx.get(target),current=snap.exists?snap.data():null;
   if(current&&(current.schemaVersion!==1||!Number.isSafeInteger(current.revision)))throw Error('Unsupported Prompter settings version.');
   if((current?.revision||0)!==expected){const error=Error('Global settings changed on another device. Reload global settings before saving.');error.code='CONFLICT';throw error;}
   const value={schemaVersion:1,revision:expected+1,values:next,updatedAt:window.firebase.firestore.FieldValue.serverTimestamp()};tx.set(target,value);return value.revision;
  });revision=result;apply(next);remember(next);return next;
 }
 window.LS26PrompterSettings=Object.freeze({DEFAULTS,KEYS,get,apply,normalize,load,save});
})();
