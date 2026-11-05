export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());
export const validatePassword = (v) => (String(v || '').length < 8 ? 'Use at least 8 characters.' : /\d/.test(v) && /[A-Za-z]/.test(v) ? '' : 'Include at least one letter and one number.');
export const validateName = (v) => { const s = String(v || '').trim(); return s.length < 2 ? 'Enter at least 2 characters.' : s.length > 40 ? 'Use 40 characters or fewer.' : ''; };
export const slugify = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
export const safeNext = (n) => (n && n.startsWith('/') && !n.startsWith('//') && !n.includes('\\') ? n : '/dashboard');
