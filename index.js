// Change the address without reloading the page or filling browser history.
(() => {
  if (!['http:', 'https:'].includes(window.location.protocol)) return;
  if (!/^\/(?:index\.html|[a-z]{20,64})?$/.test(window.location.pathname)) return;

  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  const userAgent = window.navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(userAgent)
    || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
  // Leave headroom under each engine's history-update quota.
  let interval = !isIOS && /Chrome\/|Chromium\/|Edg\/|OPR\//.test(userAgent)
    ? 60 : !isIOS && /Firefox\//.test(userAgent) ? 110 : 350;
  function changePath() {
    const bytes = window.crypto.getRandomValues(new Uint8Array(24));
    const path = Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('');
    let changed = false;
    try {
      window.history.replaceState(window.history.state, '',
        `/${path}${window.location.search}${window.location.hash}`);
      changed = window.location.pathname === `/${path}`;
    } catch (error) {
      if (error.name !== 'SecurityError') throw error;
    }
    // Chromium can silently ignore an update instead of throwing an error.
    if (!changed) interval = Math.min(Math.max(interval * 2, 350), 1000);
  }

  function updateAddress() {
    if (!document.hidden) changePath();
    window.setTimeout(updateAddress, interval);
  }

  updateAddress();
})();

 const pageLoader = document.querySelector(".page-loader");
    const lobster = pageLoader.querySelector(".page-loader__lobster");
    let pageLoaded = document.readyState === "complete";
    let lobsterFilled = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function revealPageWhenReady() {
      if (pageLoaded && lobsterFilled) {
        pageLoader.classList.add("is-revealing");
      }
    }

    lobster.addEventListener("animationend", (event) => {
      if (event.animationName === "lobster-fill") {
        lobsterFilled = true;
        revealPageWhenReady();
      }
    });

    window.addEventListener("load", () => {
      pageLoaded = true;
      revealPageWhenReady();
    }, { once: true });

    revealPageWhenReady();
