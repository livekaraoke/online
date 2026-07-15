(() => {
  const $ = id => document.getElementById(id);

  let song = null;
  let speed = 1;
  let scrolling = false;
  let frame = null;
  let unsubscribeSong = null;
  let currentControlSongId = "";
  let loadingSequence = 0;
  let loadingTimer = null;
  let guidanceMode = localStorage.getItem("karaokeGuidanceMode") || "normal";
  let scrollThumbDragging = false;
  let scrollThumbStartY = 0;
  let scrollStartY = 0;

  /* ======================================================================
   * LIVE TV STATIC CANVAS
   * This guarantees visibly moving noise while the standby screen is open.
   * It uses a small internal canvas and lets CSS scale it for performance.
   * ====================================================================== */
  let staticAnimationFrame = null;
  let staticLastPaint = 0;

  function paintStaticFrame(time = 0) {
    const canvas = $("standbyStaticCanvas");
    if (!canvas) return;

    if (!document.body.classList.contains("singer-standby-mode")) {
      staticAnimationFrame = requestAnimationFrame(paintStaticFrame);
      return;
    }

    // Around 18 frames per second gives a convincing TV-static look without
    // using unnecessary CPU on the singer tablet.
    if (time - staticLastPaint >= 55) {
      staticLastPaint = time;

      const width = 180;
      const height = 102;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const context = canvas.getContext("2d", { alpha: true });
      const image = context.createImageData(width, height);
      const pixels = image.data;

      for (let i = 0; i < pixels.length; i += 4) {
        const value = Math.random() < 0.08
          ? 235 + Math.floor(Math.random() * 20)
          : Math.floor(Math.random() * 190);
        pixels[i] = value;
        pixels[i + 1] = value;
        pixels[i + 2] = value;
        pixels[i + 3] = 205 + Math.floor(Math.random() * 50);
      }

      context.putImageData(image, 0, 0);

      // Random brighter and darker horizontal tears, similar to analogue TV.
      const tearCount = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < tearCount; i += 1) {
        const y = Math.floor(Math.random() * height);
        const h = 1 + Math.floor(Math.random() * 7);
        context.fillStyle = Math.random() > 0.5
          ? `rgba(255,255,255,${0.12 + Math.random() * 0.28})`
          : `rgba(0,0,0,${0.25 + Math.random() * 0.35})`;
        context.fillRect(0, y, width, h);
      }
    }

    staticAnimationFrame = requestAnimationFrame(paintStaticFrame);
  }

  function initialiseLiveStatic() {
    if (staticAnimationFrame) cancelAnimationFrame(staticAnimationFrame);
    staticAnimationFrame = requestAnimationFrame(paintStaticFrame);
  }

  function stopAutoScroll() {
    scrolling = false;
    cancelAnimationFrame(frame);
    const playButton = $("singerPlayBtn");
    if (playButton) playButton.textContent = "▶";
    const autoScroll = $("singerAutoScroll");
    if (autoScroll) autoScroll.checked = false;
  }

  function setSettingsEnabled(enabled) {
    const settingsButton = $("singerSettingsBtn");
    if (!settingsButton) return;

    settingsButton.disabled = !enabled;
    settingsButton.setAttribute("aria-disabled", enabled ? "false" : "true");

    if (!enabled) {
      $("singerSettings")?.classList.add("hidden");
    }
  }

  function clearLoadingTimer() {
    if (loadingTimer) {
      clearInterval(loadingTimer);
      loadingTimer = null;
    }
  }

  function setStandby(message = "The lyrics will appear automatically when the host sends a song.") {
    loadingSequence += 1;
    clearLoadingTimer();
    stopAutoScroll();
    song = null;

    document.body.classList.add("singer-standby-mode");
    document.body.classList.remove("singer-loading-mode", "singer-song-mode");

    $("standbyView").classList.remove("hidden");
    $("songLoadingView").classList.add("hidden");
    $("singerLyrics").classList.add("hidden");
    $("singerControls").classList.add("hidden");

    $("singerTitle").textContent = "KARAOKE LYRIC VIEW";
    $("singerArtist").textContent = "Ready for the next singer";

    const standbyMessage = $("standbyView")?.querySelector("p");
    if (standbyMessage) standbyMessage.textContent = message;

    setSettingsEnabled(false);
    window.scrollTo(0, 0);
    requestAnimationFrame(updateCustomScrollbar);
  }

  function setLoadingState(nextSong) {
    stopAutoScroll();
    document.body.classList.remove("singer-standby-mode", "singer-song-mode");
    document.body.classList.add("singer-loading-mode");

    $("standbyView").classList.add("hidden");
    $("singerLyrics").classList.add("hidden");
    $("singerControls").classList.add("hidden");
    $("songLoadingView").classList.remove("hidden");

    $("loadingSongTitle").textContent = nextSong.title || "Untitled Song";
    $("loadingSongArtist").textContent = nextSong.artist || "Unknown Artist";
    $("singerTitle").textContent = "CURRENTLY LOADING";
    $("singerArtist").textContent = `${nextSong.title || "Untitled Song"} — ${nextSong.artist || "Unknown Artist"}`;

    setSettingsEnabled(false);
    window.scrollTo(0, 0);
  }

  function beginSongCountdown(nextSong) {
    const sequence = ++loadingSequence;
    clearLoadingTimer();
    setLoadingState(nextSong);

    let count = 5;
    $("loadingCountdown").textContent = count;

    loadingTimer = setInterval(() => {
      if (sequence !== loadingSequence) {
        clearLoadingTimer();
        return;
      }

      count -= 1;

      if (count > 0) {
        $("loadingCountdown").textContent = count;
        $("loadingCountdown").classList.remove("countdown-pop");
        void $("loadingCountdown").offsetWidth;
        $("loadingCountdown").classList.add("countdown-pop");
        return;
      }

      clearLoadingTimer();
      song = nextSong;
      renderSingerSong();
    }, 1000);
  }

  function listenForHost() {
    db.collection("karaokeControl").doc("liveLyrics").onSnapshot(doc => {
      const data = doc.exists ? doc.data() : {};
      const id = String(data.currentLyricsSongId || data.currentSongId || "").trim();

      if (!id || data.displayState === "idle") {
        currentControlSongId = "";
        if (unsubscribeSong) {
          unsubscribeSong();
          unsubscribeSong = null;
        }
        setStandby();
        return;
      }

      // Ignore control-document metadata updates for the song already displayed.
      if (id === currentControlSongId && song?.firebaseId === id) return;

      currentControlSongId = id;

      if (unsubscribeSong) unsubscribeSong();

      let firstSnapshotForSong = true;
      unsubscribeSong = db.collection("lyrics").doc(id).onSnapshot(songDoc => {
        if (!songDoc.exists) {
          setStandby("The selected song is not in the lyrics database.");
          return;
        }

        const nextSong = LyricsCommon.normalizeSong(songDoc.data(), songDoc.id);

        if (firstSnapshotForSong || !song || song.firebaseId !== id) {
          firstSnapshotForSong = false;
          beginSongCountdown(nextSong);
        } else {
          // Keep visible lyrics current if the host edits the loaded song.
          song = nextSong;
          renderSingerSong(false);
        }
      }, error => setStandby(error.message));
    }, error => setStandby(error.message));
  }

  function sectionGuidanceClass(section) {
    const label = String(section.title || section.type || "lyrics").toLowerCase();

    if (/chorus repeat|repeat chorus|refrain repeat/.test(label)) return "guidance-repeat";
    if (/ending|outro|end/.test(label)) return "guidance-ending";
    if (/chorus/.test(label)) return "guidance-chorus";
    if (/bridge/.test(label)) return "guidance-bridge";
    if (/pre.?chorus/.test(label)) return "guidance-prechorus";
    if (/intro|instrumental|solo|interlude|break/.test(label)) return "guidance-instrumental";
    if (/verse/.test(label)) return "guidance-verse";
    return "guidance-default";
  }

  function applyGuidanceMode(mode) {
    guidanceMode = mode === "pro" ? "pro" : "normal";
    document.body.dataset.guidance = guidanceMode;
    localStorage.setItem("karaokeGuidanceMode", guidanceMode);

    document.querySelectorAll("[data-guidance]").forEach(button => {
      button.classList.toggle("active", button.dataset.guidance === guidanceMode);
    });
  }

  function updateCustomScrollbar() {
    const track = $("karaokeScrollTrack");
    const thumb = $("karaokeScrollThumb");
    if (!track || !thumb) return;

    const pageHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    const viewportHeight = window.innerHeight;
    const maxScroll = Math.max(0, pageHeight - viewportHeight);

    track.classList.toggle("hidden-scrollbar", maxScroll <= 2 || document.body.classList.contains("singer-standby-mode") || document.body.classList.contains("singer-loading-mode"));
    if (maxScroll <= 2) return;

    const trackHeight = track.clientHeight;
    const thumbHeight = Math.max(52, Math.round(trackHeight * (viewportHeight / pageHeight)));
    const maxThumbTop = Math.max(0, trackHeight - thumbHeight);
    const thumbTop = maxScroll ? (window.scrollY / maxScroll) * maxThumbTop : 0;

    thumb.style.height = `${thumbHeight}px`;
    thumb.style.transform = `translateY(${Math.max(0, Math.min(maxThumbTop, thumbTop))}px)`;
  }

  function renderSingerSong(resetPosition = true) {
    document.body.classList.remove("singer-standby-mode", "singer-loading-mode");
    document.body.classList.add("singer-song-mode");

    $("standbyView").classList.add("hidden");
    $("songLoadingView").classList.add("hidden");
    $("singerLyrics").classList.remove("hidden");
    $("singerControls").classList.remove("hidden");

    $("singerTitle").textContent = song.title;
    $("singerArtist").textContent = song.artist;
    setSettingsEnabled(true);

    const content = $("singerLyrics");
    content.innerHTML = "";

    (song.sections || []).forEach(section => {
      if (
        section.type === "separator" ||
        section.type === "tab" ||
        section.type === "hostNote" ||
        section.type === "host-note"
      ) return;

      const html = LyricsCommon.singerHTMLFromSection(section);
      if (!html) return;

      if (section.type === "performanceNote" || section.type === "performance-note") {
        const cue = document.createElement("div");
        cue.className = "singer-performance-cue";
        cue.innerHTML = html;
        content.appendChild(cue);
        return;
      }

      const block = document.createElement("section");
      block.className = `singer-section ${sectionGuidanceClass(section)} type-${String(section.title || section.type || "lyrics")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")}`;

      block.innerHTML = `
        ${section.title ? `<h2>${LyricsCommon.escapeHTML(section.title)}</h2>` : ""}
        <div class="singer-section-body">${html}</div>
      `;
      content.appendChild(block);
    });

    const end = document.createElement("div");
    end.className = "singer-end";
    end.textContent = "[ END ]";
    content.appendChild(end);

    applyGuidanceMode(guidanceMode);
    if (resetPosition) window.scrollTo({ top: 0, behavior: "instant" });
    requestAnimationFrame(updateCustomScrollbar);
  }

  function scrollLoop() {
    if (!scrolling) return;

    window.scrollBy(0, 0.42 * speed);

    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
      stopAutoScroll();
      return;
    }

    frame = requestAnimationFrame(scrollLoop);
  }

  function toggleScroll() {
    if (!song) return;

    scrolling = !scrolling;
    $("singerPlayBtn").textContent = scrolling ? "Ⅱ" : "▶";
    $("singerAutoScroll").checked = scrolling;

    if (scrolling) scrollLoop();
    else cancelAnimationFrame(frame);
  }

  function updateSpeed(delta) {
    speed = Math.max(0.25, Math.min(3, speed + delta));
    $("singerSpeedLabel").textContent = `${speed.toFixed(2)}×`;
    $("singerBottomSpeed").textContent = `${speed.toFixed(2)}×`;
  }

  $("singerSettingsBtn").onclick = () => {
    if (!song) return;
    $("singerSettings").classList.toggle("hidden");
  };

  $("closeSingerSettings").onclick = () => $("singerSettings").classList.add("hidden");
  $("fullscreenSingerBtn").onclick = () => document.fullscreenElement
    ? document.exitFullscreen()
    : document.documentElement.requestFullscreen();
  $("singerPlayBtn").onclick = toggleScroll;
  $("singerAutoScroll").onchange = event => {
    if (event.target.checked !== scrolling) toggleScroll();
  };
  $("singerSpeedDown").onclick = () => updateSpeed(-0.25);
  $("singerSpeedUp").onclick = () => updateSpeed(0.25);
  $("singerMinusBtn").onclick = () => updateSpeed(-0.25);
  $("singerPlusBtn").onclick = () => updateSpeed(0.25);

  document.addEventListener("click", event => {
    const guidance = event.target.dataset.guidance;
    if (guidance) {
      applyGuidanceMode(guidance);
    }

    const theme = event.target.dataset.theme;
    if (theme) {
      document.body.dataset.theme = theme;
      event.target.parentElement.querySelectorAll("button")
        .forEach(button => button.classList.toggle("active", button === event.target));
    }

    const font = event.target.dataset.font;
    if (font) {
      document.body.dataset.font = font;
      event.target.parentElement.querySelectorAll("button")
        .forEach(button => button.classList.toggle("active", button === event.target));
    }

    const size = event.target.dataset.size;
    if (size) {
      document.body.dataset.size = size;
      event.target.parentElement.querySelectorAll("button")
        .forEach(button => button.classList.toggle("active", button === event.target));
    }

    const spacing = event.target.dataset.spacing;
    if (spacing) {
      document.body.dataset.spacing = spacing;
      event.target.parentElement.querySelectorAll("button")
        .forEach(button => button.classList.toggle("active", button === event.target));
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") $("singerSettings").classList.add("hidden");
  });

  function initialiseCustomScrollbar() {
    const track = $("karaokeScrollTrack");
    const thumb = $("karaokeScrollThumb");
    if (!track || !thumb) return;

    window.addEventListener("scroll", updateCustomScrollbar, { passive: true });
    window.addEventListener("resize", updateCustomScrollbar);

    track.addEventListener("click", event => {
      if (event.target === thumb) return;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo({ top: ratio * maxScroll, behavior: "smooth" });
    });

    thumb.addEventListener("pointerdown", event => {
      scrollThumbDragging = true;
      scrollThumbStartY = event.clientY;
      scrollStartY = window.scrollY;
      thumb.setPointerCapture(event.pointerId);
      document.body.classList.add("scroll-thumb-dragging");
    });

    thumb.addEventListener("pointermove", event => {
      if (!scrollThumbDragging) return;
      const trackHeight = track.clientHeight;
      const thumbHeight = thumb.offsetHeight;
      const maxThumbTravel = Math.max(1, trackHeight - thumbHeight);
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const scrollDelta = ((event.clientY - scrollThumbStartY) / maxThumbTravel) * maxScroll;
      window.scrollTo(0, Math.max(0, Math.min(maxScroll, scrollStartY + scrollDelta)));
    });

    const stopDrag = event => {
      if (!scrollThumbDragging) return;
      scrollThumbDragging = false;
      document.body.classList.remove("scroll-thumb-dragging");
      try { thumb.releasePointerCapture(event.pointerId); } catch (_) {}
    };

    thumb.addEventListener("pointerup", stopDrag);
    thumb.addEventListener("pointercancel", stopDrag);
    updateCustomScrollbar();
  }

  applyGuidanceMode(guidanceMode);
  initialiseLiveStatic();
  initialiseCustomScrollbar();
  setStandby();
  listenForHost();
})();
