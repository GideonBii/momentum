// screens/HomeScreen.js
// ✨ PREMIUM REDESIGN
// ✅ Richer header with avatar shortcut + live greeting
// ✅ Focus Block: taller, progress ring, urgency badge
// ✅ Stats row: streak + tasks + goals in a scannable pill strip
// ✅ Carousel: wider cards, icon backdrop, cleaner hierarchy
// ✅ Pill-style dot indicator replacing tiny dots
// ✅ Subtle warm background tint for depth
// ✅ Consistent typographic scale (light / medium / bold rhythm)
// ✅ FIXED: Profile avatar and username now update immediately when changed
// ✅ FIXED: Shared Goals data now properly fetched from database

import { Ionicons } from "@expo/vector-icons";
import { DrawerActions, useFocusEffect, useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../context/AppContext";
import { supabase } from "../supabaseConfig";

import Animated, {
  Easing,
  Extrapolate,
  interpolate,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

// ─── THEME ────────────────────────────────────────────────────────────────────
const COLORS = {
  // Surfaces
  backgroundBase: "#FAF8F6",        // Warm off-white instead of cool grey
  backgroundLayer: "#FAF8F6",
  card: "#FFFFFF",
  cardBorder: "rgba(216,163,157,0.14)",

  // Text
  textPrimary: "#3D2B22",           // Slightly richer brown
  textSecondary: "#A98467",
  textTertiary: "#C4A898",
  textOnGradient: "#FFFFFF",

  // Accents
  accentBlush: "#D8A39D",
  accentWarm: "#E3B777",
  accentSage: "#6FA08A",
  accentMauve: "#B07FA8",

  // Shadows
  nudeShadow: "rgba(180,120,105,0.12)",
  warmShadow: "rgba(180,120,105,0.18)",

  // Gradients
  gradientFocus:       ["#2A2060", "#8B5C7E"],
  gradientJournal:     ["#7A1848", "#3A302D"],
  gradientGoals:       ["#6A4F8C", "#4A3468"],
  gradientNotes:       ["#3D7A6C", "#0D3B2E"],
  gradientSharedGoals: ["#3A5F9E", "#142247"],

  // Urgency
  urgencyHigh:   "#FF6B6B",
  urgencyMed:    "#E3B777",
  urgencyLow:    "#6FA08A",
};

const { width } = Dimensions.get("window");
const CARD_WIDTH  = Math.round(width * 0.68);
const CARD_SPACING = 14;
const ITEM_SIZE   = CARD_WIDTH + CARD_SPACING;
const PADDING_LEFT = 20;

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
};

const getDueBadge = (dueDateStr) => {
  if (!dueDateStr) return null;
  const diff = Math.ceil(
    (new Date(dueDateStr) - new Date()) / (1000 * 60 * 60 * 24)
  );
  if (diff < 0)  return { label: "Overdue",      color: COLORS.urgencyHigh };
  if (diff === 0) return { label: "Due today",   color: COLORS.urgencyHigh };
  if (diff === 1) return { label: "Due tomorrow", color: COLORS.urgencyMed };
  if (diff <= 3)  return { label: `${diff}d left`, color: COLORS.urgencyMed };
  return null;
};

// ─── FOCUS BLOCK ─────────────────────────────────────────────────────────────
function FocusBlock({ item, onPress, pendingCount, completedCount }) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1.012, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
      -1, true
    );
  }, []);
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  const badge = item.dueDateStr ? getDueBadge(item.dueDateStr) : null;
  const total = pendingCount + completedCount;
  const pct   = total > 0 ? completedCount / total : 0;

  return (
    <Pressable
      onPress={() => onPress && onPress(item)}
      android_ripple={{ color: "rgba(255,255,255,0.15)" }}
      style={({ pressed }) => [
        styles.focusBlock,
        pressed && { transform: [{ scale: 0.985 }] },
      ]}
    >
      <LinearGradient
        colors={item.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1.2 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Large icon watermark */}
      <Animated.View style={[styles.focusIconWatermark, pulseStyle]}>
        <Ionicons name="checkmark-circle" size={130} color="rgba(255,255,255,0.06)" />
      </Animated.View>

      <View style={styles.focusInner}>
        {/* Top row */}
        <View style={styles.focusTopRow}>
          <View style={styles.focusLabelPill}>
            <Ionicons name="flash" size={10} color={COLORS.textOnGradient} style={{ marginRight: 4 }} />
            <Text style={styles.focusPillText}>TODAY'S FOCUS</Text>
          </View>
          {badge && (
            <View style={[styles.urgencyBadge, { backgroundColor: badge.color + "30", borderColor: badge.color + "60" }]}>
              <Text style={[styles.urgencyText, { color: badge.color }]}>{badge.label}</Text>
            </View>
          )}
        </View>

        {/* Task title */}
        <Text style={styles.focusTitle} numberOfLines={2}>
          {item.value || "No task set — tap to add one"}
        </Text>

        {/* Bottom row: task progress bar */}
        <View style={styles.focusBottomRow}>
          <View style={styles.focusProgressWrap}>
            <View style={styles.focusProgressTrack}>
              <View style={[styles.focusProgressFill, { width: `${Math.max(0, Math.min(100, Math.round(pct * 100)))}%` }]} />
            </View>
            <Text style={styles.focusProgressLabel}>
              {completedCount}/{total} tasks done
            </Text>
          </View>
          <View style={styles.focusNavArrow}>
            <Ionicons name="arrow-forward" size={15} color="rgba(255,255,255,0.7)" />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

// ─── MOMENTUM PULSE ──────────────────────────────────────────────────────────
// Three smart insight tiles: task completion arc, most active area, next milestone

function CompletionArc({ pct }) {
  const SIZE = 46;
  const STROKE = 3.5;
  const clampedPct = Math.max(0, Math.min(1, pct));
  const deg = Math.round(clampedPct * 360);
  return (
    <View style={{ width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" }}>
      <View style={{
        width: SIZE, height: SIZE, borderRadius: SIZE / 2,
        borderWidth: STROKE, borderColor: COLORS.accentBlush + "20",
        position: "absolute",
      }} />
      {deg > 0 && (
        <View style={{
          width: SIZE, height: SIZE, borderRadius: SIZE / 2,
          borderWidth: STROKE,
          borderTopColor: COLORS.accentBlush,
          borderRightColor: deg >= 90 ? COLORS.accentBlush : "transparent",
          borderBottomColor: deg >= 180 ? COLORS.accentBlush : "transparent",
          borderLeftColor: deg >= 270 ? COLORS.accentBlush : "transparent",
          position: "absolute",
          transform: [{ rotate: "-90deg" }],
        }} />
      )}
      <Text style={{ fontSize: 11, fontWeight: "700", color: COLORS.textPrimary }}>
        {Math.round(clampedPct * 100)}%
      </Text>
    </View>
  );
}

function getActiveArea(allNotes, allJournalEntries, allGoals) {
  const areas = [
    {
      label: "Notes",
      icon: "document-text",
      color: COLORS.accentSage,
      latest: allNotes.reduce((l, n) => { const d = new Date(n.created_at || 0); return d > l ? d : l; }, new Date(0)),
    },
    {
      label: "Journal",
      icon: "book",
      color: COLORS.accentMauve,
      latest: allJournalEntries.reduce((l, j) => { const d = new Date(j.created_at || 0); return d > l ? d : l; }, new Date(0)),
    },
    {
      label: "Goals",
      icon: "trending-up",
      color: COLORS.accentWarm,
      latest: allGoals.reduce((l, g) => { const d = new Date(g.updated_at || g.created_at || 0); return d > l ? d : l; }, new Date(0)),
    },
  ];
  areas.sort((a, b) => b.latest - a.latest);
  const top = areas[0];
  const diffH = Math.floor((Date.now() - top.latest.getTime()) / (1000 * 60 * 60));
  const diffD = Math.floor(diffH / 24);
  let timeLabel;
  if (top.latest.getTime() === 0) timeLabel = "No activity";
  else if (diffH < 1)   timeLabel = "Just now";
  else if (diffH < 24)  timeLabel = `${diffH}h ago`;
  else if (diffD === 1) timeLabel = "Yesterday";
  else                  timeLabel = `${diffD}d ago`;
  return { ...top, timeLabel };
}

function getNextMilestone(allGoals) {
  for (const goal of allGoals) {
    const ms = Array.isArray(goal.milestones) ? goal.milestones : [];
    const pending = ms.find((m) => !m.completed);
    if (pending) return { milestone: pending, goalName: goal.title || goal.goal_name || "Goal" };
  }
  return null;
}

function MomentumPulse({ allTasks, allNotes, allJournalEntries, allGoals, navigation }) {
  const completed = allTasks.filter((t) => t.completed).length;
  const total     = allTasks.length;
  const pct       = total > 0 ? completed / total : 0;
  const activeArea = getActiveArea(allNotes, allJournalEntries, allGoals);
  const nextMs     = getNextMilestone(allGoals);

  return (
    <View style={styles.pulseRow}>
      <TouchableOpacity style={styles.pulseTile} onPress={() => navigation.navigate("Planner")} activeOpacity={0.75}>
        <CompletionArc pct={pct} />
        <Text style={styles.pulseTileLabel}>Done today</Text>
        <Text style={styles.pulseTileSub}>{completed}/{total} tasks</Text>
      </TouchableOpacity>

      <View style={styles.pulseDivider} />

      <TouchableOpacity style={styles.pulseTile} onPress={() => navigation.navigate(activeArea.label)} activeOpacity={0.75}>
        <View style={[styles.pulseIconRing, { borderColor: activeArea.color + "40", backgroundColor: activeArea.color + "12" }]}>
          <Ionicons name={activeArea.icon} size={20} color={activeArea.color} />
          <View style={[styles.pulseLiveDot, { backgroundColor: activeArea.color }]} />
        </View>
        <Text style={styles.pulseTileLabel}>Most active</Text>
        <Text style={[styles.pulseTileSub, { color: activeArea.color }]} numberOfLines={1}>
          {activeArea.label} · {activeArea.timeLabel}
        </Text>
      </TouchableOpacity>

      <View style={styles.pulseDivider} />

      <TouchableOpacity style={styles.pulseTile} onPress={() => navigation.navigate("Goals")} activeOpacity={0.75}>
        <View style={[styles.pulseIconRing, { borderColor: COLORS.accentWarm + "40", backgroundColor: COLORS.accentWarm + "12" }]}>
          <Ionicons name="flag" size={20} color={COLORS.accentWarm} />
        </View>
        <Text style={styles.pulseTileLabel}>Next milestone</Text>
        <Text style={styles.pulseTileSub} numberOfLines={1}>
          {nextMs ? (nextMs.milestone.title || nextMs.goalName) : "All clear!"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── CAROUSEL CARD ────────────────────────────────────────────────────────────
function CarouselCard({ item, index, scrollX, onPress }) {
  const animStyle = useAnimatedStyle(() => {
    const x    = scrollX.value;
    const dist = index * ITEM_SIZE - (x + PADDING_LEFT);
    const norm = dist / ITEM_SIZE;
    const scale     = interpolate(Math.abs(norm), [0, 1], [1, 0.91], Extrapolate.CLAMP);
    const rotateVal = interpolate(norm, [-1, 0, 1], [5, 0, -5], Extrapolate.CLAMP);
    const safeRot   = Number.isFinite(rotateVal) ? rotateVal : 0;
    const translateY = interpolate(Math.abs(norm), [0, 1], [0, 14], Extrapolate.CLAMP);
    const opacity    = interpolate(Math.abs(norm), [0, 1], [1, 0.65], Extrapolate.CLAMP);
    return {
      transform: [{ translateY }, { scale }, { rotateZ: `${safeRot}deg` }],
      opacity,
    };
  });

  return (
    <Animated.View style={[styles.card, animStyle, { width: CARD_WIDTH, marginRight: CARD_SPACING }]}>
      <LinearGradient
        colors={item.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1.1, y: 1.2 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Large icon watermark */}
      <View style={styles.cardIconWatermark}>
        <Ionicons name={item.icon.replace("-outline", "")} size={100} color="rgba(255,255,255,0.07)" />
      </View>

      <Pressable
        onPress={() => onPress && onPress(item)}
        android_ripple={{ color: "rgba(255,255,255,0.15)" }}
        style={({ pressed }) => [styles.cardInner, pressed && { opacity: 0.92 }]}
      >
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={styles.cardIconBadge}>
            <Ionicons name={item.icon} size={18} color={COLORS.textOnGradient} />
          </View>
          <Ionicons name="arrow-forward-circle-outline" size={20} color="rgba(255,255,255,0.5)" />
        </View>

        {/* Title + count */}
        <View style={styles.cardMiddle}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Text style={styles.cardCount}>{item.value}</Text>
          <Text style={styles.cardSubtitle} numberOfLines={1}>{item.subtitle}</Text>
        </View>

        {/* Recent items */}
        {item.recentItems && item.recentItems.length > 0 && (
          <View style={styles.cardRecentWrap}>
            <View style={styles.cardDivider} />
            {item.recentItems.slice(0, 2).map((r, i) => (
              <View key={i} style={styles.cardRecentRow}>
                <View style={styles.cardRecentDot} />
                <Text style={styles.cardRecentText} numberOfLines={1}>
                  {r.title || r.goal_name || r.name || "Untitled"}
                </Text>
              </View>
            ))}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

// ─── PILL INDICATOR ──────────────────────────────────────────────────────────
const PillIndicator = ({ count, activeIndex }) => (
  <View style={styles.pillWrap}>
    {Array.from({ length: count }).map((_, i) => {
      const isActive = i === activeIndex;
      return (
        <View
          key={i}
          style={[
            styles.pillDot,
            isActive ? styles.pillDotActive : styles.pillDotInactive,
          ]}
        />
      );
    })}
  </View>
);

// ─── MAIN SCREEN ─────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const navigation = useNavigation();
  const { user, profile } = useApp(); // ✅ This will now re-render when profile updates
  const insets = useSafeAreaInsets();

  // Data states
  const [allTasks,         setAllTasks]         = useState([]);
  const [allGoals,         setAllGoals]         = useState([]);
  const [allNotes,         setAllNotes]         = useState([]);
  const [allJournalEntries,setAllJournalEntries] = useState([]);
  const [sharedGoals,      setSharedGoals]      = useState([]);

  // Derived
  const pendingTasks = allTasks.filter((t) => !t.completed);
  const completedTasks = allTasks.filter((t) => t.completed);
  const topTask     = pendingTasks.sort(
    (a, b) => new Date(a.due_date || 0) - new Date(b.due_date || 0)
  )[0];
  const activeGoals = allGoals.filter((g) => g.progress < 100);
  const sharedGoalsCount = sharedGoals.length;

  const top3SharedGoals = sharedGoals.slice(0, 3);
  const top3Journal = [...allJournalEntries]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, 3);
  const top3Notes = [...allNotes]
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    .slice(0, 3);
  const top3Goals = activeGoals.slice(0, 3);

  const focusBlockData = useMemo(() => ({
    id: "focus",
    title: "Today's Focus",
    icon: "checkmark-circle-outline",
    value: topTask ? topTask.title : "No task set — tap to add one",
    dueDateStr: topTask?.due_date || null,
    gradient: COLORS.gradientFocus,
    route: "Planner",
  }), [topTask]);

  const carouselData = useMemo(() => [
    {
      id: "sharedGoals",
      title: "Shared Goals",
      icon: "people-outline",
      value: sharedGoalsCount || 0,
      subtitle: sharedGoalsCount
        ? `${sharedGoalsCount} collaborative goal${sharedGoalsCount !== 1 ? "s" : ""}`
        : "No shared goals yet",
      gradient: COLORS.gradientSharedGoals,
      recentItems: top3SharedGoals,
      route: "Shared Goals",
    },
    {
      id: "journal",
      title: "Journal",
      icon: "book-outline",
      value: allJournalEntries.length || 0,
      subtitle: allJournalEntries.length
        ? `${allJournalEntries.length} entr${allJournalEntries.length !== 1 ? "ies" : "y"}`
        : "Start your story",
      gradient: COLORS.gradientJournal,
      recentItems: top3Journal,
      route: "Journal",
    },
    {
      id: "notes",
      title: "Notes",
      icon: "document-text-outline",
      value: allNotes.length || 0,
      subtitle: allNotes.length
        ? `${allNotes.length} captured idea${allNotes.length !== 1 ? "s" : ""}`
        : "Nothing saved yet",
      gradient: COLORS.gradientNotes,
      recentItems: top3Notes,
      route: "Notes",
    },
    {
      id: "goals",
      title: "Goals",
      icon: "trending-up-outline",
      value: activeGoals.length,
      subtitle: `${activeGoals.reduce((a, g) => a + (g.milestones?.length || 0), 0)} milestones ahead`,
      gradient: COLORS.gradientGoals,
      recentItems: top3Goals,
      route: "Goals",
    },
  ], [allJournalEntries, allNotes, activeGoals, sharedGoalsCount, top3Journal, top3Notes, top3Goals, top3SharedGoals]);

  // Animations
  const scrollX     = useSharedValue(0);
  const carouselRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const breathe = useSharedValue(1);
  useEffect(() => {
    breathe.value = withRepeat(
      withTiming(1.018, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
      -1, true
    );
  }, []);
  const breathStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breathe.value }],
  }));

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => { scrollX.value = e.contentOffset.x; },
    onMomentumEnd: (e) => {
      const idx = Math.round((e.contentOffset.x || 0) / ITEM_SIZE);
      runOnJS(setActiveIndex)(idx);
    },
  });

  // Supabase data fetch
  useEffect(() => {
    if (!user) return;
    const uid = user.id;

    const fetchTable = async (table, setter) => {
      const { data } = await supabase.from(table).select("*").eq("user_id", uid);
      if (data) setter(data);
    };

    fetchTable("planner", setAllTasks);
    fetchTable("goals", (raw) => {
      setAllGoals((raw || []).map((row) => {
        const ms   = Array.isArray(row.milestones) ? row.milestones : [];
        const done = ms.filter((m) => m.completed).length;
        const progress = ms.length
          ? Math.round((done / ms.length) * 100)
          : row.completed ? 100 : 0;
        return { ...row, progress };
      }));
    });
    fetchTable("notes", setAllNotes);
    fetchTable("journal", setAllJournalEntries);

    const plannerCh = supabase.channel(`home-planner-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "planner", filter: `user_id=eq.${uid}` },
        () => fetchTable("planner", setAllTasks))
      .subscribe();

    const goalsCh = supabase.channel(`home-goals-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "goals", filter: `user_id=eq.${uid}` },
        () => fetchTable("goals", (raw) => {
          setAllGoals((raw || []).map((row) => {
            const ms   = Array.isArray(row.milestones) ? row.milestones : [];
            const done = ms.filter((m) => m.completed).length;
            const progress = ms.length ? Math.round((done / ms.length) * 100) : row.completed ? 100 : 0;
            return { ...row, progress };
          }));
        }))
      .subscribe();

    const notesCh = supabase.channel(`home-notes-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notes", filter: `user_id=eq.${uid}` },
        () => fetchTable("notes", setAllNotes))
      .subscribe();

    const journalCh = supabase.channel(`home-journal-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "journal", filter: `user_id=eq.${uid}` },
        () => fetchTable("journal", setAllJournalEntries))
      .subscribe();

    return () => {
      supabase.removeChannel(plannerCh);
      supabase.removeChannel(goalsCh);
      supabase.removeChannel(notesCh);
      supabase.removeChannel(journalCh);
    };
  }, [user]);

  // ===== FIXED: Fetch shared goals properly =====
  const fetchSharedGoals = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      const { data, error } = await supabase
        .from("shared_goals")
        .select("*")
        .filter("participants", "cs", `["${user.id}"]`); // Fix: Proper JSON array containment syntax

      if (error) {
        console.error("Error fetching shared goals:", error);
        return;
      }

      if (data) {
        // Process each goal to ensure participant_details is an array
        const processedGoals = data.map(goal => ({
          ...goal,
          participant_details: Array.isArray(goal.participant_details) 
            ? goal.participant_details 
            : []
        }));
        
        setSharedGoals(processedGoals);
      }
    } catch (error) {
      console.error("Error in fetchSharedGoals:", error);
    }
  }, [user]);

  // Refetch whenever the screen is focused (e.g. returning from SharedGoalsScreen)
  useFocusEffect(
    useCallback(() => {
      fetchSharedGoals();
    }, [fetchSharedGoals])
  );

  // Realtime subscription — stays alive while component is mounted
  useEffect(() => {
    if (!user?.id) return;
    
    const channel = supabase
      .channel(`shared-goals-home-${user.id}`)
      .on(
        "postgres_changes",
        { 
          event: "*", 
          schema: "public", 
          table: "shared_goals" 
        },
        () => {
          // Refetch all shared goals when any change occurs
          fetchSharedGoals();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchSharedGoals]);

  const handleCardPress = (item) => {
    if (item.route) navigation.navigate(item.route);
  };

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Animated.ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
      >
        {/* ── HEADER ───────────────────────────────────────── */}
        <View style={styles.header}>
          {/* Left: menu + greeting */}
          <View style={styles.headerLeft}>
            <TouchableOpacity
              onPress={() => navigation.dispatch(DrawerActions.toggleDrawer())}
              style={styles.menuBtn}
              activeOpacity={0.7}
            >
              <Ionicons name="menu" size={20} color={COLORS.textPrimary} />
            </TouchableOpacity>
            <View style={styles.greetingBlock}>
              <Text style={styles.greetingEyebrow}>
                {new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
              </Text>
              <Text style={styles.greetingTitle}>
                {getGreeting()},{" "}
                <Text style={styles.greetingName}>{profile?.username || "Explorer"}</Text>
              </Text>
            </View>
          </View>

          {/* Right: add task + avatar */}
          <View style={styles.headerRight}>
            <Animated.View style={breathStyle}>
              <TouchableOpacity
                style={styles.addTaskBtn}
                onPress={() => navigation.navigate("Planner")}
                activeOpacity={0.8}
              >
                <Ionicons name="add" size={18} color={COLORS.accentBlush} />
                <Text style={styles.addTaskText}>Add Task</Text>
              </TouchableOpacity>
            </Animated.View>

            <TouchableOpacity
              onPress={() => navigation.navigate("Settings")}
              style={styles.avatarBtn}
              activeOpacity={0.85}
            >
              {profile?.profilePic ? (
                <Image 
                  key={profile.profilePic}
                  source={{ uri: profile.profilePic }} 
                  style={styles.avatarImg}
                  onError={(e) => {
                   
                    // Optionally set a fallback
                  }}
                />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitial}>
                    {(profile?.username || user?.email || "U")[0].toUpperCase()}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* ── FOCUS BLOCK ──────────────────────────────────── */}
        <FocusBlock
          item={focusBlockData}
          onPress={handleCardPress}
          pendingCount={pendingTasks.length}
          completedCount={completedTasks.length}
        />

        {/* ── MOMENTUM PULSE ───────────────────────────────── */}
        <MomentumPulse
          allTasks={allTasks}
          allNotes={allNotes}
          allJournalEntries={allJournalEntries}
          allGoals={allGoals}
          navigation={navigation}
        />

        {/* ── SECTION HEADER ───────────────────────────────── */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Explore</Text>
          <Text style={styles.sectionHint}>Swipe to navigate</Text>
        </View>

        {/* ── CAROUSEL ─────────────────────────────────────── */}
        <View style={styles.carouselWrap}>
          <Animated.ScrollView
            ref={carouselRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={ITEM_SIZE}
            decelerationRate="fast"
            contentContainerStyle={{
              paddingLeft: PADDING_LEFT,
              paddingRight: PADDING_LEFT,
              alignItems: "center",
            }}
            onScroll={scrollHandler}
            scrollEventThrottle={16}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round((e.nativeEvent.contentOffset.x || 0) / ITEM_SIZE);
              setActiveIndex(idx);
            }}
          >
            {carouselData.map((c, i) => (
              <CarouselCard key={c.id} item={c} index={i} scrollX={scrollX} onPress={handleCardPress} />
            ))}
          </Animated.ScrollView>

          {/* Pill indicator */}
          <PillIndicator count={carouselData.length} activeIndex={activeIndex} />
        </View>
      </Animated.ScrollView>
    </View>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.backgroundBase,
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },

  // ── Header ────────────────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 22,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  menuBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.card,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 4,
  },
  greetingBlock: {
    marginLeft: 12,
    flex: 1,
  },
  greetingEyebrow: {
    fontSize: 12,
    color: COLORS.textTertiary,
    fontWeight: "500",
    letterSpacing: 0.2,
  },
  greetingTitle: {
    fontSize: 19,
    fontWeight: "400",
    color: COLORS.textPrimary,
    letterSpacing: -0.3,
    marginTop: 1,
  },
  greetingName: {
    fontWeight: "700",
    color: COLORS.textPrimary,
  },
  addTaskBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.accentBlush + "30",
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 3,
  },
  addTaskText: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.accentBlush,
    marginLeft: 5,
  },
  avatarBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: COLORS.accentBlush + "50",
    overflow: "hidden",
    marginLeft: 10,
  },
  avatarImg: {
    width: "100%",
    height: "100%",
    borderRadius: 19,
  },
  avatarPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: COLORS.accentBlush + "30",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.accentBlush,
  },

  // ── Focus Block ──────────────────────────────────────
  focusBlock: {
    height: 172,
    borderRadius: 26,
    overflow: "hidden",
    marginBottom: 16,
    shadowColor: "#1c1950",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.28,
    shadowRadius: 22,
    elevation: 12,
  },
  focusIconWatermark: {
    position: "absolute",
    right: -18,
    bottom: -18,
  },
  focusInner: {
    flex: 1,
    padding: 22,
    justifyContent: "space-between",
  },
  focusTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  focusLabelPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  focusPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: COLORS.textOnGradient,
    letterSpacing: 0.8,
  },
  urgencyBadge: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  urgencyText: {
    fontSize: 11,
    fontWeight: "700",
  },
  focusTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: COLORS.textOnGradient,
    letterSpacing: -0.5,
    lineHeight: 28,
    marginVertical: 8,
  },
  focusBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  focusProgressWrap: {
    flex: 1,
    marginRight: 12,
  },
  focusProgressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginBottom: 5,
    overflow: "hidden",
  },
  focusProgressFill: {
    height: "100%",
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.75)",
  },
  focusProgressLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: "rgba(255,255,255,0.65)",
  },
  focusNavArrow: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Stats Strip ──────────────────────────────────────
  pulseRow: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: COLORS.card,
    borderRadius: 22,
    paddingVertical: 18,
    paddingHorizontal: 6,
    marginBottom: 24,
    shadowColor: COLORS.warmShadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 18,
    elevation: 5,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  pulseTile: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 4,
  },
  pulseDivider: {
    width: 1,
    backgroundColor: COLORS.cardBorder,
    marginVertical: 4,
  },
  pulseIconRing: {
    width: 46,
    height: 46,
    borderRadius: 15,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 0,
  },
  pulseLiveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    position: "absolute",
    top: -2,
    right: -2,
    borderWidth: 1.5,
    borderColor: COLORS.card,
  },
  pulseTileLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.textSecondary,
    marginTop: 8,
    marginBottom: 2,
  },
  pulseTileSub: {
    fontSize: 11,
    fontWeight: "500",
    color: COLORS.textTertiary,
    textAlign: "center",
  },

  // ── Section Row ──────────────────────────────────────
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.textPrimary,
    letterSpacing: -0.3,
  },
  sectionHint: {
    fontSize: 12,
    color: COLORS.textTertiary,
    fontWeight: "400",
  },

  // ── Carousel ─────────────────────────────────────────
  carouselWrap: {
    marginLeft: -20,
    marginRight: -20,
    marginBottom: 10,
  },
  card: {
    height: 230,
    borderRadius: 24,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 10,
  },
  cardIconWatermark: {
    position: "absolute",
    right: -10,
    bottom: -10,
    opacity: 1,
  },
  cardInner: {
    flex: 1,
    padding: 20,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  cardIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  cardMiddle: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255,255,255,0.7)",
    letterSpacing: 0.3,
    marginBottom: 3,
  },
  cardCount: {
    fontSize: 38,
    fontWeight: "800",
    color: COLORS.textOnGradient,
    letterSpacing: -1.5,
    lineHeight: 44,
  },
  cardSubtitle: {
    fontSize: 13,
    color: "rgba(255,255,255,0.6)",
    fontWeight: "400",
    marginTop: 2,
  },
  cardRecentWrap: {
    marginTop: 8,
  },
  cardDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.15)",
    marginBottom: 8,
  },
  cardRecentRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  cardRecentDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.45)",
    marginRight: 7,
  },
  cardRecentText: {
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
    flex: 1,
    fontWeight: "400",
  },

  // ── Pill Indicator ───────────────────────────────────
  pillWrap: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 16,
  },
  pillDot: {
    height: 4,
    borderRadius: 2,
    marginHorizontal: 3,
  },
  pillDotActive: {
    width: 22,
    backgroundColor: COLORS.accentBlush,
    opacity: 1,
  },
  pillDotInactive: {
    width: 6,
    backgroundColor: COLORS.textTertiary,
    opacity: 0.5,
  },
});