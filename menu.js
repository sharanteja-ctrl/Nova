(() => {
  const sideMenu = document.getElementById("sideMenu");
  const sideToggleBtn = document.getElementById("sideToggleBtn");
  const sideCloseBtn = document.getElementById("sideCloseBtn");
  const sideBackdrop = document.getElementById("sideBackdrop");

  if (!sideMenu) {
    return;
  }

  const menuLinks = sideMenu.querySelectorAll(".side-link");
  const currentPath = window.location.pathname.toLowerCase();
  menuLinks.forEach((link) => {
    const href = link.getAttribute("href") || "";
    const normalized = href.toLowerCase();
    const isHome =
      (currentPath === "/" || currentPath.endsWith("/index.html")) &&
      (normalized === "/" || normalized.endsWith("/index.html"));
    const isExact = normalized !== "/" && currentPath.endsWith(normalized);
    link.classList.toggle("active", isHome || isExact);
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
