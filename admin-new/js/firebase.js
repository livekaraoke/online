(function () {
  const OWNER_EMAIL = "leeborg23@gmail.com";
  const USER_ROLES = ["Admin", "Manager", "Band Member", "Venue", "Host", "Member", "Fan"];

  const firebaseConfig = {
    apiKey: "AIzaSyC4gSodXM35E2ZdYaz6mrCvTUYzW75ZCBk",
    authDomain: "livekaraokemt.firebaseapp.com",
    projectId: "livekaraokemt",
    storageBucket: "livekaraokemt.firebasestorage.app",
    messagingSenderId: "425980659562",
    appId: "1:425980659562:web:892ddcd53fb209d1114713"
  };

  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

  window.LK = window.LK || {};
  LK.OWNER_EMAIL = OWNER_EMAIL;
  LK.USER_ROLES = USER_ROLES;
  LK.db = firebase.firestore();
  LK.auth = firebase.auth();
  LK.state = {
    logHistory: [],
    currentState: null,
    currentSessionId: null,
    currentSessionData: null,
    currentRequests: [],
    currentUserProfile: null,
    allMembers: [],
    sessionUnsubscribe: null,
    requestsUnsubscribe: null,
    membersUnsubscribe: null,
    notesSaveTimer: null,
    confirmResolver: null,
    reasonRequestId: null,
    reasonMode: "delete"
  };

  window.$ = function (id) { return document.getElementById(id); };
  window.serverNow = function () { return firebase.firestore.FieldValue.serverTimestamp(); };
  window.nowTimestamp = function () { return firebase.firestore.Timestamp.now(); };
  window.isOwner = function () {
    return (LK.auth.currentUser?.email || "").toLowerCase() === LK.OWNER_EMAIL.toLowerCase();
  };
})();
