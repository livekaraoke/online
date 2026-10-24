from pathlib import Path
p=Path("ls26try/host/js/lyricview.js")
s=p.read_text()
def change(old,new):
 global s
 if s.count(old)!=1:raise ValueError(f"Expected one lyricview match ({s.count(old)}): {old[:90]}")
 s=s.replace(old,new)
change(
 "  let autoScrollEndHandled = false;",
 "  let autoScrollEndHandled = false;\n  let completingSong = false;"
)
change(
 """        const result=await performanceLifecycle().start({sessionId,song:{...currentSong,id:currentSongId},requestId,bpm:performanceTempo.get()});""",
 """        // A different song may be loaded while another is still playing.
        // Close that earlier performance as interrupted, never as completed.
        const runSnap=await db.collection("karaokeControl").doc("runOrder").get();
        const run=runSnap.data()||{};
        if(run.sessionId===sessionId){
          const active=(run.items||[]).find(item=>String(item.status||'').toLowerCase()==='playing');
          if(active && String(active.songId)!==String(currentSongId)){
            await performanceLifecycle().finish({sessionId,itemId:active.id,status:'abandoned'});
          }
        }
        const result=await performanceLifecycle().start({sessionId,song:{...currentSong,id:currentSongId},requestId,bpm:performanceTempo.get()});"""
)
change(
 """    if (panel) panel.hidden=!show;
  }

  function showEndNextSongButton(show)""",
 """    if (panel) panel.hidden=!show;
    window.dispatchEvent(new Event("ls26:completion-state"));
  }

  function showEndNextSongButton(show)"""
)
change(
 """    window.dispatchEvent(new Event("ls26:song-finished"));
    queueSingerSync(true);""",
 """    // Reaching the marker only stops scrolling; completion is host-confirmed.
    queueSingerSync(true);"""
)
change(
 """    // Start persistence immediately, but do not hold the UI at [ END ] while
    // waiting for Firestore/network work.
    const finalizePromise=finalizeCurrentSongPlayed();
    const singerFinishedPromise=publishSingerSongFinished();
    showEndCompletionPanel(true);
    showEndNextSongButton(true);
    if ($("endSessionActions")) $("endSessionActions").hidden = false;
    syncEndSessionActions();
    const detailsPromise=renderEndNextSongDetails();

    requestAnimationFrame(()=>setTimeout(slowScrollCompletionIntoView,80));
    await Promise.allSettled([finalizePromise,detailsPromise,singerFinishedPromise]);
  }


  async function getNextRunOrderItem()""",
 """    // The performer can still sing/play the ending. COMPLETE is deliberate.
    $("endCompleteSongBtn")?.focus({preventScroll:true});
  }

  async function completeSongAtEnd() {
    if (completingSong || !$("endCompletionPanel")?.hidden) return;
    completingSong=true;
    const button=$("endCompleteSongBtn");
    if(button){button.disabled=true;button.textContent="COMPLETING...";}
    try {
      await stopAutoScrollAtEnd();
      // Do not show success if the existing lifecycle failed to save completion.
      await finalizeCurrentSongPlayed();
      window.dispatchEvent(new Event("ls26:song-finished"));
      await publishSingerSongFinished();
      showEndCompletionPanel(true);
      showEndNextSongButton(true);
      if ($("endSessionActions")) $("endSessionActions").hidden=false;
      syncEndSessionActions();
      await renderEndNextSongDetails();
      requestAnimationFrame(()=>setTimeout(slowScrollCompletionIntoView,80));
    } catch(error) {
      window.LS26?.toast("Could not complete song: "+error.message);
    } finally {
      completingSong=false;
      if(button){button.disabled=false;button.textContent="✓ COMPLETE";}
    }
  }


  async function getNextRunOrderItem()"""
)
change(
 """    // PLAY NEXT finalizes a started song; previewing end cards never changes status.
    if(performanceRecordCreated)await finalizeCurrentSongPlayed();
    const next = await getNextRunOrderItem();""",
 """    // Loading another song never silently marks the current performance complete.
    // If the performer starts the new song, the previous one is recorded as
    // abandoned by recordCurrentSongPlayed(), not as a completed performance.
    await flushPerformanceTempo();
    const next = await getNextRunOrderItem();"""
)
change(
 """      showEndCompletionPanel(false);
      showEndNextSongButton(false);""",
 """      showEndCompletionPanel(false);
      showEndNextSongButton(false);"""
)
change(
 """    if ($("nextRunOrderSongBtn")) {
      $("nextRunOrderSongBtn").onclick = async () => {
        if (autoScrollOn) startAutoScroll();
        await renderEndNextSongDetails();
        $("endMarker").scrollIntoView({behavior:"smooth",block:"start"});
      };
    }""",
 """    if ($("nextRunOrderSongBtn")) {
      $("nextRunOrderSongBtn").onclick = goToNextRunOrderSong;
    }
    if ($("endCompleteSongBtn")) {
      $("endCompleteSongBtn").onclick = completeSongAtEnd;
    }"""
)
p.write_text(s)
print("LyricView end marker and explicit completion patched")
