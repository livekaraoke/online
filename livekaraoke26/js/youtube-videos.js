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

    const bindValue = (target, prop) => {
      const value = target[prop];
      return typeof value === "function" ? value.bind(target) : value;
    };

    const wrapDocument = (ref, collectionName) => new Proxy(ref, {
      get(target, prop) {
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
              return wrapDocument(target.doc(mappedId), name);
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

    realDb.collection("karaoke").doc("state").onSnapshot(snapshot => {
      const state = snapshot.exists ? (snapshot.data() || {}) : {};
      if (state.songsOverride && state.songsEnabled !== true) {
        const dialog = document.getElementById("requestDialog");
        if (dialog?.open) dialog.close();
        else window.parent?.postMessage({ type: "live-karaoke-request-close" }, location.origin);
      }
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
