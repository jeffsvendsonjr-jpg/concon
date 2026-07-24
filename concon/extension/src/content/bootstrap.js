/* global chrome */
// ConCon content script bootstrap.
//
// This is the only file loaded via manifest content_scripts. It exists to
// bridge Chrome MV3 content scripts (which do not natively support ES module
// syntax in the top-level content_scripts entry) into the rest of the ESM
// codebase via a single dynamic import.
//
// Everything downstream of this file uses standard ES modules with relative
// imports so the same source runs unchanged in the dev harness.

(async () => {
  try {
    const mountUrl = chrome.runtime.getURL('src/content/mount.js');
    const mod = await import(mountUrl);
    if (typeof mod.mount === 'function') {
      mod.mount();
    } else {
      console.error('[ConCon] mount.js loaded but did not export mount()');
    }
  } catch (err) {
    console.error('[ConCon] bootstrap failed:', err);
  }
})();
