(function(){
  "use strict";
  const firebaseConfig = {
    apiKey: "AIzaSyAkJ6yKFE8jgcDoWtZfQKmHjhBk4rfZ8Fg",
    authDomain: "livekaraokesuite.firebaseapp.com",
    projectId: "livekaraokesuite",
    storageBucket: "livekaraokesuite.firebasestorage.app",
    messagingSenderId: "25324781952",
    appId: "1:25324781952:web:ca9467eecce90574ee8165",
    measurementId: "G-J1DVP1T0HW"
  };
  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  window.BillyLeeDB = firebase.firestore();
})();
