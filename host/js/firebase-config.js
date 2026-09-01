/* Firebase configuration shared by the Live Karaoke lyrics tools. */
const firebaseConfig = {
  apiKey: "AIzaSyC4gSodXM35E2ZdYaz6mrCvTUYzW75ZCBk",
  authDomain: "livekaraokemt.firebaseapp.com",
  projectId: "livekaraokemt",
  storageBucket: "livekaraokemt.firebasestorage.app",
  messagingSenderId: "425980659562",
  appId: "1:425980659562:web:892ddcd53fb209d1114713"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

/* Expose these globally because the existing suite uses db directly. */
window.db = firebase.firestore();
// Some host/viewer pages intentionally load only Firebase App + Firestore.
window.auth =
  typeof firebase.auth === "function"
    ? firebase.auth()
    : null;
