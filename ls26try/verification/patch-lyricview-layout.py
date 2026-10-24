from pathlib import Path
p=Path("ls26try/host/lyricview.html")
s=p.read_text()
def change(a,b):
 global s
 if s.count(a)!=1:raise ValueError(f"Expected one markup anchor ({s.count(a)}): {a[:80]}")
 s=s.replace(a,b)
change('<div id="endMarker" class="host-end-marker">[ END ]</div>',
       '<div id="endMarker" class="host-end-marker">[ END ]</div><button id="endCompleteSongBtn" class="host-complete-song-btn" type="button">✓ COMPLETE</button>')
change('<p>Great run. Keep it going.</p><div class="host-end-next-wrap">',
       '<p>Great run. Keep it going.</p><div id="endCompletionFinishSlot" class="host-end-finish-slot" aria-label="Finish and next controls"></div><div class="host-end-next-wrap">')
change('js/lyricview.js?v=', 'js/lyricview.js?v=') if False else None
# Replace only the actual controller entry, leaving all other scripts unchanged.
import re
s,n=re.subn(r'js/lyricview\\.js\\?v=[^" ]+', 'js/lyricview.js?v=20261024-complete-v1', s)
if n!=1:raise ValueError("Controller script version not found uniquely: "+str(n))
s,n=re.subn(r'../admin-new/js/top-statusbar-session-tools\\.js\\?v=[^" ]+', '../admin-new/js/top-statusbar-session-tools.js?v=20261024-queue-v1',s)
if n!=1:raise ValueError("Queue controller version not found uniquely: "+str(n))
s,n=re.subn(r'../shared/performance-tools-ui\\.js\\?v=[^" ]+', '../shared/performance-tools-ui.js?v=20261024-finish-v1',s)
if n!=1:raise ValueError("Performance tools script version not found uniquely: "+str(n))
# Screen-specific additions load last, and don't change global shared app styling.
needle='</head>'
if s.count(needle)!=1:raise ValueError("head marker")
s=s.replace(needle,'<link rel="stylesheet" href="css/lyricview-completion.css?v=20261024-v1">'+needle)
p.write_text(s)
Path("ls26try/host/css/lyricview-completion.css").write_text("""
/* Host LyricView: [END] is not completion; require a clear stage-safe tap. */
body.host-lyric-view-page #endCompleteSongBtn {
  display:block!important;
  box-sizing:border-box;
  width:min(420px,calc(100% - 48px));
  min-height:58px;
  margin:10px auto 32px;
  border:2px solid #20d89a;
  border-radius:10px;
  background:#063b30;
  color:#53ffba;
  font-size:20px;
  font-weight:900;
  letter-spacing:.045em;
  text-align:center;
  cursor:pointer;
}
body.host-lyric-view-page #endCompleteSongBtn:disabled{opacity:.55}
body.host-lyric-view-page #endCompleteSongBtn:focus-visible{outline:3px solid #38bdf8;outline-offset:3px}
/* The original shared Finish & Next controls are moved, not cloned. */
body.host-lyric-view-page #endCompletionFinishSlot {
  width:100%;
  margin:10px 0 18px;
}
body.host-lyric-view-page #endCompletionFinishSlot:empty{display:none}
body.host-lyric-view-page #endCompletionFinishSlot #smartRunTools{
  display:block;
  width:100%!important;
  max-width:none!important;
  margin:0!important;
}
body.host-lyric-view-page #endCompletionFinishSlot .smart-finish{
  display:grid;
  grid-template-columns:minmax(160px,.42fr) minmax(0,1fr);
  align-items:center;
  gap:12px;
}
body.host-lyric-view-page #endCompletionFinishSlot .smart-finish button{
  min-height:50px;
  font-size:15px;
  font-weight:800;
}
body.host-lyric-view-page #endCompletionFinishSlot .smart-finish span{
  font-size:13px;
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
}
/* BEST NEXT: one compact row in the expanded Run Order. */
body.host-lyric-view-page #topStatusBar #tsRunOrderBestNext{
  display:flex!important;
  flex-wrap:nowrap!important;
  gap:10px!important;
  align-items:center!important;
  min-height:58px;
  padding:8px 12px!important;
  min-width:0;
  width:100%;
}
body.host-lyric-view-page #topStatusBar #tsRunOrderBestNext .ts-best-next-heading{
  display:flex!important;
  flex:1 1 auto;
  align-items:center!important;
  gap:8px;
  min-width:0;
  white-space:nowrap;
}
body.host-lyric-view-page #topStatusBar #tsRunOrderBestNext .ts-best-next-heading strong{
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
}
body.host-lyric-view-page #topStatusBar #tsRunOrderBestNext>p{
  display:none!important;
}
body.host-lyric-view-page #topStatusBar #tsRunOrderBestNext .ts-best-next-actions{
  display:flex!important;
  flex:0 0 auto;
  flex-wrap:nowrap!important;
  gap:5px!important;
  margin:0!important;
}
body.host-lyric-view-page #topStatusBar #tsRunOrderBestNext .ts-best-next-actions button{
  min-height:42px;
  margin:0!important;
  padding:7px 9px!important;
  font-size:12px!important;
}
@media(max-width:600px){
  body.host-lyric-view-page #topStatusBar #tsRunOrderBestNext{gap:6px!important;padding:6px!important}
  body.host-lyric-view-page #topStatusBar #tsRunOrderBestNext .ts-best-next-heading{gap:4px}
  body.host-lyric-view-page #topStatusBar #tsRunOrderBestNext .ts-best-next-heading small{display:none}
  body.host-lyric-view-page #endCompletionFinishSlot .smart-finish{grid-template-columns:1fr}
}
""")
print("LyricView markup and scoped styles updated")
