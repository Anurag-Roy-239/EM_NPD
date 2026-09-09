// ── Firebase project configuration ──────────────────────────────────────────
// Get these values from: Firebase Console → Project settings → General
// → "Your apps" → Web app → SDK setup and configuration → Config
//
// Replace every "REPLACE_ME" below with your actual values, then commit
// this file to your GitHub repo along with index.html and app.js.

export const firebaseConfig = {
  apiKey: "AIzaSyB8YavAj24gx1N_lh0LbyAUCzTf_WoSqqM",
  authDomain: "emotorad-dashboard-6ab51.firebaseapp.com",
  projectId: "emotorad-dashboard-6ab51",
  storageBucket: "emotorad-dashboard-6ab51.firebasestorage.app",
  messagingSenderId: "664576925157",
  appId: "1:664576925157:web:06b08439d74fd45f77e30c"
};

// ── Edit access ──────────────────────────────────────────────────────────
// Simple front-end gate: only this email + password combination can turn on
// Edit mode. NOTE: because this is a static site, this password is visible
// to anyone who views the page source — it stops casual edits, not a
// determined technical user. See README.md for a stronger option using real
// Firebase Authentication if you need that later.
export const EDIT_EMAIL = "anurag@emotorad.com";
export const EDIT_PASSWORD = "EM@12345";
