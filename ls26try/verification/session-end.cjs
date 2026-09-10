/* Copyright © 2026 LiveSuite. End-time edits preserve start and reject stale sessions. */
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'../shared/session-ui.js'),'utf8');
let handler,writes=[],commits=0,active='s1',status={textContent:''};
const form={elements:{end:{value:'2026-09-10T23:30'}},querySelector:()=>status};
const ctx={Date,Number,date:x=>new Date(x),clock:()=>'',stamp:()=>1,tools:()=>({getSessionId:()=>active}),firebase:{firestore:{Timestamp:{fromDate:x=>x}}},db:()=>({collection:name=>({doc:id=>name+'/'+id}),batch:()=>({set:(ref,fields)=>writes.push({ref,fields}),commit:async()=>{commits++}})}),dialog:()=>({querySelector:()=>({set onsubmit(fn){handler=fn}}),close(){}})};
vm.createContext(ctx);vm.runInContext(src.slice(src.indexOf('  function editTimes('),src.indexOf('  async function chooseList')),ctx);
(async()=>{const session={id:'s1',scheduledStartAt:'2026-09-10T20:00',scheduledEndAt:'2026-09-10T23:00'};ctx.editTimes(session);await handler({preventDefault(){},currentTarget:form});assert.equal(commits,1);assert.equal(writes.length,2);for(const {fields}of writes){assert.equal('scheduledStartAt'in fields,false);assert.equal(fields.scheduledDurationMs,3.5*3600000)}active='s2';await handler({preventDefault(){},currentTarget:form});assert.equal(commits,1);assert.match(status.textContent,/session changed/);console.log('PASS: projected-end edit preserves start, updates duration, and rejects a stale active session.');})().catch(e=>{console.error(e);process.exit(1)});
