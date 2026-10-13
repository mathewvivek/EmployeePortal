(() => {
  const key = 'portal-api-theme';
  const nativeTheme = window.matchMedia('(prefers-color-scheme: dark)');
  let preference;
  try {
    const stored = localStorage.getItem(key);
    if (stored === 'light' || stored === 'dark') preference = stored;
  } catch { /* System appearance remains available without browser storage. */ }

  function applyTheme() {
    const theme = preference || (nativeTheme.matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
    const toggle = document.getElementById('api-theme-toggle');
    if (!toggle) return;
    const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to black theme';
    toggle.setAttribute('aria-label', label);
    toggle.setAttribute('title', label);
    toggle.setAttribute('aria-pressed', String(theme === 'dark'));
  }

  applyTheme();
  nativeTheme.addEventListener('change', applyTheme);
  window.addEventListener('storage', (event) => {
    if (event.key !== key && event.key !== null) return;
    preference = event.newValue === 'light' || event.newValue === 'dark' ? event.newValue : undefined;
    applyTheme();
  });
  document.addEventListener('DOMContentLoaded', () => {
    applyTheme();
    document.getElementById('api-theme-toggle')?.addEventListener('click', () => {
      preference = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(key, preference); } catch { /* Keep the choice for this page even if storage is blocked. */ }
      applyTheme();
    });
  }, { once: true });
})();
