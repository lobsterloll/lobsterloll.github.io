// Change the address without reloading the page or filling browser history.
(() => {
  if (!['http:', 'https:'].includes(window.location.protocol)) return;
  if (!/^\/(?:index\.html|[a-z]{20,64})?$/.test(window.location.pathname)) return;

  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  let retryAfter = 0;
  function changePath(now) {
    const bytes = window.crypto.getRandomValues(new Uint8Array(24));
    const path = Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('');
    try {
      window.history.replaceState(window.history.state, '',
        `/${path}${window.location.search}${window.location.hash}`);
    } catch (error) {
      if (error.name !== 'SecurityError') throw error;
      // Give the browser time to recover when its history-update limit is hit.
      retryAfter = now + 1000;
    }
  }

  function updateAddress(now) {
    if (!document.hidden && now >= retryAfter) changePath(now);
    window.requestAnimationFrame(updateAddress);
  }

  window.requestAnimationFrame(updateAddress);
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
