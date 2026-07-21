// Installed-app plumbing for the player surfaces: registers the offline
// keeper (see public/pwa/sw.js, served as /sw.js for root scope) and adds a
// faint haptic tick under the finger where the platform offers one (Android;
// iOS does not expose vibration to the web). Safe to load from embeds —
// re-registration of the same worker is a no-op.

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {
    // Offline support is a comfort, never a requirement; the page works without it.
  });
}

if (navigator.vibrate && window.matchMedia("(pointer: coarse)").matches) {
  addEventListener(
    "pointerdown",
    (e) => {
      if (e.pointerType !== "touch") return;
      if (e.target.closest("button, [role='button'], a, summary")) navigator.vibrate(8);
    },
    { capture: true, passive: true }
  );
}
