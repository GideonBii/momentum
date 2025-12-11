// firebaseConfig.js - FIXED VERSION
console.log('🚀 firebaseConfig.js is loading...');

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  getReactNativePersistence,
  initializeAuth
} from "firebase/auth";
import {
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache
} from "firebase/firestore";
import { getStorage } from "firebase/storage";

// 🔹 Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCHINCKnhQoAn7-9urtX7uOzT90Jha14WI",
  authDomain: "momentum-e883f.firebaseapp.com",
  projectId: "momentum-e883f",
  storageBucket: "momentum-e883f.appspot.com",
  messagingSenderId: "724410211915",
  appId: "1:724410211915:web:eae223067b90cc609cf7ce",
};

console.log('🔧 Config loaded for project:', firebaseConfig.projectId);

// -------------------------------------------------------
// 🔥 Initialize App (Safe Singleton)
// -------------------------------------------------------
let app;
try {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  console.log('✅ Firebase App initialized:', app.name);
} catch (appError) {
  console.error('💥 Firebase App initialization failed:', appError);
  throw appError;
}

// -------------------------------------------------------
// 🔐 Auth with React Native Persistence
// -------------------------------------------------------
let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
  console.log('✅ Firebase Auth initialized with persistence');
} catch (authError) {
  console.warn('⚠️ Auth persistence failed, using default:', authError.message);
  auth = getAuth(app);
  console.log('✅ Firebase Auth initialized (fallback)');
}

// -------------------------------------------------------
// 📦 FIRESTORE WITH PERSISTENT CACHE (FIXED)
// -------------------------------------------------------
let db;
try {
  // Use persistent cache for React Native
  db = initializeFirestore(app, {
    localCache: persistentLocalCache()
  });
  console.log('✅ Firestore initialized with persistent cache');
} catch (firestoreError) {
  console.warn('⚠️ Persistent cache failed, trying memory cache:', firestoreError.message);
  try {
    db = initializeFirestore(app, {
      localCache: memoryLocalCache()
    });
    console.log('✅ Firestore initialized with memory cache');
  } catch (memoryError) {
    console.warn('⚠️ Memory cache failed, using basic initialization:', memoryError.message);
    db = initializeFirestore(app);
    console.log('✅ Firestore initialized (basic)');
  }
}

// -------------------------------------------------------
// ☁️ Storage (FIXED - Ensure proper initialization)
// -------------------------------------------------------
let storage;
try {
  storage = getStorage(app);
  console.log('✅ Firebase Storage initialized');
  console.log('📦 Storage bucket:', storage._location?.bucket);
} catch (storageError) {
  console.error('💥 Storage initialization failed:', storageError);
  throw storageError;
}

console.log('🎉 All Firebase services ready!');

export { app, auth, db, storage };

