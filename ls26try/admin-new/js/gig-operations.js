/* Pure gig administration helpers. Works in browser and node. */
(function(root,factory){
 const api=factory();if(typeof module!=="undefined"&&module.exports)module.exports=api;
 if(root)root.LS26GigOps=api;
})(typeof window!=="undefined"?window:null,function(){
 "use strict";
 const ZONE="Europe/Malta";
 const fmt=new Intl.DateTimeFormat("en-GB",{timeZone:ZONE,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"});
 const normalise=s=>String(s||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\bthe\b/g,"").replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
 function sameVenue(a,b){const an=normalise(a.name),bn=normalise(b.name);if(!an||an!==bn)return false;const aa=normalise(a.address),ba=normalise(b.address),al=normalise(a.locality),bl=normalise(b.locality);return !(aa&&ba&&aa!==ba)&&!(al&&bl&&al!==bl);}
 function recurrenceDates(start,frequency,count){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(start))throw Error("Enter a valid date.");
  const [y,m,d]=start.split("-").map(Number),first=new Date(Date.UTC(y,m-1,d,12));
  if(first.toISOString().slice(0,10)!==start)throw Error("Invalid date.");
  if(!["none","weekly","biweekly"].includes(frequency))throw Error("Invalid recurrence.");
  const n=frequency==="none"?1:Number(count);
  if(!Number.isInteger(n)||n<1||n>52)throw Error("Choose 1–52 occurrences.");
  const stride=frequency==="weekly"?7:frequency==="biweekly"?14:0;
  return Array.from({length:n},(_,i)=>new Date(Date.UTC(y,m-1,d+i*stride,12)).toISOString().slice(0,10));
 }
 function maltaTime(date,time){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time))throw Error("Invalid date or time.");
  const [y,m,d]=date.split("-").map(Number),[h,min]=time.split(":").map(Number);
  if(h>23||min>59)throw Error("Invalid time.");
  const wanted=Date.UTC(y,m-1,d,h,min);let guess=wanted;
  for(let i=0;i<6;i++){
   const p=Object.fromEntries(fmt.formatToParts(new Date(guess)).filter(x=>x.type!=="literal").map(x=>[x.type,Number(x.value)]));
   const actual=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);
   if(actual===wanted)return new Date(guess);
   guess+=wanted-actual;
  }
  throw Error("This Malta local time does not exist during the daylight-saving change.");
 }
 function schedule(date,start,end){
  const first=maltaTime(date,start),[y,m,d]=date.split("-").map(Number);
  const lastDate=new Date(Date.UTC(y,m-1,d+(end<=start?1:0),12)).toISOString().slice(0,10);
  const last=maltaTime(lastDate,end);
  if(last<=first)throw Error("End must be after start.");
  return {start:first,end:last,durationMs:last-first};
 }
 const money=v=>Math.round(Math.max(0,Number(v)||0)*100)/100;
 function financeSummary(v={}){const fee=money(v.agreedFee),received=money(v.amountReceived),share=v.personalShare===null||v.personalShare===undefined||v.personalShare===""?received:money(v.personalShare),organiser=money(v.organiserFee),expenses=money(v.expenses);return{fee,received,outstanding:Math.max(0,Math.round((fee-received)*100)/100),personalNet:Math.round((share+organiser-expenses)*100)/100};}
 return{ZONE,normalise,sameVenue,recurrenceDates,maltaTime,schedule,financeSummary,money};
});