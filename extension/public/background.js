// MV3 service worker. Its only job is to make the toolbar icon open the
// side panel directly, instead of the browser's default popup-less no-op.
// Re-set on every service-worker wake (install, update, browser start) —
// setPanelBehavior itself is idempotent and this is the documented pattern.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('de-pseudo: could not set side panel behavior', error));
