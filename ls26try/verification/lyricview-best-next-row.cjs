const assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.LS26_TEST_NODE_MODULES||process.cwd()]}));
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
assert.match(read('host/lyricview.html'),/lyricview-best-next-row\.css\?v=20261024-one-row-v1/);
const css=['admin-new/css/top-statusbar-session-tools.css','host/css/lyricview-completion.css','host/css/lyricview-best-next-row.css'].map(read).join('\n');
const html='<meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><body class="host-lyric-view-page" style="margin:0"><div id="topStatusBar" style="padding:10px"><div id="tsRunOrderQuickRow" class="ts-run-order-quickrow"><section class="ts-best-next" id="tsRunOrderBestNext"><div class="ts-best-next-heading"><small>BEST NEXT</small><strong>Boulevard of Broken Dreams Extended</strong><b>61</b><span class="rotation-badge">READY</span></div><p>Venue and recommendations</p><div class="ts-best-next-actions"><button>USE NEXT</button><button>SHOW 5</button></div></section></div></div></body>';
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try{for(const width of [390,570,760,960,1280]){
 const page=await browser.newPage({viewport:{width,height:850}});
 await page.setContent(html);
 const x=await page.evaluate(()=>{
 const q=s=>document.querySelector(s),r=e=>e.getBoundingClientRect(),row=r(q('#tsRunOrderQuickRow')),card=r(q('#tsRunOrderBestNext')),head=r(q('.ts-best-next-heading')),buttons=r(q('.ts-best-next-actions'));
 return{row:row.width,card:card.width,height:card.height,headRight:head.right,buttonsLeft:buttons.left,centerHead:(head.top+head.bottom)/2,centerButtons:(buttons.top+buttons.bottom)/2,overflow:document.documentElement.scrollWidth-window.innerWidth,buttons:[...q('.ts-best-next-actions').children].map(e=>r(e).height)};
 });
 assert.ok(Math.abs(x.card-x.row)<3,width+' not full width');
 assert.ok(x.height<=65,width+' too tall: '+x.height);
 assert.ok(x.headRight<=x.buttonsLeft+2,width+' overlaps');
 assert.ok(Math.abs(x.centerHead-x.centerButtons)<4,width+' wraps');
 assert.ok(x.overflow<=2,width+' overflow');
 assert.ok(x.buttons.every(v=>v>=42),width+' small touch targets');
 console.log('PASS '+width+'px one-row full-width BEST NEXT');
 await page.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});