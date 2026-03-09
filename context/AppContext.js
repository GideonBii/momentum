// context/AppContext.js - Updated to handle base64 images

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseConfig";

const AppContext = createContext(undefined);

const getDefaultUsername = (supabaseUser) => {
  return supabaseUser?.email ? supabaseUser.email.split("@")[0] : "User";
};

// Check if a string is a base64 image
const isBase64Image = (str) => {
  return typeof str === 'string' && str.startsWith('data:image');
};

export const AppProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState({
    username: "",
    bio: "",
    profilePic: null,
  });
  const [loading, setLoading] = useState(true);
  const [profileReady, setProfileReady] = useState(false);
  const [error, setError] = useState(null);
  const [imageLoadError, setImageLoadError] = useState(false);

  const profileChannelRef = useRef(null);

  const clearUserData = () => {
    setUser(null);
    setProfile({ 
      username: "", 
      bio: "", 
      profilePic: null,
    });
    setProfileReady(false);
    setError(null);
    setImageLoadError(false);
  };

  const fetchAndApplyProfile = useCallback(async (supabaseUser) => {
    try {
      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("username, bio, profile_pic")
        .eq("id", supabaseUser.id)
        .single();

      if (profileError && profileError.code !== "PGRST116") {
        console.warn("⚠️ Profile fetch warning:", profileError);
      }

      let profilePic = null;
      let imageError = false;
      
      if (data?.profile_pic) {
        // Check if it's a base64 image
        if (isBase64Image(data.profile_pic)) {
          profilePic = data.profile_pic;
          imageError = false;
        } else {
          // For URL-based images, we'll try them but they might fail
          profilePic = data.profile_pic;
          imageError = false; // We'll let the Image component handle errors
        }
      }

      const newProfile = {
        username: data?.username || getDefaultUsername(supabaseUser),
        bio: data?.bio || "",
        profilePic: profilePic,
      };

      setProfile(newProfile);
      setImageLoadError(imageError);
      setProfileReady(true);
      return newProfile;
    } catch (err) {
      console.warn("⚠️ Profile fetch error:", err?.message);
      setProfile({
        username: getDefaultUsername(supabaseUser),
        bio: "",
        profilePic: null,
      });
      setImageLoadError(false);
      setProfileReady(false);
      return null;
    }
  }, []);

  const updateProfile = useCallback(async (updates = {}) => {
    if (!user) return false;
    
    try {
      const updateData = {
        updated_at: new Date().toISOString(),
      };
      
      if (updates.username !== undefined) updateData.username = updates.username;
      if (updates.bio !== undefined) updateData.bio = updates.bio;
      if (updates.profile_pic !== undefined) updateData.profile_pic = updates.profile_pic;

      const { error } = await supabase
        .from("profiles")
        .update(updateData)
        .eq("id", user.id);

      if (error) throw error;

      // Update local state
      setProfile(prev => {
        const updated = { ...prev };
        if (updates.username !== undefined) updated.username = updates.username;
        if (updates.bio !== undefined) updated.bio = updates.bio;
        if (updates.profile_pic !== undefined) {
          updated.profilePic = updates.profile_pic;
          setImageLoadError(false);
        }
        return { ...updated };
      });

      return true;
    } catch (err) {
      console.error("Error updating profile:", err);
      return false;
    }
  }, [user]);

  useEffect(() => {
    setLoading(true);
    setProfileReady(false);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setError(null);

        if (profileChannelRef.current) {
          supabase.removeChannel(profileChannelRef.current);
          profileChannelRef.current = null;
        }

        if (!session?.user) {
          clearUserData();
          setLoading(false);
          return;
        }

        const supabaseUser = session.user;
        setUser(supabaseUser);
        setProfile({
          username: getDefaultUsername(supabaseUser),
          bio: "",
          profilePic: null,
        });

        await fetchAndApplyProfile(supabaseUser);
        setLoading(false);

        const channel = supabase
          .channel(`profile-${supabaseUser.id}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "profiles",
              filter: `id=eq.${supabaseUser.id}`,
            },
            () => fetchAndApplyProfile(supabaseUser)
          )
          .subscribe();

        profileChannelRef.current = channel;
      }
    );

    return () => {
      subscription.unsubscribe();
      if (profileChannelRef.current) {
        supabase.removeChannel(profileChannelRef.current);
        profileChannelRef.current = null;
      }
    };
  }, [fetchAndApplyProfile]);

  const value = useMemo(
    () => ({
      user,
      setUser,
      profile,
      loading,
      profileReady,
      error,
      imageLoadError,
      setImageLoadError,
      clearError: () => setError(null),
      updateProfile,
      setProfileUpdates: updateProfile,
    }),
    [user, profile, loading, profileReady, error, imageLoadError, updateProfile]
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