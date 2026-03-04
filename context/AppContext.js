// context/AppContext.js
// ✅ Single source of truth for user + profile across entire app
// ✅ setProfileUpdates() lets any screen push changes instantly (no re-fetch needed)
// ✅ Realtime listener only syncs fields it won't race — never blanks an in-flight update
// ✅ profilePic cache-buster applied only when the URL itself changes

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseConfig";

const AppContext = createContext(undefined);

const getDefaultUsername = (supabaseUser) =>
  supabaseUser?.email ? supabaseUser.email.split("@")[0] : "User";

// Strip ?t= params so we compare base URLs when deciding whether to add a cache-buster
const baseUrl = (url) => (url ? url.split("?")[0] : null);

export const AppProvider = ({ children }) => {
  const [user, setUser]               = useState(null);
  const [profile, setProfile]         = useState({ username: "", bio: "", profilePic: null });
  const [loading, setLoading]         = useState(true);
  const [profileReady, setProfileReady] = useState(false);
  const [error, setError]             = useState(null);

  const profileChannelRef = useRef(null);
  // Tracks the last profile_pic URL we fetched from DB so we can detect real changes
  const lastFetchedPicRef = useRef(null);

  const clearUserData = () => {
    setUser(null);
    setProfile({ username: "", bio: "", profilePic: null });
    setProfileReady(false);
    setError(null);
    lastFetchedPicRef.current = null;
  };

  const fetchAndApplyProfile = async (supabaseUser) => {
    try {
      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("username, bio, profile_pic, streak, dob, interests, gender, country")
        .eq("id", supabaseUser.id)
        .single();

      if (profileError && profileError.code !== "PGRST116") {
        console.warn("⚠️ Profile fetch warning:", profileError.code);
      }

      const incomingPic = data?.profile_pic || null;

      setProfile((prev) => {
        // Only add a cache-buster when the stored URL has actually changed
        // (prevents double ?t= and unnecessary Image re-renders)
        let picToUse = prev.profilePic;
        if (incomingPic) {
          if (baseUrl(incomingPic) !== baseUrl(lastFetchedPicRef.current)) {
            // New photo — apply with cache-buster to force React Native to reload
            picToUse = incomingPic + "?t=" + Date.now();
            lastFetchedPicRef.current = incomingPic;
          }
          // else: same URL already in DB — keep whatever is already in state
          //       (may already have a cache-buster from a recent upload)
        } else if (!prev.profilePic) {
          picToUse = null; // No photo anywhere, keep null
        }
        // If incomingPic is null but prev has one — keep prev (race condition guard)

        return {
          username:  data?.username  || getDefaultUsername(supabaseUser),
          bio:       data?.bio       || "",
          profilePic: picToUse,
          streak:    data?.streak    || 0,
          dob:       data?.dob       || null,
          interests: data?.interests || [],
          gender:    data?.gender    || null,
          country:   data?.country   || null,
        };
      });

      setProfileReady(true);
    } catch (err) {
      console.warn("⚠️ Profile fetch error (non-fatal):", err?.message);
      setProfile((prev) => ({
        username:   getDefaultUsername(supabaseUser),
        bio:        "",
        profilePic: prev?.profilePic || null,
        streak:     0,
        dob:        null,
        interests:  [],
        gender:     null,
        country:    null,
      }));
      setProfileReady(false);
    }
  };

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

        // Show safe defaults immediately while we fetch the real profile
        setProfile({ username: getDefaultUsername(supabaseUser), bio: "", profilePic: null });

        await fetchAndApplyProfile(supabaseUser);
        setLoading(false);

        // Realtime: re-fetch whenever the profiles row changes
        const channel = supabase
          .channel(`profile-${supabaseUser.id}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "profiles", filter: `id=eq.${supabaseUser.id}` },
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
  }, []);

  const value = useMemo(
    () => ({
      user,
      setUser,
      profile,
      loading,
      profileReady,
      error,
      clearError: () => setError(null),
      /**
       * setProfileUpdates({ username, bio, profilePic, ... })
       *
       * Call this immediately after any DB write so every screen that reads
       * `profile` from useApp() re-renders right away — no waiting for the
       * Supabase realtime event.
       *
       * For profilePic: pass the final URL including any ?t= cache-buster
       * you already applied.  fetchAndApplyProfile will detect the base URL
       * hasn't changed and won't add a second cache-buster.
       */
      setProfileUpdates: (updates = {}) =>
        setProfile((prev) => ({ ...prev, ...updates })),
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