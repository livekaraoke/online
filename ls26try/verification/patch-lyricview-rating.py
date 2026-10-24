from pathlib import Path
p=Path("ls26try/host/js/lyricview.js")
s=p.read_text()
old="""      await finalizeCurrentSongPlayed();
      window.dispatchEvent(new Event("ls26:song-finished"));"""
new="""      const completedRecord=await finalizeCurrentSongPlayed();
      // Rating is attached to this exact completed performance, never a song
      // metadata document or a subsequent Run Order item.
      if(completedRecord?.completed&&completedRecord.item?.performanceId){
        const {sessionId}=await getActiveSessionContext();
        if(sessionId)window.dispatchEvent(new CustomEvent("ls26:performance-completed",{
          detail:{sessionId,performanceId:completedRecord.item.performanceId,songId:currentSongId}
        }));
      }
      window.dispatchEvent(new Event("ls26:song-finished"));"""
if s.count(old)!=1:raise RuntimeError("LyricView COMPLETE handler changed unexpectedly")
s=s.replace(old,new)
old="""      showEndNextSongButton(true);
      if ($("endSessionActions")) $("endSessionActions").hidden=false;
      syncEndSessionActions();
      await renderEndNextSongDetails();"""
new="""      // Completion is about recording and rating the song, not loading Next.
      if ($("endSessionActions")) $("endSessionActions").hidden=false;
      syncEndSessionActions();"""
if s.count(old)!=1:raise RuntimeError("LyricView completion controls changed")
s=s.replace(old,new)
p.write_text(s)

p=Path("ls26try/host/lyricview.html")
s=p.read_text()
old='<div id="endCompletionFinishSlot" class="host-end-finish-slot" aria-label="Finish and next controls"></div>'
new='''<div id="endCompletionFinishSlot" class="host-end-finish-slot" aria-label="Performance rating">
  <section id="endSongRating" class="host-end-rating" aria-label="Rate the completed performance">
    <h3>HOW DID THE SONG GO?</h3>
    <div class="host-end-rating-choices" role="group" aria-label="Audience response rating">
      <button type="button" data-crowd-rating="great" disabled>GREAT</button>
      <button type="button" data-crowd-rating="good" disabled>GOOD</button>
      <button type="button" data-crowd-rating="average" disabled>AVERAGE</button>
      <button type="button" data-crowd-rating="weak" disabled>WEAK</button>
      <button type="button" data-crowd-rating="" disabled>NOT RATED</button>
    </div>
    <p id="endRatingStatus" role="status" aria-live="polite">Rating available for a saved performance.</p>
  </section>
</div>'''
if s.count(old)!=1:raise RuntimeError("Rating destination changed")
s=s.replace(old,new)
old='<button id="endNextRunOrderSongBtn" class="host-end-next-song-btn" type="button" hidden>NEXT SONG</button><div id="endNextSongDetailsCard" class="host-end-next-song-card" hidden></div>'
if s.count(old)!=1:raise RuntimeError("Next preview layout changed")
s=s.replace(old,'')
old='<button id="endLoadNextSongBtn" type="button">♫ <span>LOAD NEXT SONG</span></button>'
if s.count(old)!=1:raise RuntimeError("Load Next action changed")
s=s.replace(old,'')
old='<script src="../shared/performance-tools-ui.js?v=20261024-finish-v1"></script>'
new='<script src="../shared/performance-tools-ui.js?v=20261024-finish-v1"></script><script src="js/lyricview-end-rating.js?v=20261024-rating-v1"></script>'
if s.count(old)!=1:raise RuntimeError("Performance script tag changed")
s=s.replace(old,new)
s=s.replace('js/lyricview.js?v=20261024-complete-v1','js/lyricview.js?v=20261024-rating-v1')
s=s.replace('css/lyricview-completion.css?v=20261024-v1','css/lyricview-completion.css?v=20261024-rating-v1')
p.write_text(s)

p=Path("ls26try/host/css/lyricview-completion.css")
css=p.read_text()
marker="/* Completed performance rating; never a second Next Song control. */"
if marker in css:raise RuntimeError("Rating styles already present")
css+='''

'''+marker+'''
body.host-lyric-view-page #endCompletionFinishSlot #smartRunTools{display:none!important}
body.host-lyric-view-page #endSongRating{
  box-sizing:border-box;
  width:100%;
  margin:0;
  padding:15px;
  border:1px solid #27617a;
  border-radius:12px;
  background:linear-gradient(135deg,#053044,#071f30);
  color:#eaf7fd;
}
body.host-lyric-view-page #endSongRating h3{
  margin:0 0 12px;
  font-size:15px;
  letter-spacing:.055em;
  color:#b9e1f1;
}
body.host-lyric-view-page .host-end-rating-choices{
  display:grid;
  grid-template-columns:repeat(5,minmax(0,1fr));
  gap:8px;
}
body.host-lyric-view-page .host-end-rating-choices button{
  box-sizing:border-box;
  min-width:0;
  min-height:52px;
  padding:9px 5px;
  border:1px solid #35657a;
  border-radius:8px;
  background:#0a2c3c;
  color:#e5f5fd;
  font-size:13px;
  font-weight:850;
  cursor:pointer;
}
body.host-lyric-view-page .host-end-rating-choices button:disabled{opacity:.48;cursor:not-allowed}
body.host-lyric-view-page .host-end-rating-choices button.is-selected{
  border-color:#24e4a2;
  color:#75ffd1;
  background:#074134;
  box-shadow:inset 0 0 0 1px #24e4a2;
}
body.host-lyric-view-page .host-end-rating-choices button:not(:disabled):focus-visible{
  outline:3px solid #42cafa;outline-offset:2px;
}
body.host-lyric-view-page #endRatingStatus{
  margin:10px 0 0;
  min-height:19px;
  color:#a7cad9;
  font-size:13px;
}
body.host-lyric-view-page #endRatingStatus.is-error{color:#ff9caa}
body.host-lyric-view-page #endSongChoiceActions{grid-template-columns:repeat(2,minmax(0,1fr))!important}
@media(max-width:640px){
  body.host-lyric-view-page .host-end-rating-choices{grid-template-columns:repeat(2,minmax(0,1fr))}
  body.host-lyric-view-page .host-end-rating-choices button:last-child{grid-column:1/-1}
}
'''
p.write_text(css)
print("Added one-tap completed-song rating; removed Next Song controls from completion card")
