/* Centralised UI strings. English is the only complete dictionary in this release (see README). */
const dict = {
  en: {
    'nav.home': 'Home', 'nav.browse': 'Browse Anime', 'nav.genres': 'Genres', 'nav.trending': 'Trending',
    'nav.newReleases': 'New Releases', 'nav.schedule': 'Schedule', 'nav.search': 'Search anime…',
    'nav.login': 'Log in', 'nav.register': 'Sign up', 'nav.dashboard': 'Dashboard', 'nav.admin': 'Admin panel',
    'nav.logout': 'Log out', 'nav.menu': 'Menu', 'nav.theme': 'Switch theme',
    'common.retry': 'Try again', 'common.loadMore': 'Load more', 'common.viewAll': 'View all',
    'footer.rights': 'ICF REFLEX is a streaming interface and content-management platform. It does not host video files. Only content the site owner is authorised to distribute or embed is listed.',
  },
};
export const LANGUAGES = [['en', 'English', true], ['ja', '日本語', false], ['bn', 'বাংলা', false], ['es', 'Español', false], ['fr', 'Français', false], ['pt', 'Português', false], ['ar', 'العربية', false]];
export const getLang = () => { try { return localStorage.getItem('icf-lang') || 'en'; } catch { return 'en'; } };
export const t = (key) => dict[getLang()]?.[key] ?? dict.en[key] ?? key;
export function setLang(code) {
  try { localStorage.setItem('icf-lang', code); } catch { /* storage unavailable */ }
  document.documentElement.lang = code;
  document.documentElement.dir = code === 'ar' ? 'rtl' : 'ltr';
}
