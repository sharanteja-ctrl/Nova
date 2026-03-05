(() => {
  const sideMenu = document.getElementById("sideMenu");
  const sideToggleBtn = document.getElementById("sideToggleBtn");
  const sideCloseBtn = document.getElementById("sideCloseBtn");
  const sideBackdrop = document.getElementById("sideBackdrop");

  if (!sideMenu) {
    return;
  }

  const menuLinks = sideMenu.querySelectorAll(".side-link");

  function normalizePath(value) {
    const raw = String(value || "/").toLowerCase().split("?")[0].split("#")[0];
    const stripped = raw.replace(/\/+$/, "");
    return stripped || "/";
  }

  const currentPath = normalizePath(window.location.pathname);
  menuLinks.forEach((link) => {
    const href = link.getAttribute("href") || "/";
    const target = normalizePath(href);
    let active = false;

    if (target === "/" || target === "/index.html") {
      active = currentPath === "/" || currentPath === "/index.html";
    } else if (target === "/split" || target === "/split.html") {
      active = currentPath === "/split" || currentPath === "/split.html";
    } else if (
      target === "/pdf-chat" ||
      target === "/pdf-chat.html" ||
      target === "/knowledge-map-chat" ||
      target === "/knowledge-map-chat.html"
    ) {
      active =
        currentPath === "/pdf-chat" ||
        currentPath === "/pdf-chat.html" ||
        currentPath === "/knowledge-map-chat" ||
        currentPath === "/knowledge-map-chat.html";
    } else {
      active = currentPath === target;
    }

    link.classList.toggle("active", active);
  });

  function openMenu() {
    sideMenu.classList.add("open");
    sideMenu.setAttribute("aria-hidden", "false");
    if (sideToggleBtn) {
      sideToggleBtn.setAttribute("aria-expanded", "true");
    }
    if (sideBackdrop) {
      sideBackdrop.classList.add("show");
    }
    document.body.classList.add("side-menu-open");
  }

  function closeMenu() {
    sideMenu.classList.remove("open");
    sideMenu.setAttribute("aria-hidden", "true");
    if (sideToggleBtn) {
      sideToggleBtn.setAttribute("aria-expanded", "false");
    }
    if (sideBackdrop) {
      sideBackdrop.classList.remove("show");
    }
    document.body.classList.remove("side-menu-open");
  }

  if (sideToggleBtn) {
    sideToggleBtn.addEventListener("click", openMenu);
  }
  if (sideCloseBtn) {
    sideCloseBtn.addEventListener("click", closeMenu);
  }
  if (sideBackdrop) {
    sideBackdrop.addEventListener("click", closeMenu);
  }

  menuLinks.forEach((link) => {
    link.addEventListener("click", closeMenu);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
    }
  });
})();
