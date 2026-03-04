// context/AuthContext.js — Supabase version
// ✅ Replaces Firebase Auth with supabase.auth
// ✅ Profile row created by DB trigger (handle_new_user) — no manual setDoc needed
// ✅ login / register / logout mirror the original API so all callers are unaffected

import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../supabaseConfig";

const AuthContext = createContext(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    // Hydrate from existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setInitializing(false);
    });

    // Keep in sync with auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  /* ── Login ── */
  const login = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      console.error("Login error:", error);
      throw error;
    }
    console.log("✅ User logged in:", data.user?.email);
    return data;
  };

  /* ── Register ── */
  const register = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      console.error("Registration error:", error);
      throw error;
    }
    // Profile row is created automatically by the handle_new_user DB trigger
    console.log("✅ User registered:", data.user?.email);
    return data;
  };

  /* ── Logout ── */
  const logout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) console.error("Logout error:", error);
    else console.log("👋 User logged out.");
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

export default AuthContext;