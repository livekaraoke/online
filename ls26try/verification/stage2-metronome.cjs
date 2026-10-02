/* Reuse existing isolated fixtures, running only metronome behavior (no reminders).
 * The legacy full LyricView test has an unrelated stale sidebar placement check.
 * No application source is altered by this runner. Audio and storage are mocked.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {execFileSync}=require('node:child_process');
const root=path.join(__dirname,'..');
function fixture(file,boundary,exportName,ref){
 const filename=path.join(__dirname,file),source=fs.readFileSync(filename,'utf8'),end=source.indexOf(boundary);
 assert.ok(end>=0,'Expected existing fixture boundary');
 const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(__dirname);
 if(ref){
  const original=mod.require.bind(mod);
  mod.require=id=>id==='node:fs'?{...fs,readFileSync:(file,options)=>{
   if(typeof file==='string'&&file.startsWith(root+'/'))return execFileSync('git',['show',ref+':ls26try/'+path.relative(root,file)],{cwd:root,encoding:options==='utf8'?'utf8':undefined});
   return fs.readFileSync(file,options);
  }}:original(id);
 }
 mod._compile(source.slice(0,end)+'\nmodule.exports='+exportName+';',filename);
 return mod.exports;
}
(async()=>{
 for(const ref of [process.env.LS26_BASELINE_REF,null].filter((x,i)=>x||i===1)){
  const env=fixture('lyricview-metronome.cjs','const tick=','setup',ref)(),{el}=env;
  const cards=[...el('songInfoDrawer').querySelector('.song-info-scroll').children];
  console.log((ref?'BASELINE':'CURRENT')+' legacy placement indices:',cards.findIndex(x=>x.classList.contains('lv-metronome')),cards.findIndex(x=>x.classList.contains('ls26-karaoke-toggle')));
  assert.equal(env.sounds.length,0,'No startup audio');await el('lvMetroStart').onclick();assert.ok(env.sounds.length);assert.equal(env.timers.size,1);
  env.audio().currentTime=.65;for(const callback of env.timers.values())callback();assert.ok(env.sounds.length>1);
  env.scroll(false);assert.equal(env.timers.size,1,'Independent mode survives scroll pause');
  el('lvMetroStart').onclick();assert.equal(env.timers.size,0);assert.ok(env.sounds.every(n=>n.stopped));
  el('lvMetroFollow').checked=true;el('lvMetroFollow').onchange({target:el('lvMetroFollow')});
  env.scroll(true);await new Promise(r=>setImmediate(r));assert.equal(env.timers.size,1);env.scroll(false);assert.equal(env.timers.size,0);
  console.log('PASS '+(ref?'baseline':'current')+' LyricView metronome: idle, start, scheduled audio, independent stop, linked start/stop.');
 }
 await fixture('tools-integration.cjs','(async()=>{await reminders();','metronome')();
})().catch(error=>{console.error(error);process.exitCode=1;});
