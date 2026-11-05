/* Classic (non-module) script: applies saved theme/language before first paint to avoid a flash. */
(function () {
  var root = document.documentElement;
  try {
    var t = localStorage.getItem('icf-theme');
    root.setAttribute('data-theme', t === 'light' ? 'light' : 'dark');
    var l = localStorage.getItem('icf-lang') || 'en';
    root.lang = l;
    root.dir = l === 'ar' ? 'rtl' : 'ltr';
  } catch (e) { root.setAttribute('data-theme', 'dark'); }
})();
