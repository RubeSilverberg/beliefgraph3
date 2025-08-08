// Thin loader for the relocated Dev Tool.
// The full script now lives at tests/dev-tools/autonomous-bug-hunter.js
// This wrapper keeps old links working while avoiding duplicate logic.
(function(){
    const url = 'tests/dev-tools/autonomous-bug-hunter.js';
    console.warn('[Dev Tools] autonomous-bug-hunter.js has moved to', url);
    const s = document.createElement('script');
    s.src = url;
    s.onload = () => console.log('[Dev Tools] Autonomous Bug Hunter loaded.');
    s.onerror = () => console.warn('[Dev Tools] Failed to load Autonomous Bug Hunter from', url);
    document.head.appendChild(s);
})();
