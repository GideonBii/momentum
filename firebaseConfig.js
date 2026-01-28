// firebaseConfig.js
console.log("🚀 firebaseConfig.js loading...");

import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp, getApp, getApps } from "firebase/app";
import {
  getAuth,
  initializeAuth,
  getReactNativePersistence,
} from "firebase/auth";
import {
  initializeFirestore,
  memoryLocalCache,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";

/* =========================
   🔐 Firebase Configuration
   ========================= */
const firebaseConfig = {
  apiKey: "AIzaSyCHINCKnhQoAn7-9urtX7uOzT90Jha14WI",
  authDomain: "momentum-e883f.firebaseapp.com",
  projectId: "momentum-e883f",
  storageBucket: "momentum-e883f.appspot.com",
  messagingSenderId: "724410211915",
  appId: "1:724410211915:web:eae223067b90cc609cf7ce",
};

console.log("🔧 Firebase project:", firebaseConfig.projectId);

/* =========================
   🔥 Initialize Firebase App
   ========================= */
const app = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApp();

console.log("✅ Firebase App initialized:", app.name);

/* =========================
   🔐 Firebase Auth (RN Safe)
   ========================= */
let auth;

try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
  console.log("✅ Firebase Auth initialized with AsyncStorage persistence");
} catch (error) {
  // Happens during hot reload — safe fallback
  auth = getAuth(app);
  console.log("ℹ️ Firebase Auth already initialized (fallback)");
}

/* =========================
   📦 Firestore (RN SAFE ONLY)
   ========================= */
// ❗ IMPORTANT:
// React Native DOES NOT support IndexedDB
// memoryLocalCache() is the ONLY valid cache

const db = initializeFirestore(app, {
  localCache: memoryLocalCache(),
});

console.log("✅ Firestore initialized with memory cache");

/* =========================
   ☁️ Firebase Storage
   ========================= */
const storage = getStorage(app);
console.log("✅ Firebase Storage initialized");

/* =========================
   🚀 Exports
   ========================= */
export { app, auth, db, storage };
