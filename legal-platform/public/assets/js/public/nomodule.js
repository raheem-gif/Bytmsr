// v9.2: no ES modules here: hide the spinner, show the contact card
(function () {
  var d = document, s = d.querySelector('.bmf-loading'), f = d.querySelector('[data-fallback]');
  if (s) s.parentNode.removeChild(s);
  if (f) f.removeAttribute('hidden');
})();
