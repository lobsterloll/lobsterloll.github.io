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