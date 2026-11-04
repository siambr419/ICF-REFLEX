/* Client-side role helpers drive UX only. Real enforcement lives in firestore.rules. */
export const ROLES = ['user', 'premium', 'moderator', 'content_manager', 'admin', 'super_admin'];
export const ROLE_LABELS = { user: 'Registered user', premium: 'Premium user', moderator: 'Moderator', content_manager: 'Content manager', admin: 'Admin', super_admin: 'Super admin' };
export const GUARDS = {
  staff: ['moderator', 'content_manager', 'admin', 'super_admin'],
  content: ['content_manager', 'admin', 'super_admin'],
  mod: ['moderator', 'admin', 'super_admin'],
  admin: ['admin', 'super_admin'],
  super: ['super_admin'],
};
export const isStaff = (role) => GUARDS.staff.includes(role);
