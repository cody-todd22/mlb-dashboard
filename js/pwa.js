/* Registers the service worker (sw.js) so the board can be installed and opens from its saved files.
 * Only on https (or localhost): browsers don't allow service workers anywhere else. */
(function () {
  'use strict';
  if (!('serviceWorker' in navigator)) return;
  var local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  if (location.protocol !== 'https:' && !local) return;
  window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { /* the board works without it */ }); });
})();
