/* Copyright © 2026 LiveSuite. Verify confirmation dismissal cannot approve an action. */
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
class Element{
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.events={};this.nodeType=1;}
 append(...nodes){nodes.forEach(n=>{this.children.push(n);n.parent=this})}prepend(n){this.children.unshift(n);n.parent=this}setAttribute(){}focus(){}showModal(){this.open=true}close(){this.open=false;this.events.close?.()}addEventListener(name,fn){this.events[name]=fn}remove(){this.parent.children=this.parent.children.filter(x=>x!==this)}
}
const body=new Element('body'),ctx={document:{body,readyState:'loading',createElement:t=>new Element(t),addEventListener(){}},window:null};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../shared/dialogs.js'),'utf8'),ctx);
const find=(node,test)=>test(node)?node:node.children.map(x=>find(x,test)).find(Boolean);
(async()=>{
 let resolved=false;const p=ctx.LS26Dialogs.confirm('Delete?').then(v=>{resolved=true;return v});await Promise.resolve();assert.equal(resolved,false);
 const d=body.children[0];find(d,x=>x.className==='ls26-modal-x').onclick();assert.equal(await p,false);assert.equal(body.children.length,0);
 const yes=ctx.LS26Dialogs.confirm('Move?');find(body.children[0],x=>x.tagName==='FORM').onsubmit({preventDefault(){}});assert.equal(await yes,true);
 const cancel=ctx.LS26Dialogs.prompt('Title','Initial');body.children[0].close();assert.equal(await cancel,null);
 const value=ctx.LS26Dialogs.prompt('Title','Initial');const prompt=body.children[0];find(prompt,x=>x.tagName==='INPUT').value='Changed';find(prompt,x=>x.tagName==='FORM').onsubmit({preventDefault(){}});assert.equal(await value,'Changed');
 console.log('PASS: custom dialog waits for a decision; X/Escape cancellation never approves; confirmation and prompt preserve values.');
})().catch(e=>{console.error(e);process.exit(1)});
