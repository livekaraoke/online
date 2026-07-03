// OurHive Firebase setup
// Replace this config with your own Firebase web app config if needed.
// Firebase Console > Project Settings > Your apps > Web app config.
const firebaseConfig = {
  apiKey: "AIzaSyC4gSodXM35E2ZdYaz6mrCvTUYzW75ZCBk",
  authDomain: "livekaraokemt.firebaseapp.com",
  projectId: "livekaraokemt",
  storageBucket: "livekaraokemt.firebasestorage.app",
  messagingSenderId: "425980659562",
  appId: "1:425980659562:web:892ddcd53fb209d1114713"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage ? firebase.storage() : null;
const googleProvider = new firebase.auth.GoogleAuthProvider();

const OURHIVE = {
  quote: "The best thing to hold onto in life is each other.",
  defaultHiveName: "Our Hive"
};
