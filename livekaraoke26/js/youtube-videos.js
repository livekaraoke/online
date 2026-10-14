/*
  Live Karaoke request app copy.

  This directory is independent from /billylee26/. It keeps the copied request
  experience but is permanently adapted to Live Karaoke data/settings/storage.
*/
window.BILLY_LEE_YOUTUBE_VIDEOS = [];

(() => {
  document.title = "Live Karaoke Requests";
  document.documentElement.classList.add("live-karaoke-request-embed");
  window.__liveKaraokeBrowseSettingsReady = false;

  // The copied Billy request app still contains one native active-session alert.
  // Live Karaoke is intentionally browseable while requests are closed, so never
  // surface that legacy browser popup. The open timer below retries only after the
  // synthetic browse settings have reached app.js.
  if (!window.__liveKaraokeLegacyAlertGuardInstalled) {
    window.__liveKaraokeLegacyAlertGuardInstalled = true;
    const nativeAlert = typeof window.alert === "function" ? window.alert.bind(window) : null;
    window.alert = message => {
      if (String(message || "").trim() === "Song requests are only available during an active session.") return;
      nativeAlert?.(message);
    };
  }

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
      const originalData = original?.exists ? (original.data() || {}) : {};
      const setlistId = String(settings?.defaultBrowseSetlistId || "").trim();
      return {
        exists:true,
        id:original?.id || "publicSongList",
        ref:original?.ref,
        data:() => ({
          ...originalData,
          // Off-session browsing must never inherit a stale/empty session setlist.
          // A dedicated browse setlist can still be configured later; otherwise
          // app.js receives an empty setlistId and falls back to all public songs.
          setlistId,
          setlistName:setlistId
            ? String(settings?.defaultBrowseSetlistName || originalData.setlistName || "").trim()
            : ""
        })
      };
    }

    // The copied Billy request app normally requires a session before opening.
    // Live Karaoke keeps an offline browse-only preview available; the shared
    // lifecycle bridge below separately enforces the real request gate.
    function virtualWebsiteSettingsSnapshot(original) {
      const originalData = original?.exists ? (original.data() || {}) : {};
      window.__liveKaraokeBrowseSettingsReady = true;
      return {
        exists:true,
        id:original?.id || "liveKaraokeWebsiteSettings",
        ref:original?.ref,
        data:() => ({
          ...originalData,
          enableLiveRequestTestMode:true,
          requestTestSessionId:String(originalData.requestTestSessionId || "live-karaoke-browse-preview")
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
              return virtualPublicListSnapshot(original, {});
            }
          };
        }
        if (collectionName === "karaokeControl" && documentId === "liveKaraokeWebsiteSettings") {
          if (prop === "get") return async () => virtualWebsiteSettingsSnapshot(await target.get());
          if (prop === "onSnapshot") {
            return (next, error, complete) => target.onSnapshot(
              snapshot => {
                if (typeof next === "function") next(virtualWebsiteSettingsSnapshot(snapshot));
                else if (next?.next) next.next(virtualWebsiteSettingsSnapshot(snapshot));
              },
              typeof next === "function" ? error : next?.error,
              typeof next === "function" ? complete : next?.complete
            );
          }
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

    // Only invalidate the offline-songbook cache here. Request availability is
    // handled by /js/public-request-lifecycle.js with no MutationObserver.
    realDb.collection("karaokeControl").doc("currentSession").onSnapshot(() => {
      liveStateResolved = false;
      void resolveLiveKaraokeSessionActive(true);
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

      if (
        window.__liveKaraokeBrowseSettingsReady === true &&
        trigger &&
        trigger.disabled !== true &&
        trigger.getAttribute("aria-disabled") !== "true"
      ) {
        trigger.click();
      }
      if (attempts >= 120) clearInterval(timer);
    }, 100);
  });
})();

// Must load before app.js so pre-session request IDs and the real open/closed
// request gate are visible to the copied request application from first render.
document.write('<script src="../js/public-request-lifecycle.js?v=20261013-request-lifecycle-v2"><\/script>');

(() => {
  const script = document.createElement("script");
  script.src = "js/request-ui-extras.js?v=20261006-favs-card-width";
  script.async = false;
  document.head.appendChild(script);
})();