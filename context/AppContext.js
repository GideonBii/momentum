// AppContext.js - UPDATED VERSION
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import React, { createContext, useContext, useEffect, useState } from "react";
import { auth, db } from "../firebaseConfig";

const AppContext = createContext();

export const AppProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState({
    username: "",
    bio: "",
    profilePic: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Helper function to get default username
  const getDefaultUsername = (firebaseUser) => {
    return firebaseUser.displayName || 
           (firebaseUser.email ? firebaseUser.email.split("@")[0] : "User");
  };

  // Helper function to get default profile pic
  const getDefaultProfilePic = (firebaseUser) => {
    return firebaseUser.photoURL || null;
  };

  // Update profile state with proper merging
  const updateProfile = (firebaseUser, docSnap = null) => {
    if (docSnap?.exists()) {
      const data = docSnap.data();
      setProfile({
        username: data.username || getDefaultUsername(firebaseUser),
        bio: data.bio || "",
        profilePic: data.profilePic || getDefaultProfilePic(firebaseUser),
      });
    } else {
      setProfile({
        username: getDefaultUsername(firebaseUser),
        bio: "",
        profilePic: getDefaultProfilePic(firebaseUser),
      });
    }
  };

  // Clear all user data
  const clearUserData = () => {
    setUser(null);
    setProfile({ username: "", bio: "", profilePic: null });
    setError(null);
  };

  useEffect(() => {
    let unsubscribeProfile = null;

    const unsubscribeAuth = onAuthStateChanged(auth, 
      (firebaseUser) => {
        setError(null);
        setUser(firebaseUser);
        
        if (firebaseUser) {
          // Load user profile from Firestore
          const userRef = doc(db, "users", firebaseUser.uid);
          
          unsubscribeProfile = onSnapshot(userRef, 
            (docSnap) => {
              updateProfile(firebaseUser, docSnap);
              setLoading(false);
            },
            (err) => {
              console.error("Error fetching user profile:", err);
              setError("Failed to load user profile");
              // Set default profile even if Firestore fails
              updateProfile(firebaseUser);
              setLoading(false);
            }
          );
        } else {
          // No user is signed in
          clearUserData();
          setLoading(false);
        }
      },
      (err) => {
        console.error("Auth state change error:", err);
        setError("Authentication error occurred");
        setLoading(false);
      }
    );

    // Cleanup function
    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) {
        unsubscribeProfile();
      }
    };
  }, []);

  const value = {
    user,
    profile,
    loading,
    error,
    clearError: () => setError(null),
    // Optional: Add methods to update profile if needed
    updateProfile: (updates) => setProfile(prev => ({ ...prev, ...updates }))
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
};