const {test}=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const root=path.join(__dirname,"..");
const read=pathPart=>fs.readFileSync(path.join(root,pathPart),"utf8");
const script=read("admin-new/js/dashboard-reminders.js");
const {classify,maltaDate}=require("../admin-new/js/dashboard-reminders.js");
const stamp=value=>({toMillis:()=>+new Date(value),toDate:()=>new Date(value)});

test("Reminders use real pending dueAt and Malta local day without duplicate counts",()=>{
 const now=new Date("2026-11-11T07:19:00+01:00");
 const notes=[
  {id:"a",text:"Previous day",status:"pending",date:"2026-11-10",dueAt:stamp("2026-11-10T19:00:00+01:00")},
  {id:"b",text:"Earlier today",status:"pending",date:"2026-11-11",dueAt:stamp("2026-11-11T07:00:00+01:00")},
  {id:"c",text:"Later today",status:"pending",date:"2026-11-11",dueAt:stamp("2026-11-11T20:00:00+01:00")},
  {id:"d",text:"Date-only reminder",status:"pending",date:"2026-11-11",dueAt:stamp("2026-11-11T23:59:59+01:00")},
  {id:"e",text:"Future day",status:"pending",date:"2026-11-12",dueAt:stamp("2026-11-12T09:00:00+01:00")},
  {id:"f",text:"Completed",status:"completed",date:"2026-11-10",dueAt:stamp("2026-11-10T09:00:00+01:00")},
  {id:"g",text:"Undated",status:"pending",dueAt:null},
  {id:"h",text:"Old date-only legacy",status:"pending",date:"2026-11-08",dueAt:null}
 ];
 const result=classify(notes,now);
 assert.deepEqual(result.overdue.map(x=>x.id),["a","b","h"]);
 assert.deepEqual(result.today.map(x=>x.id),["c","d"]);
 assert.equal(new Set([...result.overdue,...result.today].map(x=>x.id)).size,5);
});
test("Malta date boundaries handle daylight-saving time",()=>{
 assert.equal(maltaDate("2026-03-28T22:30:00Z"),"2026-03-28");
 assert.equal(maltaDate("2026-03-28T23:30:00Z"),"2026-03-29");
 assert.equal(maltaDate("2026-03-29T22:30:00Z"),"2026-03-30");
 assert.equal(maltaDate("2026-10-25T22:30:00Z"),"2026-10-25");
 assert.equal(maltaDate("2026-10-25T23:30:00Z"),"2026-10-26");
});
test("Dashboard sections are in requested order and use the original reminder source",()=>{
 const html=read("admin-new/admin.html"),shared=read("shared/reminders.js");
 const strip=html.indexOf('id="dashboardOverdueRemindersStrip"');
 const live=html.indexOf('id="sessionPanel"');
 const section=html.indexOf('id="dashboardRemindersPanel"');
 const prev=html.indexOf('id="previousSessionPanel"');
 assert.ok(strip>0&&strip<live&&live<section&&section<prev);
 assert.match(html,/dashboard-reminders\.js\?v=20261111-dashboard-alerts-v1/);
 assert.match(html,/dashboard-reminders\.css\?v=20261111-dashboard-alerts-v1/);
 assert.match(html,/id="dashboardOverdueRemindersStrip"[^>]+hidden/);
 assert.match(html,/href="reminders\.html">MANAGE REMINDERS/);
 assert.match(shared,/ls26:reminders-pending/);
 assert.match(script,/addEventListener\('ls26:reminders-pending'/);
 assert.doesNotMatch(script,/onSnapshot|collection\(|\.get\(\)|setDoc|\.update\(/);
 assert.match(shared,/where\('createdBy','==',user\.uid\)\.where\('status','==','pending'\)/);
});
test("Overdue strip reflects live shared snapshot, scrolls to Reminders, clears on sign out",()=>{
 class Element {
  constructor(id=""){this.id=id;this.hidden=false;this.children=[];this.textContent="";this.listeners={};this.classList={add(){}};}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=[...nodes];}
  addEventListener(type,fn){this.listeners[type]=fn;}
  scrollIntoView(options){this.scrollOptions=options;}
 }
 const ids=["dashboardRemindersPanel","dashboardOverdueRemindersStrip","dashboardRemindersStatus",
 "dashboardOverdueReminderList","dashboardTodayReminderList","dashboardOverdueCount",
 "dashboardTodayCount","dashboardReminderTotal","dashboardOverdueReminderSummary",
 "dashboardOverdueReminderPreview"];
 const nodes=new Map(ids.map(id=>[id,new Element(id)]));
 const handlers={};
 const document={
  getElementById:id=>nodes.get(id)||null,
  createElement:tag=>new Element(tag),
  addEventListener:(type,fn)=>handlers[type]=fn,
  hidden:false
 };
 const window={
  addEventListener:(type,fn)=>handlers[type]=fn,
  matchMedia:()=>({matches:false}),
  setInterval:()=>123,
  clearInterval:()=>{}
 };
 const ctx={window,document,console,Date,Intl};
 vm.runInNewContext(script,ctx,{filename:"dashboard-reminders.js"});
 const el=id=>nodes.get(id);
 const today=maltaDate(new Date());
 const event=(list,uid="host")=>handlers["ls26:reminders-pending"]({detail:{
  uid,ready:true,error:"",reminders:list
 }});
 event([
  {text:"Take spare lead",status:"pending",priority:"high",date:"2026-11-08",
   dueAt:stamp("2026-11-08T08:00:00+01:00")},
  {text:"Check microphones",status:"pending",date:today,dueAt:null}
 ]);
 assert.equal(el("dashboardOverdueRemindersStrip").hidden,false);
 assert.equal(el("dashboardOverdueReminderSummary").textContent,"1 overdue reminder");
 assert.equal(el("dashboardOverdueCount").textContent,"1");
 assert.equal(el("dashboardTodayCount").textContent,"1");
 assert.equal(el("dashboardOverdueReminderList").children.length,1);
 assert.equal(el("dashboardOverdueReminderList").children[0].children[0].children[0].textContent,"Take spare lead");
 assert.equal(el("dashboardTodayReminderList").children.length,1);
 el("dashboardOverdueRemindersStrip").listeners.click();
 assert.equal(el("dashboardRemindersPanel").scrollOptions.block,"start");
 event([],null);
 assert.equal(el("dashboardOverdueRemindersStrip").hidden,true);
 assert.equal(el("dashboardOverdueReminderList").children.length,0);
 assert.equal(el("dashboardRemindersStatus").textContent,"Sign in to view reminders.");
});
test("Alerts disappear when overdue items complete, and errors are visible",()=>{
 const markup=read("admin-new/css/dashboard-reminders.css");
 assert.match(markup,/dashboard-overdue-strip\[hidden\]/);
 assert.match(markup,/dashboard-reminders-columns/);
 assert.match(markup,/max-width:760px/);
 const due=classify([{status:"completed",date:"2025-01-01",dueAt:stamp("2025-01-01T10:00:00Z")}],new Date());
 assert.equal(due.overdue.length,0);
});
