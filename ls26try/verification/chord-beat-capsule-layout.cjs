/* Browser layout regression: unified chord + spaced beat dots.
 * No Firebase, transport writes or modifications to song text.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.LS26_TEST_NODE_MODULES||process.cwd()]}));
const root=path.join(__dirname,'..'),css=fs.readFileSync(path.join(root,'host/css/lyricview-chord-beat-dots.css'),'utf8');
const markup=(font)=>'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+
'body{background:#061820;color:white;margin:0;padding:20px}.host-section-body{white-space:pre;font-size:'+font+'px;font-family:Arial;font-weight:700;line-height:1.6}' +
'.host-section-body .ls26-active-chord{outline:2px solid lime!important;outline-offset:3px;background:#033!important;box-shadow:0 0 2px 5px #097!important;color:#68ffb8!important}' +
css+'</style></head><body class="host-lyric-view-page"><div class="host-section-body">'+
'| <span class="ls26-timed-chord" data-ls26-beat-dots="●●●●" data-ls26-lit-dots="">C</span>       |  '+
'<span id="target" class="ls26-timed-chord" data-ls26-beat-dots="●●●●" data-ls26-lit-dots="●●">C/G</span>         |  '+
'<span id="next" class="ls26-timed-chord" data-ls26-beat-dots="●●" data-ls26-lit-dots="">Am</span>  |'+
'</div></body></html>';
(async()=>{
 const local=['/usr/bin/chromium','/usr/bin/google-chrome','/usr/bin/google-chrome-stable'].find(fs.existsSync);
 const browser=await chromium.launch({headless:true,...(local?{executablePath:local}:{}),args:['--no-sandbox']});
 try{
  for(const [width,font] of [[390,19],[760,24],[960,26],[1280,30]]){
   const page=await browser.newPage({viewport:{width,height:750}});
   try{
    await page.setContent(markup(font));
    const rect=sel=>page.locator(sel).boundingBox();
    const nextBefore=await rect('#next'),targetBefore=await rect('#target');
    await page.locator('#target').evaluate(el=>{
      const r=el.getBoundingClientRect();
      el.style.setProperty('--ls26-active-chord-width',r.width+'px');
      el.classList.add('ls26-active-chord');
    });
    const after=await page.evaluate(()=>{
      const el=document.querySelector('#target'),normal=getComputedStyle(el),dim=getComputedStyle(el,'::before'),lit=getComputedStyle(el,'::after'),r=el.getBoundingClientRect();
      return {
       chord:el.textContent,dots:el.dataset.ls26BeatDots,litDots:el.dataset.ls26LitDots,
       background:dim.backgroundColor,border:dim.borderTopColor,pad:parseFloat(dim.paddingLeft),
       width:r.width,outline:normal.outlineStyle,letterSpace:parseFloat(dim.letterSpacing),
       left:dim.left,content:dim.content,litContent:lit.content,
       dimPadLeft:parseFloat(dim.paddingLeft),litPadLeft:parseFloat(lit.paddingLeft),
       dimLeft:parseFloat(dim.left),litLeft:parseFloat(lit.left),
       dimTop:parseFloat(dim.top),litTop:parseFloat(lit.top),
       dimFont:dim.font,litFont:lit.font,dimFontSize:parseFloat(dim.fontSize),litFontSize:parseFloat(lit.fontSize),dimLetterSpacing:dim.letterSpacing,litLetterSpacing:lit.letterSpacing,
       dimBorder:dim.borderLeftWidth,litBorder:lit.borderLeftWidth,
       nextX:document.querySelector('#next').getBoundingClientRect().x,
       pageOverflow:document.documentElement.scrollWidth-window.innerWidth
      };
    });
    assert.equal(after.chord,'C/G','Chord text changed');
    assert.equal(after.dots,'●●●●','Beat markers missing');
    assert.equal(after.litDots,'●●','Two current beats must be lit');
    assert.equal(after.outline,'none','Old chord-only outline must be suppressed');
    assert.ok(after.background.includes('10, 210, 105'),width+' capsule background missing: '+after.background);
    assert.equal(after.border,'rgb(0, 216, 94)','Unified beat border missing at '+width);
    assert.ok(after.pad>after.width+3,width+' unified border does not cover entire chord text');
    assert.ok(after.letterSpace>1.8,width+' beat dots lack visual spacing: '+after.letterSpace);
    assert.ok(after.dimLeft<=-4,width+' green outline is too close to chord text: '+after.dimLeft+'px');
    const dotOffset=after.dimLeft+after.dimPadLeft;
    const preservedOffset=after.width+0.6*after.dimFontSize;
    assert.ok(Math.abs(dotOffset-preservedOffset)<1,width+' increasing left inset displaced the beat dots: '+dotOffset+' vs '+preservedOffset);
    assert.ok(Math.abs(after.dimLeft-after.litLeft)<.1,width+' dim and bright dots have different left origins');
    assert.ok(Math.abs(after.dimPadLeft-after.litPadLeft)<.1,width+' dim and bright dots have different horizontal insets');
    assert.ok(Math.abs(after.dimTop-after.litTop)<.1,width+' dim and bright dots have different vertical positions');
    assert.equal(after.dimFont,after.litFont,width+' beat layers must use identical fonts');
    assert.equal(after.dimLetterSpacing,after.litLetterSpacing,width+' beat layers must use identical inter-dot spacing');
    assert.equal(after.dimBorder,after.litBorder,width+' beat layers must have identical border offsets');
    assert.ok(Math.abs(after.nextX-nextBefore.x)<.15,width+' next chord shifted by styling');
    const targetAfter=await rect('#target');
    assert.ok(Math.abs(targetAfter.width-targetBefore.width)<.15,width+' chord text width changed');
    assert.ok(after.pageOverflow<=2,width+' page scroll overflow');
    await page.evaluate(()=>document.documentElement.classList.add('ls26-hide-active-chord'));
    const hidden=await page.locator('#target').evaluate(el=>{
      const dim=getComputedStyle(el,'::before'),lit=getComputedStyle(el,'::after');
      return {bg:dim.backgroundColor,dimLeft:parseFloat(dim.left),litLeft:parseFloat(lit.left),dimPad:parseFloat(dim.paddingLeft),litPad:parseFloat(lit.paddingLeft)};
    });
    assert.ok(!hidden.bg.includes('10, 210, 105'),'Hide chord highlight setting must remain respected');
    assert.ok(Math.abs(hidden.dimLeft-hidden.litLeft)<.1,width+' hidden beat layers became unaligned');
    assert.ok(Math.abs(hidden.dimPad-hidden.litPad)<.1,width+' hidden beats retained mismatched insets');
    console.log('PASS '+width+'px: one chord + spaced beats capsule; live overlay, no text/layout shift');
   }finally{await page.close();}
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
