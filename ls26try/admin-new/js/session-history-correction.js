/* LiveSuite Session History correction helpers. Pure; no Firestore access. */
(function(root,factory){
  const api=factory();
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(root)root.LS26SessionCorrection=api;
})(typeof window!=="undefined"?window:null,function(){
  "use strict";
  const zone="Europe/Malta";
  const formatter=new Intl.DateTimeFormat("en-GB",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
  function toDate(value){
    if(!value)return null;
    const date=typeof value.toDate==="function"?value.toDate():value instanceof Date?value:new Date(value);
    return Number.isNaN(date.getTime())?null:date;
  }
  function asInput(value){
    const date=toDate(value);if(!date)return "";
    const parts=Object.fromEntries(formatter.formatToParts(date).filter(p=>p.type!=="literal").map(p=>[p.type,p.value]));
    return [parts.year,parts.month,parts.day].join("-")+"T"+parts.hour+":"+parts.minute;
  }
  function parseInput(value,convert){
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(value||"")))return null;
    const [date,time]=value.split("T");
    const result=convert(date,time);const d=toDate(result);
    if(!d||asInput(d)!==value)throw Error("This time is invalid in Malta. Check the date and daylight-saving change.");
    return d;
  }
  function validateTimes({scheduledStart,scheduledEnd,actualStart,actualEnd}){
    if(!scheduledStart||!scheduledEnd)throw Error("Scheduled start and end are required.");
    if(scheduledEnd<=scheduledStart)throw Error("Scheduled end must be later than scheduled start.");
    if(actualEnd&&!actualStart)throw Error("Enter actual start before actual end.");
    if(actualStart&&actualEnd&&actualEnd<actualStart)throw Error("Actual end cannot precede actual start.");
    return true;
  }
  const weekdays=["SUN","MON","TUE","WED","THU","FRI","SAT"];
  function dateKey(start){
    if(typeof start==="string" && /^\d{4}-\d{2}-\d{2}$/.test(start)) return start;
    return asInput(start).slice(0,10);
  }
  function withWeekday(title,start){
    const name=String(title||"").trim();
    const key=dateKey(start);
    if(!key)return name;
    const date=new Date(key+"T12:00:00Z");
    if(Number.isNaN(date.getTime()))return name;
    const token=key.slice(8,10)+"/"+key.slice(5,7);
    const match=name.match(/^(.*?)(?:\s+(?:MON|TUE|WED|THU|FRI|SAT|SUN))?\s+(\d{2}\/\d{2})$/i);
    // Leave custom titles and inconsistent date tokens unchanged.
    if(!match||match[2]!==token)return name;
    return match[1].trim()+" "+weekdays[date.getUTCDay()]+" "+token;
  }
  function titleFor(act,venue,start){
    const key=dateKey(start);
    const token=key?key.slice(8,10)+"/"+key.slice(5,7):"";
    const plain=[String(act||"").trim()+" @ "+String(venue||"").trim(),token].filter(Boolean).join(" ");
    return withWeekday(plain,start);
  }
  return {zone,toDate,asInput,parseInput,validateTimes,titleFor,withWeekday};
});
