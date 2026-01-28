// context/AuthContext.js
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";
import React, { createContext, useContext, useEffect, useState } from "react";

import { doc, setDoc } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";

const AuthContext = createContext(undefined);

// Custom hook with better error handling
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

/* -------------------------------------------------------------------------- */
/*                  ENSURE USER PROFILE EXISTS IN FIRESTORE                   */
/* -------------------------------------------------------------------------- */
async function ensureUserProfile(user) {
  if (!user) return;

  const userRef = doc(db, "users", user.uid);

  await setDoc(
    userRef,
    {
      uid: user.uid,
      email: user.email.toLowerCase(),
      displayName: user.displayName || "",
      photoURL: user.photoURL || null,
      createdAt: new Date()
    },
    { merge: true } // do not overwrite existing data
  );
}

/* -------------------------------------------------------------------------- */
/*                                 PROVIDER                                   */
/* -------------------------------------------------------------------------- */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);

  // Watch for auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser || null);

      if (firebaseUser) {
        // ensure Firestore user exists on reload
        await ensureUserProfile(firebaseUser);
      }

      setInitializing(false);
    });

    return unsubscribe;
  }, []);

  /* -------------------------------------------------------------------------- */
  /*                                  LOGIN                                     */
  /* -------------------------------------------------------------------------- */
  const login = async (email, password) => {
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);

      // Create/update Firestore user profile
      await ensureUserProfile(credential.user);

      console.log("✅ User logged in and Firestore profile ensured!");
    } catch (error) {
      console.error("Login error:", error);
      throw error;
    }
  };

  /* -------------------------------------------------------------------------- */
  /*                                 REGISTER                                   */
  /* -------------------------------------------------------------------------- */
  const register = async (email, password) => {
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);

      // Create Firestore profile
      await ensureUserProfile(credential.user);

      console.log("✅ User registered and profile created in Firestore!");
    } catch (error) {
      console.error("Registration error:", error);
      throw error;
    }
  };

  /* -------------------------------------------------------------------------- */
  /*                                  LOGOUT                                    */
  /* -------------------------------------------------------------------------- */
  const logout = async () => {
    try {
      await signOut(auth);
      console.log("👋 User logged out.");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const value = {
    user,
    initializing,
    login,
    register,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {!initializing && children}
    </AuthContext.Provider>
  );
};

// Export the context itself for advanced usage
export default AuthContext;