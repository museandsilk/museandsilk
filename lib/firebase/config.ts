/** Firebase WEB app "Nure Asmir Admin" (project nureasmir). These identifiers are public by design
 * (they ship in every Firebase web bundle); access is controlled by Firebase security rules, not by
 * hiding them. Mirrored in public/firebase-messaging-sw.js, which cannot read env vars. */
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyA6jb6Q1h5iA6uvZy5-t7pu20VPN_NGvsM",
  authDomain: "nureasmir.firebaseapp.com",
  projectId: "nureasmir",
  storageBucket: "nureasmir.firebasestorage.app",
  messagingSenderId: "731961563546",
  appId: "1:731961563546:web:24d8c83c88c195cb068223",
  measurementId: "G-LLL65ZTW8D",
};

/** Optional custom Web Push certificate key (Firebase console → Cloud Messaging); the SDK's default is used if unset. */
export const firebaseVapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || undefined;
