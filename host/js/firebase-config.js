/* Shared Firebase configuration for the Live Karaoke lyrics suite. */
const firebaseConfig = {
  apiKey: "AIzaSyC4gSodXM35E2ZdYaz6mrCvTUYzW75ZCBk",
  authDomain: "livekaraokemt.firebaseapp.com",
  projectId: "livekaraokemt",
  storageBucket: "livekaraokemt.firebasestorage.app",
  messagingSenderId: "425980659562",
  appId: "1:425980659562:web:892ddcd53fb209d1114713"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
