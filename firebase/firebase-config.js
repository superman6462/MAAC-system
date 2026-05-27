const firebaseConfig = {
  apiKey: "AIzaSyCwRPJ7Rh-0yA_ZNSfsMv2JIFqQVL_YDqI",
  authDomain: "maac-system.firebaseapp.com",
  projectId: "maac-system",
  storageBucket: "maac-system.firebasestorage.app",
  messagingSenderId: "888172288312",
  appId: "1:888172288312:web:29e2e182e2dbd55df209cd",
  measurementId: "G-2PBQH8XVFW"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
const messaging = firebase.messaging();

// VAPID key
const VAPID_KEY = "XaGZZ8jFB4cSB83VYUvccVkq_Vg8JS63bEidEoZR9nM";
