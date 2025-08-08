// Thin loader for the relocated Dev Tool.
// The full script now lives at tests/dev-tools/json-compatibility-checker.js
// This wrapper keeps old links working while avoiding duplicate logic.
(function(){
  const url = 'tests/dev-tools/json-compatibility-checker.js';
  console.warn('[Dev Tools] json-compatibility-checker.js has moved to', url);
  const s = document.createElement('script');
  s.src = url;
  s.onload = () => {
    console.log('[Dev Tools] JSON Compatibility Checker loaded.');
    // Preserve old behavior: run the checker if available
    if (typeof window.testExistingJSONFiles === 'function') {
      try {
        window.testExistingJSONFiles();
      } catch (e) {
        console.warn('[Dev Tools] testExistingJSONFiles failed:', e?.message || e);
      }
    }
  };
  s.onerror = () => console.warn('[Dev Tools] Failed to load JSON Compatibility Checker from', url);
  document.head.appendChild(s);
})();
