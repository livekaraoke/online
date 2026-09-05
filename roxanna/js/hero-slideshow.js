(() => {
  "use strict";

  const folder = "assets/herophotos/";
  const fallback = "assets/hero-band-photo.png";

  // Change these values if you want a faster/slower slideshow.
  const HOLD_MS = 6500;
  const FADE_MS = 1600;

  const configured = Array.isArray(window.ROXANNA_HERO_PHOTOS)
    ? window.ROXANNA_HERO_PHOTOS
        .map(name => String(name || "").trim())
        .filter(Boolean)
    : [];

  const photos = configured.map(name => {
    if (/^(https?:)?\/\//i.test(name) || name.startsWith("/") || name.startsWith("assets/")) {
      return name;
    }
    return folder + name;
  });

  const slideA = document.getElementById("heroSlideA");
  const slideB = document.getElementById("heroSlideB");
  if (!slideA || !slideB) return;

  let usablePhotos = [];
  let currentIndex = 0;
  let active = slideA;
  let standby = slideB;
  let timer = null;

  function preload(src) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(src);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  function schedule() {
    clearTimeout(timer);
    if (usablePhotos.length < 2 || document.hidden) return;
    timer = setTimeout(showNext, HOLD_MS);
  }

  function showNext() {
    if (usablePhotos.length < 2) return;

    currentIndex = (currentIndex + 1) % usablePhotos.length;
    standby.src = usablePhotos[currentIndex];

    // Force the newly loaded layer to start transparent, then cross-fade.
    standby.classList.remove("is-active");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        standby.classList.add("is-active");
        active.classList.remove("is-active");

        const oldActive = active;
        active = standby;
        standby = oldActive;

        // Clear the hidden layer after the fade to avoid unnecessary image memory.
        setTimeout(() => {
          if (!standby.classList.contains("is-active")) standby.src = "";
        }, FADE_MS + 100);

        schedule();
      });
    });
  }

  async function init() {
    const requested = photos.length ? photos : [fallback];
    const tested = await Promise.all(requested.map(preload));
    usablePhotos = tested.filter(Boolean);

    if (!usablePhotos.length) {
      usablePhotos = [fallback];
    }

    slideA.src = usablePhotos[0];
    slideA.classList.add("is-active");
    slideB.classList.remove("is-active");

    schedule();
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearTimeout(timer);
    } else {
      schedule();
    }
  });

  init();
})();