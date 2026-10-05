/*
  Billy Lee YouTube video list.

  Paste each YouTube video URL into `url` below. The website automatically:
  - extracts the video ID
  - loads the thumbnail from YouTube
  - opens the video inside the Billy Lee website

  The embedded player is sandboxed and has no clickable YouTube controls, links,
  channel/account navigation, or popup/top-navigation permissions.

  You can add/remove/reorder entries freely.
*/
window.BILLY_LEE_YOUTUBE_VIDEOS = [
  {
    url: "https://www.youtube.com/watch?v=T4z0bFzz_Gc?si=xAmZKTeNHvfMv_sa",
    title: "Live Acoustic Cover",
    duration: "3:49"
  },
  {
    url: "",
    title: "Live Looping Medley",
    duration: ""
  },
  {
    url: "",
    title: "One Guitar. Countless Sounds.",
    duration: ""
  },
  {
    url: "",
    title: "Live Loop Performance",
    duration: ""
  }
];

/*
  Live Karaoke embed mode reuses the BillyLee26 request UI verbatim while
  keeping its data/settings/profile namespace separate. This runs before
  app.js, so app.js sees the adapted Firestore and localStorage interfaces.
*/
(() => {
  const liveKaraokeMode = new URLSearchParams(location.search).get("liveKaraokeMode") === "1";
  if (!liveKaraokeMode) return;

  document.documentElement.classList.add("live-karaoke-request-embed");

  const style = document.createElement("style");
  style.textContent = `
    html.live-karaoke-request-embed,
    html.live-karaoke-request-embed body{background:transparent!important;min-height:100%!important}
    html.live-karaoke-request-embed body>:not(dialog){visibility:hidden!important}
    html.live-karaoke-request-embed dialog{visibility:visible!important}
  `;
  document.head.appendChild(style);

  // Give Live Karaoke its own saved profile/favourites while preserving the
  // exact BillyLee26 request code and UI.
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

  // Map only the Billy website-settings document and request source metadata.
  // All session/public-list/run-order paths remain the real shared LiveSuite
  // paths, so the popup follows the active Live Karaoke session.
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
  }

  // Open the exact existing request dialog once BillyLee26 has initialised,
  // then tell the parent landing page when its X/Escape closes it.
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

// Request popup enhancements are kept in a dedicated module and loaded here so
// existing page markup stays unchanged.
(() => {
  const script = document.createElement("script");
  script.src = "js/request-ui-extras.js?v=20261006-favs-card-width";
  script.async = false;
  document.head.appendChild(script);
})();
