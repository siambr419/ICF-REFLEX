/*
 * Firebase client configuration.
 * Create a Web App in YOUR Firebase project (Console → Project settings → Your apps) and paste the values below.
 * These values identify your project; they are not secrets and they do NOT protect your data.
 * Data is protected by firestore.rules.
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js';

export const firebaseConfig = {
  apiKey: 'AIzaSyBuxw-WXatK-rb7FIK-vxs5440_vmwl_8c',
  authDomain: 'icf-reflex.firebaseapp.com',
  projectId: 'icf-reflex',
  appId: '1:177864390856:web:e23ed6314c5d61f9bccdfd',
};
export const configured = Object.values(firebaseConfig).every((v) => v && !/^YOUR_/.test(v) && !v.includes('YOUR_'));
export const app = configured ? initializeApp(firebaseConfig) : null;
