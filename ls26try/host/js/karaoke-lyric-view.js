/* Copyright © 2026 LiveSuite. All rights reserved.
 * host/js/karaoke-lyric-view.js — preserved application behaviour and compatibility support.
 * Original notices and functionality retained below. See FUNCTIONS.txt.
 */
(() => {
  const $ = id => document.getElementById(id);

  let song = null;
  let speed = 1;
  let scrolling = false;
  let frame = null;
  let unsubscribeSong = null;
  let currentControlSongId = "";
  let currentControlReloadToken = "";
  let loadingSequence = 0;
  let loadingTimer = null;
  let guidanceMode = localStorage.getItem("karaokeGuidanceMode") || "normal";
  let scrollThumbDragging = false;
  let scrollThumbStartY = 0;
  let scrollStartY = 0;
  let hostSingerSync = null;
  let hostSyncFrame = null;
  let lastHostSyncActiveSource = null;
  let finishedTimer = null;

  const SINGER_BACKGROUND_KEY = "ls26:karaokeSingerBackground";
  const SINGER_BOTTOM_BAR_KEY = "ls26:karaokeSingerBottomBar";
  const DEFAULT_SINGER_BACKGROUND = "#00131a";
  let singerBackground = DEFAULT_SINGER_BACKGROUND;
  let showBottomBar = true;

  /* ======================================================================
   * LIVE TV STATIC CANVAS — TEMPORAL NOISE ENGINE
   * Generates a completely new analogue-style static frame roughly 24 times
   * per second. This is intentionally JavaScript-driven rather than relying
   * on a moving background image, so the noise visibly changes on tablets.
   * ====================================================================== */
  let staticTimer = null;
  let staticContext = null;
  let staticImageData = null;
  let staticWidth = 0;
  let staticHeight = 0;
  let syncRollTimer = null;
  let glitchTimer = null;

  function scheduleStandbySyncRoll() {
    clearTimeout(syncRollTimer);
    syncRollTimer = setTimeout(() => {
      const noise = $("standbyView")?.querySelector(".standby-noise");
      if (noise && document.body.classList.contains("singer-standby-mode")) {
        noise.classList.add("standby-sync-roll");
        setTimeout(() => noise.classList.remove("standby-sync-roll"), 900);
      }
      scheduleStandbySyncRoll();
    }, 10000 + Math.random() * 10000);
  }

  function scheduleStandbyGlitch() {
    clearTimeout(glitchTimer);
    glitchTimer = setTimeout(() => {
      const noise = $("standbyView")?.querySelector(".standby-noise");
      if (noise && document.body.classList.contains("singer-standby-mode")) {
        noise.classList.add("standby-glitch-frame");
        setTimeout(() => noise.classList.remove("standby-glitch-frame"), 90);
      }
      scheduleStandbyGlitch();
    }, 15000 + Math.random() * 15000);
  }

  function resizeStaticCanvas() {
    const canvas = $("standbyStaticCanvas");
    if (!canvas) return false;

    // A low internal resolution looks more like genuine television snow and
    // is inexpensive enough to redraw continuously on older singer tablets.
    const aspect = Math.max(1, window.innerWidth / Math.max(1, window.innerHeight));
    staticHeight = 150;
    staticWidth = Math.max(220, Math.round(staticHeight * aspect));

    if (canvas.width !== staticWidth || canvas.height !== staticHeight) {
      canvas.width = staticWidth;
      canvas.height = staticHeight;
      staticContext = canvas.getContext("2d", { alpha: false });
      staticImageData = staticContext.createImageData(staticWidth, staticHeight);
      staticContext.imageSmoothingEnabled = false;
    }

    return !!staticContext;
  }

  function paintStaticFrame() {
    if (!document.body.classList.contains("singer-standby-mode")) return;
    if (!resizeStaticCanvas()) return;

    const pixels = staticImageData.data;
    const width = staticWidth;
    const height = staticHeight;
    const brightBandY = Math.floor(Math.random() * height);
    const darkBandY = Math.floor(Math.random() * height);
    const brightBandH = 2 + Math.floor(Math.random() * 9);
    const darkBandH = 3 + Math.floor(Math.random() * 12);
    const globalFlash = Math.random() < 0.08 ? 30 + Math.random() * 55 : 0;

    for (let y = 0; y < height; y += 1) {
      const inBrightBand = y >= brightBandY && y < brightBandY + brightBandH;
      const inDarkBand = y >= darkBandY && y < darkBandY + darkBandH;
      const lineBias = (Math.random() - 0.5) * 42;

      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        // Weighted mixture produces dense grey snow with occasional white and
        // black sparks rather than a flat, overly bright texture.
        const r = Math.random();
        let value;
        if (r < 0.045) value = 235 + Math.random() * 20;
        else if (r < 0.10) value = Math.random() * 28;
        else value = 45 + Math.random() * 150;

        value += lineBias + globalFlash;
        if (inBrightBand) value += 80;
        if (inDarkBand) value -= 75;
        value = Math.max(0, Math.min(255, value));

        pixels[i] = value;
        pixels[i + 1] = value;
        pixels[i + 2] = value;
        pixels[i + 3] = 255;
      }
    }

    staticContext.putImageData(staticImageData, 0, 0);

    // Add 1–4 horizontally shifted slices each frame to mimic signal tearing.
    const tears = 1 + Math.floor(Math.random() * 4);
    for (let i = 0; i < tears; i += 1) {
      const sourceY = Math.floor(Math.random() * (height - 10));
      const sliceH = 2 + Math.floor(Math.random() * 10);
      const shift = -22 + Math.floor(Math.random() * 45);
      staticContext.drawImage(
        staticContext.canvas,
        0, sourceY, width, sliceH,
        shift, sourceY, width, sliceH
      );
    }

    // A transient tracking line makes movement obvious even from a distance.
    if (Math.random() < 0.38) {
      const y = Math.floor(Math.random() * height);
      staticContext.fillStyle = `rgba(255,255,255,${0.18 + Math.random() * 0.26})`;
      staticContext.fillRect(0, y, width, 1 + Math.floor(Math.random() * 3));
    }
  }

  function initialiseLiveStatic() {
    if (staticTimer) clearInterval(staticTimer);
    resizeStaticCanvas();
    paintStaticFrame();

    // setInterval is used deliberately: some tablet browsers heavily throttle
    // requestAnimationFrame for visually subtle canvases.
    staticTimer = setInterval(paintStaticFrame, 42); // about 24 FPS
    scheduleStandbySyncRoll();
    scheduleStandbyGlitch();
    window.addEventListener("resize", resizeStaticCanvas);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) paintStaticFrame();
    });
  }

  function clearFinishedTimer() {
    if (finishedTimer) {
      clearTimeout(finishedTimer);
      finishedTimer = null;
    }
  }

  function normaliseSingerColour(value) {
    const clean = String(value || "").trim();
    return /^#[0-9a-f]{6}$/i.test(clean) ? clean.toLowerCase() : DEFAULT_SINGER_BACKGROUND;
  }

  function updateBottomBarVisibility() {
    const controls = $("singerControls");
    if (!controls) return;
    const visible =
      showBottomBar &&
      Boolean(song) &&
      document.body.classList.contains("singer-song-mode");
    controls.classList.toggle("hidden", !visible);
  }

  function applySingerPersonalisation() {
    try {
      singerBackground = normaliseSingerColour(
        localStorage.getItem(SINGER_BACKGROUND_KEY) || DEFAULT_SINGER_BACKGROUND
      );
      showBottomBar = localStorage.getItem(SINGER_BOTTOM_BAR_KEY) !== "false";
    } catch (_) {
      singerBackground = DEFAULT_SINGER_BACKGROUND;
      showBottomBar = true;
    }

    document.documentElement.style.setProperty("--singer-custom-background", singerBackground);

    const colourInput = $("singerBackgroundColor");
    const colourValue = $("singerBackgroundColorValue");
    const bottomToggle = $("singerShowBottomBar");
    if (colourInput) colourInput.value = singerBackground;
    if (colourValue) colourValue.textContent = singerBackground.toUpperCase();
    if (bottomToggle) bottomToggle.checked = showBottomBar;

    updateBottomBarVisibility();
  }

  async function requestSingerFullscreen() {
    if (document.fullscreenElement || !document.documentElement.requestFullscreen) return true;
    try {
      await document.documentElement.requestFullscreen({ navigationUI:"hide" });
      return true;
    } catch (_) {
      try {
        await document.documentElement.requestFullscreen();
        return true;
      } catch (_) {
        return false;
      }
    }
  }

  function initialiseFullscreenRequest() {
    // Browsers normally reject a fullscreen request without a user gesture,
    // but attempt it immediately for environments that permit it.
    void requestSingerFullscreen();

    const firstGesture = event => {
      if (event.target?.closest?.("#fullscreenSingerBtn")) return;
      if (!document.fullscreenElement) void requestSingerFullscreen();
      document.removeEventListener("pointerdown", firstGesture, true);
      document.removeEventListener("keydown", firstGesture, true);
    };

    document.addEventListener("pointerdown", firstGesture, true);
    document.addEventListener("keydown", firstGesture, true);
  }

  function hideSingerPrimaryViews() {
    $("standbyView")?.classList.add("hidden");
    $("autoSendIdleView")?.classList.add("hidden");
    $("songFinishedView")?.classList.add("hidden");
    $("songLoadingView")?.classList.add("hidden");
    $("singerLyrics")?.classList.add("hidden");
    $("singerControls")?.classList.add("hidden");
  }

  function clearSongSubscription() {
    if (unsubscribeSong) {
      unsubscribeSong();
      unsubscribeSong = null;
    }
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
    clearFinishedTimer();
    stopAutoScroll();
    song = null;

    document.body.classList.add("singer-standby-mode");
    document.body.classList.remove(
      "singer-loading-mode",
      "singer-song-mode",
      "singer-auto-send-off-mode",
      "singer-finished-mode"
    );

    hideSingerPrimaryViews();
    $("standbyView")?.classList.remove("hidden");

    $("singerTitle").textContent = "KARAOKE LYRIC VIEW";
    $("singerArtist").textContent = "Ready for the next singer";

    const standbyMessage = $("standbyView")?.querySelector("p");
    if (standbyMessage) standbyMessage.textContent = message;

    setSettingsEnabled(false);
    window.scrollTo(0, 0);
    requestAnimationFrame(updateCustomScrollbar);
  }

  function setAutoSendIdle() {
    loadingSequence += 1;
    clearLoadingTimer();
    clearFinishedTimer();
    stopAutoScroll();
    song = null;
    hostSingerSync = null;
    stopHostSyncFollower(true);

    document.body.classList.add("singer-auto-send-off-mode");
    document.body.classList.remove(
      "singer-standby-mode",
      "singer-loading-mode",
      "singer-song-mode",
      "singer-finished-mode"
    );

    hideSingerPrimaryViews();
    $("autoSendIdleView")?.classList.remove("hidden");
    $("singerTitle").textContent = "LIVE KARAOKE";
    $("singerArtist").textContent = "Waiting";
    setSettingsEnabled(false);
    window.scrollTo(0, 0);
    requestAnimationFrame(updateCustomScrollbar);
  }

  function setSongFinished(data = {}) {
    loadingSequence += 1;
    clearLoadingTimer();
    clearFinishedTimer();
    stopAutoScroll();
    song = null;
    hostSingerSync = null;
    stopHostSyncFollower(true);

    document.body.classList.add("singer-finished-mode");
    document.body.classList.remove(
      "singer-standby-mode",
      "singer-loading-mode",
      "singer-song-mode",
      "singer-auto-send-off-mode"
    );

    hideSingerPrimaryViews();
    $("songFinishedView")?.classList.remove("hidden");
    $("singerTitle").textContent = "SONG FINISHED";
    $("singerArtist").textContent = "";
    setSettingsEnabled(false);
    window.scrollTo(0, 0);

    const finishedAtMs =
      typeof data.finishedAt?.toMillis === "function"
        ? data.finishedAt.toMillis()
        : Date.now();
    const remaining = Math.max(0, 5000 - Math.max(0, Date.now() - finishedAtMs));

    const returnToIdle = () => {
      if (data.autoSendEnabled === false) setAutoSendIdle();
      else setStandby();
    };

    if (remaining <= 0) {
      returnToIdle();
      return;
    }

    finishedTimer = setTimeout(() => {
      finishedTimer = null;
      returnToIdle();
    }, remaining);

    requestAnimationFrame(updateCustomScrollbar);
  }

  function setLoadingState(nextSong) {
    clearFinishedTimer();
    stopAutoScroll();
    document.body.classList.remove(
      "singer-standby-mode",
      "singer-song-mode",
      "singer-auto-send-off-mode",
      "singer-finished-mode"
    );
    document.body.classList.add("singer-loading-mode");

    hideSingerPrimaryViews();
    $("songLoadingView")?.classList.remove("hidden");

    $("loadingSongTitle").textContent = nextSong.title || "Untitled Song";
    $("loadingSongArtist").textContent = ArtistNames.display(nextSong.artist) || "Unknown Artist";
    $("singerTitle").textContent = "CURRENTLY LOADING";
    $("singerArtist").textContent = `${nextSong.title || "Untitled Song"} — ${ArtistNames.display(nextSong.artist) || "Unknown Artist"}`;

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

  function singerSyncSections() {
    return [...document.querySelectorAll("#singerLyrics [data-source-index]")]
      .sort((a,b) => Number(a.dataset.sourceIndex) - Number(b.dataset.sourceIndex));
  }

  function singerSyncAnchorY() {
    const settings = window.LS26Settings?.get?.() || {};
    const percent = Math.max(25, Math.min(60, Number(settings.karaokeSingerActivePosition ?? 42)));
    const topbar = document.querySelector(".singer-topbar");
    const minimum = (topbar?.getBoundingClientRect().bottom || 0) + 24;
    return Math.max(minimum, window.innerHeight * (percent / 100));
  }

  function updateSingerSyncRunway() {
    const anchor = singerSyncAnchorY();
    const topbarHeight = document.querySelector(".singer-topbar")?.getBoundingClientRect().height || 0;
    const topRunway = Math.max(28, anchor - topbarHeight);
    const bottomRunway = Math.max(120, window.innerHeight - anchor + 120);
    document.documentElement.style.setProperty("--singer-sync-top-runway", `${Math.round(topRunway)}px`);
    document.documentElement.style.setProperty("--singer-sync-bottom-runway", `${Math.round(bottomRunway)}px`);
  }

  function setSingerManualControlsEnabled(enabled) {
    ["singerPlayBtn","singerSpeedDown","singerSpeedUp","singerMinusBtn","singerPlusBtn"]
      .forEach(id => {
        const el = $(id);
        if (el) el.disabled = !enabled;
      });
    if ($("singerAutoScroll")) $("singerAutoScroll").disabled = !enabled;
  }

  function stopHostSyncFollower(clearFocus = true) {
    if (hostSyncFrame) {
      cancelAnimationFrame(hostSyncFrame);
      hostSyncFrame = null;
    }
    document.body.classList.remove("host-singer-sync-active");
    lastHostSyncActiveSource = null;
    setSingerManualControlsEnabled(true);

    if (clearFocus) {
      singerSyncSections().forEach(el => {
        el.style.opacity = "";
        el.classList.remove("current-section");
      });
    }
  }

  function resolveSingerSyncSection(sync, sections) {
    if (!sections.length) return null;
    const wanted = Number(sync?.activeSourceIndex);
    const exact = sections.find(el => Number(el.dataset.sourceIndex) === wanted);
    if (exact) return exact;

    // Host-only/tab sections may not exist on the singer screen. In that case
    // keep the nearest lyric section at or before the host's active section.
    return [...sections]
      .reverse()
      .find(el => Number(el.dataset.sourceIndex) <= wanted) || sections[0];
  }

  function applySingerSyncFocus(sync, sections, active) {
    if (!active) return;
    const activeSource = Number(active.dataset.sourceIndex);
    const requestedPrevious = Number(sync?.previousSourceIndex);
    const requestedNext = Number(sync?.nextSourceIndex);
    const previousVisible = [...sections]
      .reverse()
      .find(el => Number(el.dataset.sourceIndex) < activeSource);
    const nextVisible = sections.find(el => Number(el.dataset.sourceIndex) > activeSource);
    const previousSource = sections.some(el => Number(el.dataset.sourceIndex) === requestedPrevious)
      ? requestedPrevious
      : Number(previousVisible?.dataset?.sourceIndex);
    const nextSource = sections.some(el => Number(el.dataset.sourceIndex) === requestedNext)
      ? requestedNext
      : Number(nextVisible?.dataset?.sourceIndex);
    const past = Math.max(0, Math.min(1, Number(sync?.pastOpacity ?? .5)));
    const upcoming = Math.max(0, Math.min(1, Number(sync?.upcomingOpacity ?? .5)));
    const previousOpacity = Math.max(0, Math.min(1, Number(sync?.previousOpacity ?? past)));
    const activeOpacity = Math.max(0, Math.min(1, Number(sync?.activeOpacity ?? 1)));
    const nextOpacity = Math.max(0, Math.min(1, Number(sync?.nextOpacity ?? upcoming)));

    sections.forEach(el => {
      const source = Number(el.dataset.sourceIndex);
      let opacity = 1;

      if (source < activeSource) {
        opacity = source === previousSource ? previousOpacity : past;
      } else if (source === activeSource) {
        opacity = activeOpacity;
      } else {
        opacity = source === nextSource ? nextOpacity : upcoming;
      }

      el.style.opacity = String(opacity);
      el.classList.toggle("current-section", source === activeSource);
    });
  }

  function projectedSingerSyncProgress(sync) {
    const base = Math.max(0, Math.min(1, Number(sync?.sectionProgress) || 0));
    const rate = Math.max(0, Number(sync?.progressRatePerMs) || 0);
    const elapsed = Math.max(0, Math.min(3500, Date.now() - Number(sync?._receivedAt || Date.now())));
    return Math.max(0, Math.min(1, base + (rate * elapsed)));
  }

  function runHostSyncFollower() {
    if (hostSyncFrame) cancelAnimationFrame(hostSyncFrame);

    const tick = () => {
      const sync = hostSingerSync;
      if (!sync?.enabled || !song || (sync.songId && sync.songId !== song.firebaseId)) {
        hostSyncFrame = null;
        return;
      }

      updateSingerSyncRunway();
      const sections = singerSyncSections();
      const active = resolveSingerSyncSection(sync, sections);
      if (active) {
        const activeSource = Number(active.dataset.sourceIndex);
        const requestedNext = Number(sync.nextSourceIndex);
        const next =
          sections.find(el => Number(el.dataset.sourceIndex) === requestedNext) ||
          sections.find(el => Number(el.dataset.sourceIndex) > activeSource) ||
          null;

        const progress = projectedSingerSyncProgress(sync);
        const activeTop = active.getBoundingClientRect().top + window.scrollY;
        const nextTop = next
          ? next.getBoundingClientRect().top + window.scrollY
          : activeTop;
        const semanticTop = activeTop + ((nextTop - activeTop) * progress);
        const maxScroll = Math.max(
          0,
          Math.max(document.documentElement.scrollHeight, document.body.scrollHeight) - window.innerHeight
        );
        const targetY = Math.max(0, Math.min(maxScroll, semanticTop - singerSyncAnchorY()));
        const delta = targetY - window.scrollY;

        // At the exact moment a new host section becomes active, place its
        // singer copy directly on the configured reading line. Between section
        // changes, retain smooth interpolation so the screen never jitters.
        if (lastHostSyncActiveSource !== activeSource) {
          window.scrollTo(0, targetY);
          lastHostSyncActiveSource = activeSource;
        } else if (Math.abs(delta) > .25) {
          window.scrollBy(0, delta * .12);
        }
        applySingerSyncFocus(sync, sections, active);
      }

      if ($("singerAutoScroll")) $("singerAutoScroll").checked = Boolean(sync.playing);
      requestAnimationFrame(updateCustomScrollbar);
      hostSyncFrame = requestAnimationFrame(tick);
    };

    hostSyncFrame = requestAnimationFrame(tick);
  }

  function applyHostSingerSync(raw) {
    const sync = raw && typeof raw === "object" ? { ...raw, _receivedAt:Date.now() } : null;
    hostSingerSync = sync;

    if (!sync?.enabled) {
      stopHostSyncFollower(true);
      return;
    }

    // Host sync owns movement while enabled; the singer's local auto-scroll
    // controls are disabled so two scroll engines can never fight each other.
    stopAutoScroll();
    updateSingerSyncRunway();
    document.body.classList.add("host-singer-sync-active");
    setSingerManualControlsEnabled(false);
    if ($("singerAutoScroll")) $("singerAutoScroll").checked = Boolean(sync.playing);

    if (song) {
      const sections = singerSyncSections();
      const active = resolveSingerSyncSection(sync, sections);
      applySingerSyncFocus(sync, sections, active);
      runHostSyncFollower();
    }
  }

  function listenForHost() {
    db.collection("karaokeControl").doc("liveLyrics").onSnapshot(doc => {
      const data = doc.exists ? doc.data() : {};
      const id = String(
        data.currentLyricsSongId ||
        data.currentSongId ||
        data.songId ||
        ""
      ).trim();

      const reloadToken = String(data.forceReloadToken || "").trim();
      const displayState = String(data.displayState || "").trim().toLowerCase();

      if (displayState === "auto-send-off") {
        currentControlSongId = "";
        currentControlReloadToken = "";
        clearSongSubscription();
        setAutoSendIdle();
        return;
      }

      if (displayState === "finished") {
        currentControlSongId = "";
        currentControlReloadToken = "";
        clearSongSubscription();
        setSongFinished(data);
        return;
      }

      // Scroll/focus sync shares the existing liveLyrics realtime listener, so
      // enabling it does not add another Firestore subscription.
      applyHostSingerSync(data.singerSync);

      if (!id || displayState === "idle" || data.reset === true) {
        currentControlSongId = "";
        currentControlReloadToken = "";
        hostSingerSync = null;
        stopHostSyncFollower(true);
        clearSongSubscription();

        setStandby();
        return;
      }

      const sameSong = id === currentControlSongId && song?.firebaseId === id;
      const sameReload =
        !reloadToken ||
        reloadToken === currentControlReloadToken;

      // Ignore ordinary metadata updates for the already-displayed song,
      // but never ignore a fresh SEND TO KARAOKE action.
      if (sameSong && sameReload) return;

      currentControlSongId = id;
      currentControlReloadToken = reloadToken;

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
    clearFinishedTimer();
    document.body.classList.remove(
      "singer-standby-mode",
      "singer-loading-mode",
      "singer-auto-send-off-mode",
      "singer-finished-mode"
    );
    document.body.classList.add("singer-song-mode");

    hideSingerPrimaryViews();
    $("singerLyrics")?.classList.remove("hidden");
    updateBottomBarVisibility();

    $("singerTitle").textContent = song.title;
    $("singerArtist").textContent = ArtistNames.display(song.artist);
    setSettingsEnabled(true);

    const content = $("singerLyrics");
    content.innerHTML = "";

    (song.sections || []).forEach((section, sourceIndex) => {
      if (!LyricsCommon.sectionVisibleOnSingerScreen(section)) return;
      if (section.type === "separator") return;

      const html = LyricsCommon.singerHTMLFromSection(section);
      if (!html) return;

      if (section.type === "performanceNote" || section.type === "performance-note") {
        const cue = document.createElement("div");
        cue.className = "singer-performance-cue singer-sync-section";
        cue.dataset.sourceIndex = String(sourceIndex);
        cue.innerHTML = html;
        content.appendChild(cue);
        return;
      }

      const block = document.createElement("section");
      block.className = `singer-section singer-sync-section ${sectionGuidanceClass(section)} type-${String(section.title || section.type || "lyrics")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")}`;
      block.dataset.sourceIndex = String(sourceIndex);

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

    if (hostSingerSync?.enabled) {
      applyHostSingerSync(hostSingerSync);
    } else {
      stopHostSyncFollower(true);
    }

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
    if (!song || hostSingerSync?.enabled) return;

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
    : requestSingerFullscreen();

  $("singerBackgroundColor").oninput = event => {
    singerBackground = normaliseSingerColour(event.target.value);
    document.documentElement.style.setProperty("--singer-custom-background", singerBackground);
    if ($("singerBackgroundColorValue")) {
      $("singerBackgroundColorValue").textContent = singerBackground.toUpperCase();
    }
    try { localStorage.setItem(SINGER_BACKGROUND_KEY, singerBackground); } catch (_) {}
  };

  $("singerShowBottomBar").onchange = event => {
    showBottomBar = event.target.checked;
    try { localStorage.setItem(SINGER_BOTTOM_BAR_KEY, String(showBottomBar)); } catch (_) {}
    updateBottomBarVisibility();
  };

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
  applySingerPersonalisation();
  initialiseFullscreenRequest();
  initialiseLiveStatic();
  initialiseCustomScrollbar();
  setStandby();
  listenForHost();
})();
