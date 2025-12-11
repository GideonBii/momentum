// AuthContext.js
import { initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { createContext, useContext, useEffect, useState } from "react";

// ✅ Replace with your Firebase config from Firebase Console
const firebaseConfig = {
  apiKey: "AIzaSyDP3jlSeUmp_hXJJMw4WCBNyrjWRYBJxkI",
  authDomain: "momentum-5d534.firebaseapp.com",
  projectId: "momentum-5d534",
  storageBucket: "momentum-5d534.firebasestorage.app",
  messagingSenderId: "93949913804",
  appId: "1:93949913804:web:9bec6609975ddfc19a3069",
  measurementId: "G-R05QRFF744"
};

// Initialize Firebase app only once
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Context creation
const AuthContext = createContext();

// Hook to use auth easily
export function useAuth() {
  return useContext(AuthContext);
}

// Provider
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Listen for user state changes
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return unsubscribe; // cleanup on unmount
  }, []);

  // Authentication methods
  const login = (email, password) =>
    signInWithEmailAndPassword(auth, email, password);

  const register = (email, password) =>
    createUserWithEmailAndPassword(auth, email, password);

  const logout = () => signOut(auth);

  const value = { user, login, register, logout };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
