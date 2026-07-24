// MV3 requires a background service worker. In v0.1 ConCon has no
// background logic — everything runs in the content script's isolated
// world, per-tab, with no cross-tab coordination. This file exists so
// the manifest is valid and so any future background needs have a home.

self.addEventListener('install', () => {
  // no-op
});

self.addEventListener('activate', () => {
  // no-op
});
