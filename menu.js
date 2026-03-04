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
    } else {
      active = currentPath === target;
    }

    link.classList.toggle("active", active);
  });

  function openMenu() {
    sideMenu.classList.add("open");
    if (sideBackdrop) {
      sideBackdrop.classList.add("show");
    }
    document.body.classList.add("side-menu-open");
  }

  function closeMenu() {
    sideMenu.classList.remove("open");
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
