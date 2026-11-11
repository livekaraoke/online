/* Dashboard reminder overview. Presentation only: consumes the existing
 * shared/reminders.js pending subscription, with no additional Firestore reads.
 */
(() => {
  'use strict';
  const ZONE = 'Europe/Malta';
  const timeParts = new Intl.DateTimeFormat('en-GB',{
    timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit'
  });
  function maltaDate(value) {
    const date=value instanceof Date?value:new Date(value);
    if(!Number.isFinite(+date))return '';
    const parts=Object.fromEntries(timeParts.formatToParts(date).map(part=>[part.type,part.value]));
    return [parts.year,parts.month,parts.day].join('-');
  }
  function millis(value) {
    if(value&&typeof value.toMillis==='function')return Number(value.toMillis())||0;
    if(value&&typeof value.toDate==='function')return +value.toDate()||0;
    if(value instanceof Date)return +value||0;
    return 0;
  }
  function classify(records,now=new Date()) {
    const present=+now,todayKey=maltaDate(now),overdue=[],today=[];
    for(const record of Array.isArray(records)?records:[]){
      if(!record||record.status!=='pending')continue;
      const due=millis(record.dueAt);
      const dateKey=/^\d{4}-\d{2}-\d{2}$/.test(String(record.date||''))?record.date:(due?maltaDate(due):'');
      if(due>0&&due<present)overdue.push(record);
      else if(dateKey===todayKey)today.push(record);
    }
    const sort=(a,b)=>(millis(a.dueAt)||Infinity)-(millis(b.dueAt)||Infinity)||
      String(a.text||'').localeCompare(String(b.text||''));
    overdue.sort(sort);
    today.sort(sort);
    return {overdue,today};
  }
  // Pure functions are also used by the Admin regression tests.
  if(typeof module!=='undefined'&&module.exports)module.exports={classify,maltaDate,millis};
  if(typeof document==='undefined'||typeof window==='undefined')return;
  const $=id=>document.getElementById(id);
  const panel=$('dashboardRemindersPanel'),strip=$('dashboardOverdueRemindersStrip');
  if(!panel||!strip)return;
  let snapshot={uid:null,ready:false,error:'',reminders:[]};
  function dateLabel(note) {
    if(!note.date)return 'Due date unavailable';
    const [year,month,day]=String(note.date).split('-');
    const dayText=year&&month&&day?day+'/'+month+'/'+year:String(note.date);
    return dayText+(note.time?' · '+note.time:' · Any time');
  }
  function row(note,kind) {
    const item=document.createElement('article');
    item.className='dashboard-reminder-item'+(kind==='overdue'?' is-overdue':'');
    const main=document.createElement('div');main.className='dashboard-reminder-main';
    const name=document.createElement('strong');name.className='dashboard-reminder-name';
    name.textContent=String(note.text||'Untitled reminder');
    const detail=document.createElement('small');detail.className='dashboard-reminder-detail';
    detail.textContent=[dateLabel(note),note.category||''].filter(Boolean).join(' · ');
    main.append(name,detail);
    const priority=document.createElement('span');
    priority.className='dashboard-reminder-priority';
    if(note.priority==='high')priority.classList.add('high');
    if(note.priority==='low')priority.classList.add('low');
    priority.textContent=String(note.priority||'normal').toUpperCase();
    item.append(main,priority);
    return item;
  }
  function render() {
    const result=classify(snapshot.reminders,new Date());
    const count=result.overdue.length+result.today.length;
    const alertCount=result.overdue.length;
    const status=$('dashboardRemindersStatus');
    const overdueItems=$('dashboardOverdueReminderList'),todayItems=$('dashboardTodayReminderList');
    const overdueCount=$('dashboardOverdueCount'),todayCount=$('dashboardTodayCount');
    const total=$('dashboardReminderTotal');
    if(overdueCount)overdueCount.textContent=String(alertCount);
    if(todayCount)todayCount.textContent=String(result.today.length);
    if(total)total.textContent=count?'('+count+')':'';
    strip.hidden=!(snapshot.uid&&snapshot.ready&&!snapshot.error&&alertCount>0);
    if(!strip.hidden){
      const summary=$('dashboardOverdueReminderSummary'),preview=$('dashboardOverdueReminderPreview');
      if(summary)summary.textContent=alertCount+' overdue reminder'+(alertCount===1?'':'s');
      if(preview)preview.textContent=result.overdue.slice(0,2).map(note=>String(note.text||'Reminder').trim()).join(' · ')+
        (alertCount>2?' · +'+(alertCount-2)+' more':'');
    }
    let message='';
    if(!snapshot.uid)message='Sign in to view reminders.';
    else if(snapshot.error)message=snapshot.error;
    else if(!snapshot.ready)message='Loading reminders…';
    if(status){status.textContent=message;status.hidden=!message;}
    const renderGroup=(target,records,emptyMessage,kind)=>{
      if(!target)return;
      target.replaceChildren();
      if(message)return;
      if(!records.length){
        const empty=document.createElement('p');empty.className='dashboard-reminder-empty';
        empty.textContent=emptyMessage;target.append(empty);return;
      }
      for(const note of records)target.append(row(note,kind));
    };
    renderGroup(overdueItems,result.overdue,'No overdue reminders.','overdue');
    renderGroup(todayItems,result.today,'No more reminders due today.','today');
  }
  window.addEventListener('ls26:reminders-pending',event=>{
    const data=event.detail||{};
    snapshot={
      uid:data.uid||null,ready:Boolean(data.ready),error:String(data.error||''),
      reminders:Array.isArray(data.reminders)?data.reminders:[]
    };
    render();
  });
  strip.addEventListener('click',()=>{
    panel.scrollIntoView({
      behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',
      block:'start'
    });
  });
  // Update due groups locally when the clock advances; no new database reads.
  const refresh=()=>{if(!document.hidden&&snapshot.ready)render();};
  const interval=window.setInterval(refresh,60000);
  document.addEventListener('visibilitychange',refresh);
  window.addEventListener('pagehide',()=>window.clearInterval(interval),{once:true});
  render();
})();