/*
 * Scroll behavior for the shared FHS app navigation. It uses the document scroll
 * rather than a nested scroll container so it can be shared by all static pages.
 */
const nav = document.querySelector(".fhs-liquid-nav");
if (nav) {
  const mobile = window.matchMedia("(max-width: 900px)");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const threshold = 10;
  let lastY = window.scrollY;
  let idleTimer;

  const expand = () => nav.classList.remove("is-compact");
  const onScroll = () => {
    if (!mobile.matches || reducedMotion.matches) {
      expand();
      lastY = window.scrollY;
      return;
    }

    const y = window.scrollY;
    if (y > lastY + threshold && y > 40) nav.classList.add("is-compact");
    else if (y < lastY - threshold) expand();
    lastY = y;

    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(expand, 600);
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  nav.addEventListener("pointerenter", expand);
  nav.addEventListener("focusin", expand);

  const onPreferenceChange = () => {
    if (!mobile.matches || reducedMotion.matches) expand();
    lastY = window.scrollY;
  };
  if (typeof mobile.addEventListener === "function") mobile.addEventListener("change", onPreferenceChange);
  else mobile.addListener?.(onPreferenceChange);
  if (typeof reducedMotion.addEventListener === "function") reducedMotion.addEventListener("change", onPreferenceChange);
  else reducedMotion.addListener?.(onPreferenceChange);
}
