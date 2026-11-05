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


// Filtering enhances the complete download list; all projects work without JS.
(() => {
  const tools = document.querySelector('.catalog-tools');
  const search = document.querySelector('#project-search');
  const projects = Array.from(document.querySelectorAll('.project'));
  const buttons = Array.from(document.querySelectorAll('[data-filter]'));
  const count = document.querySelector('#result-count');
  const empty = document.querySelector('.empty-state');
  let category = 'all';

  function filterProjects() {
    const query = search.value.trim().toLowerCase();
    let visible = 0;
    for (const project of projects) {
      const matchesCategory = category === 'all' || project.dataset.category === category;
      project.hidden = !matchesCategory || !project.textContent.toLowerCase().includes(query);
      if (!project.hidden) visible++;
    }
    count.textContent = `${visible} ${visible === 1 ? 'project' : 'projects'} to explore`;
    empty.hidden = visible !== 0;
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.filter === category));
  }

  if (!tools || !search) return;
  tools.hidden = false;
  search.addEventListener('input', filterProjects);
  for (const button of buttons) button.addEventListener('click', () => {
    category = button.dataset.filter;
    filterProjects();
  });
  document.querySelector('#reset-search').addEventListener('click', () => {
    category = 'all';
    search.value = '';
    filterProjects();
    search.focus();
  });
})();
