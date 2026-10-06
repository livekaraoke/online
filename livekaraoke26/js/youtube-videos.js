/*
  Live Karaoke request app copy.

  This directory is independent from /billylee26/. It keeps the copied request
  experience but is permanently adapted to Live Karaoke data/settings/storage.
*/
window.BILLY_LEE_YOUTUBE_VIDEOS = [];

(() => {
  document.title = "Live Karaoke Requests";
  document.documentElement.classList.add("live-karaoke-request-embed");

  const style = document.createElement("style");
  style.textContent = `
    html.live-karaoke-request-embed,
    html.live-karaoke-request-embed body{
      background:transparent!important;
      min-height:100%!important;
    }
    html.live-karaoke-request-embed body>:not(dialog){
      display:none!important;
    }
    html.live-karaoke-request-embed dialog{
      visibility:visible!important;
    }
    html.live-karaoke-request-embed dialog::backdrop{
      background:transparent!important;
    }
    #requestDialog .song-action[data-live-karaoke-browse-only="1"]{
      min-width:118px!important;
      color:#aaa!important;
      border-color:rgba(255,43,43,.28)!important;
      background:#0b0b0b!important;
      cursor:not-allowed!important;
      font-size:10px!important;
      letter-spacing:.04em!important;
    }
  `;
  document.head.appendChild(style);

  if (!window.__liveKaraokeStorageMapped) {
    window.__liveKaraokeStorageMapped = true;
    const proto = window.Storage?.prototype;
    if (proto) {
      const get = proto.getItem;
      const set = proto.setItem;
      const remove = proto.removeItem;
      const mapKey = key => {
        const value = String(key ?? "");
        return value.startsWith("billylee26.") ? `livekaraoke.${value.slice("billylee26.".length)}` : value;
      };
      proto.getItem = function(key){ return get.call(this, mapKey(key)); };
      proto.setItem = function(key,value){ return set.call(this, mapKey(key), value); };
      proto.removeItem = function(key){ return remove.call(this, mapKey(key)); };
    }
  }

  const realDb = window.BillyLeeDB;
  if (realDb && !window.__liveKaraokeDbMapped) {
    window.__liveKaraokeDbMapped = true;
    let liveKaraokeSessionActive = false;
    let liveStateResolved = false;
    let liveStatePromise = null;

    const bindValue = (target, prop) => {
      const value = target[prop];
      return typeof value === "function" ? value.bind(target) : value;
    };

    const sessionIdFrom = data => String(data?.sessionId || data?.activeSessionId || "").trim();
    const sessionTypeFrom = data => String(
      data?.sessionType || data?.type || data?.eventSnapshot?.type || ""
    ).trim().toLowerCase();

    async function resolveLiveKaraokeSessionActive(force=false) {
      if (!force && liveStateResolved) return liveKaraokeSessionActive;
      if (!force && liveStatePromise) return liveStatePromise;

      liveStatePromise = (async () => {
        try {
          const controlSnap = await realDb.collection("karaokeControl").doc("currentSession").get();
          const control = controlSnap.exists ? (controlSnap.data() || {}) : {};
          const sessionId = sessionIdFrom(control);
          if (control.active !== true || !sessionId) {
            liveKaraokeSessionActive = false;
            liveStateResolved = true;
            return false;
          }

          let type = sessionTypeFrom(control);
          if (!type) {
            const sessionSnap = await realDb.collection("performanceSessions").doc(sessionId).get();
            type = sessionSnap.exists ? sessionTypeFrom(sessionSnap.data() || {}) : "";
          }

          liveKaraokeSessionActive = type === "live karaoke";
          liveStateResolved = true;
          return liveKaraokeSessionActive;
        } catch (error) {
          console.warn("Could not verify Live Karaoke session state", error);
          liveKaraokeSessionActive = false;
          liveStateResolved = true;
          return false;
        } finally {
          liveStatePromise = null;
        }
      })();

      return liveStatePromise;
    }

    function virtualPublicListSnapshot(original, settings) {
      const setlistId = String(settings?.defaultBrowseSetlistId || "").trim();
      if (!setlistId) return original;
      const originalData = original?.exists ? (original.data() || {}) : {};
      return {
        exists:true,
        id:original?.id || "publicSongList",
        ref:original?.ref,
        data:() => ({
          ...originalData,
          setlistId,
          setlistName:String(settings?.defaultBrowseSetlistName || originalData.setlistName || "").trim()
        })
      };
    }

    const wrapDocument = (ref, collectionName, documentId) => new Proxy(ref, {
      get(target, prop) {
        if (prop === "get" && collectionName === "karaokeControl" && documentId === "publicSongList") {
          return async () => {
            const original = await target.get();
            if (await resolveLiveKaraokeSessionActive()) return original;
            try {
              const settingsSnap = await realDb.collection("karaokeControl").doc("liveKaraokeWebsiteSettings").get();
              const settings = settingsSnap.exists ? (settingsSnap.data() || {}) : {};
              return virtualPublicListSnapshot(original, settings);
            } catch (error) {
              console.warn("Default Live Karaoke songbook setting unavailable", error);
              return original;
            }
          };
        }
        if (prop === "set" && collectionName === "publicSignupSessions") {
          return (data, options) => target.set({
            ...(data || {}),
            source: "live-karaoke-website",
            project: "Live Karaoke"
          }, options);
        }
        return bindValue(target, prop);
      }
    });

    const collection = name => {
      const ref = realDb.collection(name);
      return new Proxy(ref, {
        get(target, prop) {
          if (prop === "doc") {
            return id => {
              const mappedId = name === "karaokeControl" && id === "billyLeeWebsiteSettings"
                ? "liveKaraokeWebsiteSettings"
                : id;
              return wrapDocument(target.doc(mappedId), name, mappedId);
            };
          }
          if (prop === "add" && name === "publicSongRequests") {
            return data => target.add({
              ...(data || {}),
              requestType: "karaoke-song-request",
              project: "Live Karaoke",
              source: "live-karaoke-website"
            });
          }
          return bindValue(target, prop);
        }
      });
    };

    window.BillyLeeDB = new Proxy(realDb, {
      get(target, prop) {
        if (prop === "collection") return collection;
        return bindValue(target, prop);
      }
    });

    function setBrowseNotice() {
      const notice = document.getElementById("requestNotice");
      if (notice) notice.textContent = "Browsing only — song requests open when Live Karaoke is live.";
    }

    function applyRequestAvailability() {
      const live = liveKaraokeSessionActive === true;
      document.querySelectorAll("#requestDialog .song-action[data-song-id]").forEach(button => {
        if (!live) {
          if (button.dataset.liveKaraokeBrowseOnly === "1") return;
          if (button.disabled) return; // Preserve NOW PLAYING / ALREADY REQUESTED / ALREADY PLAYED states.
          button.dataset.liveKaraokeBrowseOnly = "1";
          button.dataset.liveKaraokeOriginalText = button.textContent || "＋";
          button.disabled = true;
          button.textContent = "REQUESTS CLOSED";
        } else if (button.dataset.liveKaraokeBrowseOnly === "1") {
          button.disabled = false;
          button.textContent = button.dataset.liveKaraokeOriginalText || "＋";
          delete button.dataset.liveKaraokeBrowseOnly;
          delete button.dataset.liveKaraokeOriginalText;
        }
      });
    }

    document.addEventListener("click", event => {
      const action = event.target.closest?.("#requestDialog .song-action[data-song-id]");
      if (!action || liveKaraokeSessionActive) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setBrowseNotice();
    }, true);

    const requestObserver = new MutationObserver(() => applyRequestAvailability());
    window.addEventListener("DOMContentLoaded", () => {
      requestObserver.observe(document.documentElement, {subtree:true,childList:true});
      void resolveLiveKaraokeSessionActive(true).then(() => {
        applyRequestAvailability();
        if (!liveKaraokeSessionActive) setBrowseNotice();
      });
    });

    realDb.collection("karaokeControl").doc("currentSession").onSnapshot(() => {
      liveStateResolved = false;
      void resolveLiveKaraokeSessionActive(true).then(() => applyRequestAvailability());
    }, () => {});

    realDb.collection("karaoke").doc("state").onSnapshot(snapshot => {
      const state = snapshot.exists ? (snapshot.data() || {}) : {};
      if (!(state.songsOverride && state.songsEnabled !== true)) return;
      void resolveLiveKaraokeSessionActive().then(live => {
        // Offline browsing remains available even when the live-session request switch is closed.
        if (!live) return;
        const dialog = document.getElementById("requestDialog");
        if (dialog?.open) dialog.close();
        else window.parent?.postMessage({ type: "live-karaoke-request-close" }, location.origin);
      });
    }, () => {});
  }

  window.addEventListener("DOMContentLoaded", () => {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      const dialog = document.getElementById("requestDialog");
      const trigger = document.getElementById("requestSongBtn");

      if (dialog && !dialog.dataset.liveKaraokeCloseBound) {
        dialog.dataset.liveKaraokeCloseBound = "1";
        dialog.addEventListener("close", () => {
          window.parent?.postMessage({ type: "live-karaoke-request-close" }, location.origin);
        });
      }

      if (dialog?.open) {
        window.parent?.postMessage({ type: "live-karaoke-request-ready" }, location.origin);
        clearInterval(timer);
        return;
      }

      if (trigger && trigger.disabled !== true && trigger.getAttribute("aria-disabled") !== "true") {
        trigger.click();
      }

      if (attempts >= 120) clearInterval(timer);
    }, 100);
  });
})();

(() => {
  const script = document.createElement("script");
  script.src = "js/request-ui-extras.js?v=20261006-favs-card-width";
  script.async = false;
  document.head.appendChild(script);
})();
