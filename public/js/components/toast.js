export function toast(message, type = 'info', ms = 4500) {
  const region = document.getElementById('toast-region');
  if (!region) return;
  const d = document.createElement('div');
  d.className = `toast toast-${type}`;
  d.setAttribute('role', type === 'error' ? 'alert' : 'status');
  d.textContent = message;
  region.append(d);
  setTimeout(() => d.remove(), ms);
}
