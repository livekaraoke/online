// OurHive Firebase setup
// Replace this config with your own Firebase web app config if needed.
// Firebase Console > Project Settings > Your apps > Web app config.
const firebaseConfig = {
  apiKey: "AIzaSyA6OVCYxqBa2oz52KVnJRnoOmIhHLKYDnw",
  authDomain: "ourhive-ed53b.firebaseapp.com",
  projectId: "ourhive-ed53b",
  storageBucket: "ourhive-ed53b.firebasestorage.app",
  messagingSenderId: "526656445501",
  appId: "1:526656445501:web:c6d814e4ba3e0ead149e54",
  measurementId: "G-CD7VFWSS7Q"
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
