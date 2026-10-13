/* Shared Billy Lee / Live Karaoke public request lifecycle bridge. */
(() => {
  "use strict";

  const baseDb = window.BillyLeeDB;
  if (!baseDb || window.__publicRequestLifecycleInstalled) return;
  window.__publicRequestLifecycleInstalled = true;

  const isLiveKaraoke = document.documentElement.classList.contains("live-karaoke-request-standalone");
  const $ = id => document.getElementById(id);
  const terminalStatuses = new Set(["played","completed","finished","abandoned","left","deleted","deletedbyhost","declined","cancelled","rejected"]);
  const playedStatuses = new Set(["played","completed","finished"]);

  let gateState = {};
  let currentSession = {};
  let runOrder = [];
  let rawWebsiteSettings = {};
  const gateSubscribers = new Set();

  const bind = (target, prop) => {
    const value = target[prop];
    return typeof value === "function" ? value.bind(target) : value;
  };

  const gateHasExplicitValue = () => Object.prototype.hasOwnProperty.call(gateState, "songsEnabled");
  const realSessionActive = () => currentSession?.active === true && !!String(currentSession.sessionId || currentSession.activeSessionId || "").trim();
  const gateOpen = () => gateHasExplicitValue() ? gateState.songsEnabled === true : realSessionActive();
  const preSessionId = () => String(gateState.preSessionRequestSessionId || "").trim();
  const preSessionOpen = () => !realSessionActive() && gateOpen() && !!preSessionId();
  const billyTestMode = () => !isLiveKaraoke && !realSessionActive() && rawWebsiteSettings.enableLiveRequestTestMode === true;
  const canSubmit = () => gateOpen() || billyTestMode();
  const requestButtonText = () => String(rawWebsiteSettings.requestButtonText || (isLiveKaraoke ? "REQUEST / SIGN UP" : "REQUEST A SONG")).trim() || (isLiveKaraoke ? "REQUEST / SIGN UP" : "REQUEST A SONG");

  function syntheticSettingsSnapshot(snapshot) {
    const source = snapshot?.exists ? (snapshot.data() || {}) : {};
    rawWebsiteSettings = { ...source };
    const data = { ...source };
    if (preSessionOpen()) {
      data.enableLiveRequestTestMode = true;
      data.requestTestSessionId = preSessionId();
    }
    return {
      exists: snapshot?.exists !== false,
      id: snapshot?.id,
      ref: snapshot?.ref,
      data: () => data
    };
  }

  function normaliseObserver(next, error, complete) {
    if (typeof next === "function") return { next, error, complete };
    return {
      next: next?.next?.bind(next),
      error: next?.error?.bind(next),
      complete: next?.complete?.bind(next)
    };
  }

  function wrapSettingsDoc(ref) {
    return new Proxy(ref, {
      get(target, prop) {
        if (prop === "get") {
          return async () => syntheticSettingsSnapshot(await target.get());
        }
        if (prop === "onSnapshot") {
          return (next, error, complete) => {
            const observer = normaliseObserver(next, error, complete);
            let latest = null;
            const emit = () => {
              if (!latest || !observer.next) return;
              observer.next(syntheticSettingsSnapshot(latest));
              queueUiSync();
            };
            const unsubscribeSettings = target.onSnapshot(snapshot => {
              latest = snapshot;
              emit();
            }, observer.error, observer.complete);
            const onGate = () => emit();
            gateSubscribers.add(onGate);
            return () => {
              gateSubscribers.delete(onGate);
              unsubscribeSettings?.();
            };
          };
        }
        return bind(target, prop);
      }
    });
  }

  function transformReviewWrite(data) {
    const payload = { ...(data || {}) };
    if (payload.displayOptIn === false && (payload.review || payload.rating)) {
      payload.displayOptIn = true;
      payload.name = "";
    }
    return payload;
  }

  function transformRequestWrite(data) {
    const payload = { ...(data || {}) };
    const sid = String(payload.sessionId || "").trim();
    const preId = preSessionId();
    const preSessionRequest = !!preId && sid === preId && gateOpen();
    if (!canSubmit()) {
      return Promise.reject(new Error("Requests are closed."));
    }
    if (preSessionRequest) {
      payload.isTestSession = false;
      payload.requestTestMode = false;
    }
    return payload;
  }

  function wrapDocument(ref, collectionName, documentId) {
    if (collectionName === "karaokeControl" && (documentId === "billyLeeWebsiteSettings" || documentId === "liveKaraokeWebsiteSettings")) {
      return wrapSettingsDoc(ref);
    }
    if (collectionName === "websiteReviews") {
      return new Proxy(ref, {
        get(target, prop) {
          if (prop === "set") return (data, options) => target.set(transformReviewWrite(data), options);
          return bind(target, prop);
        }
      });
    }
    return ref;
  }

  function wrappedCollection(name) {
    const ref = baseDb.collection(name);
    return new Proxy(ref, {
      get(target, prop) {
        if (prop === "doc") {
          return id => wrapDocument(target.doc(id), name, id);
        }
        if (prop === "add" && name === "publicSongRequests") {
          return data => {
            const transformed = transformRequestWrite(data);
            return transformed instanceof Promise ? transformed : target.add(transformed);
          };
        }
        if (prop === "add" && name === "websiteReviews") {
          return data => target.add(transformReviewWrite(data));
        }
        return bind(target, prop);
      }
    });
  }

  window.BillyLeeDB = new Proxy(baseDb, {
    get(target, prop) {
      if (prop === "collection") return wrappedCollection;
      return bind(target, prop);
    }
  });

  function hasPlayedSong() {
    return runOrder.some(item => playedStatuses.has(String(item?.status || "").toLowerCase()));
  }

  function playingItem() {
    return runOrder.find(item => String(item?.status || "").toLowerCase() === "playing") || null;
  }

  function setPlayerStartingState() {
    const title = $("currentSongTitle");
    const label = $("liveStateLabel");
    if (!title || !label) return;

    title.classList.remove("request-starting-title");
    if (preSessionOpen()) {
      label.textContent = "STARTING SOON";
      label.classList.remove("is-test-mode", "is-playing");
      title.textContent = "- STARTING SOON -";
      title.classList.add("between-songs-title", "request-starting-title");
      if ($("currentSongArtist")) $("currentSongArtist").textContent = "Requests are open before the performance starts.";
      if ($("stateIcon")) $("stateIcon").textContent = "♪";
      return;
    }

    if (realSessionActive() && !playingItem() && !hasPlayedSong()) {
      label.textContent = "LIVE NOW";
      label.classList.remove("is-test-mode", "is-playing");
      title.textContent = "- STARTING -";
      title.classList.add("between-songs-title", "request-starting-title");
      if ($("currentSongArtist")) $("currentSongArtist").textContent = "The first song will start shortly.";
      if ($("stateIcon")) $("stateIcon").textContent = "♪";
    }
  }

  function setConfiguredButtonText() {
    const text = requestButtonText();
    const requestButton = $("requestSongBtn");
    const requestText = requestButton?.querySelector("span:last-child");
    if (requestText) requestText.textContent = `${text} →`;

    const watchButton = $("watchLiveBtn");
    if (watchButton && (realSessionActive() || preSessionOpen() || billyTestMode())) {
      const watchText = watchButton.querySelector("span:last-child");
      if (watchText) watchText.textContent = `${text} →`;
    }
  }

  function setHeroStartingStatus() {
    if (!preSessionOpen()) return;
    const hero = document.querySelector("#heroGigs .hero-gig");
    if (!hero) return;
    let status = hero.querySelector(".live-label");
    if (!status) {
      status = document.createElement("div");
      status.className = "live-label request-starting-soon-label";
      hero.prepend(status);
    }
    status.textContent = "STARTING SOON · REQUESTS OPEN";
    status.classList.add("request-starting-soon-label");
  }

  function setGateStatus() {
    const status = $("requestGateStatus");
    if (status) {
      const open = canSubmit();
      status.textContent = open ? "REQUESTS OPEN" : (isLiveKaraoke ? "REQUESTS CLOSED · BROWSE THE SONG LIST" : "REQUESTS CLOSED");
      status.classList.toggle("is-open", open);
      status.classList.toggle("is-closed", !open);
    }

    const requestButton = $("requestSongBtn");
    if (requestButton) requestButton.disabled = isLiveKaraoke ? false : !canSubmit();

    const sendButton = $("sendRequestBtn");
    if (sendButton) sendButton.disabled = !canSubmit();

    document.querySelectorAll("#requestDialog .song-action[data-song-id]").forEach(button => {
      if (!canSubmit()) {
        if (!button.disabled) {
          button.dataset.requestGateDisabled = "1";
          button.disabled = true;
        }
      } else if (button.dataset.requestGateDisabled === "1") {
        button.disabled = false;
        delete button.dataset.requestGateDisabled;
      }
    });

    if (!isLiveKaraoke && !canSubmit() && $("requestDialog")?.open) {
      $("requestDialog").close();
    }
  }

  function trackedRequestIds() {
    try {
      const ids = JSON.parse(localStorage.getItem("billylee26.requestIds") || "[]");
      return new Set(Array.isArray(ids) ? ids.map(String) : []);
    } catch {
      return new Set();
    }
  }

  function renderPublicQueue() {
    const box = $("requestPublicQueueList");
    if (!box) return;
    const own = trackedRequestIds();
    const next = runOrder.filter(item => {
      const status = String(item?.status || "queued").toLowerCase();
      return status !== "playing" && !terminalStatuses.has(status);
    }).slice(0, 5);

    if (!next.length) {
      box.innerHTML = '<p class="request-public-queue-empty">No songs are queued yet.</p>';
      return;
    }

    const esc = value => String(value ?? "").replace(/[&<>\"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[char]));
    box.innerHTML = next.map((item, index) => {
      const yours = item?.requestId && own.has(String(item.requestId));
      return `<div class="request-public-queue-row${yours ? " is-own-request" : ""}">
        <span class="request-public-queue-position">${index + 1}</span>
        <span class="request-public-queue-song"><strong>${esc(item.songTitle || item.title || "Song")}</strong><small>${esc(item.artist || item.songArtist || "")}</small></span>
        ${yours ? '<em>YOUR REQUEST</em>' : ''}
      </div>`;
    }).join("");
  }

  function correctReviewStatusCopy() {
    if (!$("requestReviewPrivate")?.checked) return;
    const status = $("requestProfileStatus");
    if (status && /private review saved/i.test(status.textContent || "")) {
      status.textContent = "Profile and anonymous review saved.";
    }
  }

  function syncUi() {
    setConfiguredButtonText();
    setGateStatus();
    setPlayerStartingState();
    setHeroStartingStatus();
    renderPublicQueue();
    correctReviewStatusCopy();
  }

  let syncQueued = false;
  function queueUiSync() {
    if (syncQueued) return;
    syncQueued = true;
    setTimeout(() => {
      syncQueued = false;
      syncUi();
    }, 0);
  }

  const gateUnsub = baseDb.collection("karaoke").doc("state").onSnapshot(snapshot => {
    gateState = snapshot.exists ? (snapshot.data() || {}) : {};
    gateSubscribers.forEach(callback => callback());
    queueUiSync();
  }, error => console.warn("Public request gate unavailable", error));

  const currentUnsub = baseDb.collection("karaokeControl").doc("currentSession").onSnapshot(snapshot => {
    currentSession = snapshot.exists ? (snapshot.data() || {}) : {};
    queueUiSync();
  }, error => console.warn("Current public session unavailable", error));

  const runUnsub = baseDb.collection("karaokeControl").doc("runOrder").onSnapshot(snapshot => {
    const data = snapshot.exists ? (snapshot.data() || {}) : {};
    runOrder = Array.isArray(data.items) ? data.items : [];
    queueUiSync();
  }, error => console.warn("Public run order unavailable", error));

  document.addEventListener("click", event => {
    const requestAction = event.target.closest?.("#requestDialog .song-action[data-song-id], #sendRequestBtn");
    if (requestAction && !canSubmit()) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const notice = $("requestNotice");
      if (notice) notice.textContent = "Requests are closed right now. You can still browse the song list.";
      queueUiSync();
      return;
    }

    if (!isLiveKaraoke && event.target.closest?.("#requestSongBtn") && !canSubmit()) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return;
    }

    if (event.target.closest?.("#continueRequestBtn")) {
      setTimeout(correctReviewStatusCopy, 700);
    }

    if (event.target.closest?.("#requestDialog [data-request-tab], #requestDialog [data-song-category], #requestDialog [data-alpha-jump], #clearSongCategoryBtn")) {
      queueUiSync();
    }
  }, true);

  document.addEventListener("input", event => {
    if (event.target?.id === "songSearch") queueUiSync();
  }, true);

  window.addEventListener("pagehide", () => {
    gateUnsub?.();
    currentUnsub?.();
    runUnsub?.();
  }, { once:true });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", queueUiSync, { once:true });
  } else {
    queueUiSync();
  }
})();