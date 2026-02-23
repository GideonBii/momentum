// AppContext.js - HARDENED (Production-safe)
// ✅ Single source of truth: Firebase Auth (onAuthStateChanged)
// ✅ Profile doc missing is NOT an error (new users / slow writes)
// ✅ Snapshot permission/network errors become NON-FATAL (defaults still work)
// ✅ Proper cleanup & no stale listeners
// ✅ Fixed syntax bug in updateProfile setter

import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { auth, db } from "../firebaseConfig";

const APP_ID = "momentum-app";
const AppContext = createContext(undefined);

const getDefaultUsername = (firebaseUser) => {
  return (
    firebaseUser?.displayName ||
    (firebaseUser?.email ? firebaseUser.email.split("@")[0] : "User")
  );
};

const getDefaultProfilePic = (firebaseUser) => {
  return firebaseUser?.photoURL || null;
};

export const AppProvider = ({ children }) => {
  const [user, setUser] = useState(null);

  // Profile is ALWAYS available (defaults derived from Auth user)
  const [profile, setProfile] = useState({
    username: "",
    bio: "",
    profilePic: null,
  });

  // loading = app-level auth/profile initialization
  const [loading, setLoading] = useState(true);

  // profileReady helps screens that require Firestore profile fields
  const [profileReady, setProfileReady] = useState(false);

  // Only use error for AUTH-level errors or truly blocking issues
  const [error, setError] = useState(null);

  const unsubscribeProfileRef = useRef(null);

  const clearUserData = () => {
    setUser(null);
    setProfile({ username: "", bio: "", profilePic: null });
    setProfileReady(false);
    setError(null);
  };

  // Merge profile safely
  const applyProfileFromFirestore = (firebaseUser, docSnap) => {
    if (docSnap?.exists?.()) {
      const data = docSnap.data() || {};
      setProfile({
        username: data.username || getDefaultUsername(firebaseUser),
        bio: data.bio || "",
        profilePic: data.profilePic || getDefaultProfilePic(firebaseUser),
      });
    } else {
      // Doc missing is normal for brand-new users
      setProfile({
        username: getDefaultUsername(firebaseUser),
        bio: "",
        profilePic: getDefaultProfilePic(firebaseUser),
      });
    }
  };

  useEffect(() => {
    setLoading(true);
    setProfileReady(false);

    const unsubscribeAuth = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        // Always clear non-blocking errors on auth change
        setError(null);

        // Clean up any previous profile listener
        if (unsubscribeProfileRef.current) {
          try {
            unsubscribeProfileRef.current();
          } catch (e) {
            // ignore
          }
          unsubscribeProfileRef.current = null;
        }

        if (!firebaseUser) {
          clearUserData();
          setLoading(false);
          return;
        }

        // ✅ Set auth user immediately
        setUser(firebaseUser);

        // ✅ Set a safe default profile immediately (UI can render)
        setProfile({
          username: getDefaultUsername(firebaseUser),
          bio: "",
          profilePic: getDefaultProfilePic(firebaseUser),
        });

        // ✅ Subscribe to Firestore profile (non-blocking)
        const userRef = doc(db, "users", firebaseUser.uid);
// Create user document if it doesn't exist
const createUserDocumentIfNeeded = async () => {
  try {
    const { getDoc, setDoc, serverTimestamp } = await import("firebase/firestore");
    const docSnap = await getDoc(userRef);
    
    if (!docSnap.exists()) {
      // Document doesn't exist, create it
      await setDoc(userRef, {
        uid: firebaseUser.uid,
        email: firebaseUser.email || "",
        username: getDefaultUsername(firebaseUser),
        displayName: firebaseUser.displayName || getDefaultUsername(firebaseUser),
        profilePic: getDefaultProfilePic(firebaseUser),
        bio: "",
        notifications: [],
        expoPushToken: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      console.log("✅ Created user document for:", firebaseUser.uid);
    }
  } catch (error) {
    console.warn("Could not create user document:", error);
  }
};

// Call it immediately
createUserDocumentIfNeeded();
// 🆕 END OF NEW CODE ⬆️


        unsubscribeProfileRef.current = onSnapshot(
          userRef,
          (docSnap) => {
            applyProfileFromFirestore(firebaseUser, docSnap);
            setProfileReady(true);
            setLoading(false);
          },
          (err) => {
            // IMPORTANT: Do NOT show "registration failed" style errors here.
            // Network issues / permission rules / doc not created yet can trigger this.
            console.warn("⚠️ Profile snapshot error (non-fatal):", err?.code, err?.message);

            // Keep defaults so app works
            setProfile({
              username: getDefaultUsername(firebaseUser),
              bio: "",
              profilePic: getDefaultProfilePic(firebaseUser),
            });

            // Don't block the app
            setProfileReady(false);
            setLoading(false);

            // Optional: If you want to surface something subtle in a debug screen:
            // setError("Profile sync unavailable (offline or permissions).");
            // For production, it's better to keep this null.
            setError(null);
          }
        );
      },
      (err) => {
        console.error("❌ Auth state change error:", err);
        setError("Authentication error occurred");
        setLoading(false);
        setProfileReady(false);
      }
    );

    return () => {
      try {
        unsubscribeAuth();
      } catch (e) {
        // ignore
      }
      if (unsubscribeProfileRef.current) {
        try {
          unsubscribeProfileRef.current();
        } catch (e) {
          // ignore
        }
        unsubscribeProfileRef.current = null;
      }
    };
  }, []);

  const value = useMemo(
    () => ({
      user,
      profile,
      loading,
      profileReady,
      error,
      appId: APP_ID,
      clearError: () => setError(null),

      // ✅ Fixed syntax + safe merge
      setProfileUpdates: (updates = {}) =>
        setProfile((prev) => ({
          ...prev,
          ...updates,
        })),
    }),
    [user, profile, loading, profileReady, error]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
};
