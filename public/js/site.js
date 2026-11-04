export const SITE = {
  name: 'ICF REFLEX',
  tagline: 'YOUR ANIME. YOUR UNIVERSE.',
  // Set a real address to enable the mailto link on /contact. Left empty on purpose.
  contactEmail: '',
};
export const href = {
  anime: (id) => `/anime/${encodeURIComponent(id)}`,
  watch: (id) => `/watch/${encodeURIComponent(id)}`,
  genre: (slug) => `/genre/${encodeURIComponent(slug)}`,
};
export const PLACEHOLDER = { poster: '/assets/placeholders/poster.svg', banner: '/assets/placeholders/banner.svg' };
export const ENUMS = {
  status: ['ongoing', 'completed', 'upcoming'],
  type: ['TV', 'Movie', 'OVA', 'ONA', 'Special'],
  visibility: ['public', 'hidden'],
  sections: [['hero', 'Hero banner'], ['featured', 'Featured'], ['trending', 'Trending (editor-curated)'], ['recommended', "Editor's picks"]],
};
/** Reads the id from /anime/:id style paths, falling back to ?id= */
export const pathId = () =>
  decodeURIComponent(location.pathname.split('/').filter(Boolean)[1] || new URLSearchParams(location.search).get('id') || '');
