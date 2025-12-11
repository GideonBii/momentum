// screens/HomeScreen.js
import { Ionicons } from "@expo/vector-icons";
import { DrawerActions, useNavigation } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { useApp } from "../context/AppContext";
import { db } from "../firebaseConfig";

// Reanimated v2
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

//
// THEME: White-first + Nude accents (minimal, rounded aesthetic)
//
const COLORS = {
  backgroundBase: "#FAFAFA",
  backgroundLayer: "#FAFAFA",
  card: "#FFFFFF",
  textPrimary: "#4A3228",
  textSecondary: "#A98467",
  accentBlush: "#D8A39D",
  accentWarm: "#E3B777",
  nudeShadow: "rgba(216,163,157,0.12)",
  shadowDark: "rgba(0,0,0,0.06)",
  
  gradientFocus: ["#1b1a5eff", "#B37D77"],
  gradientJournal: ["#811855ff", "#D18E4E"],
  gradientGoals: ["#795D94", "#5C4673"],
  gradientNotes: ["#5D8B7E", "#3A665A"],

  textOnGradient: "#FFFFFF",
};

const { width } = Dimensions.get("window");
const SPACING = 16;
const CARD_WIDTH = Math.round(width * 0.65); 
const ITEM_SIZE = CARD_WIDTH + SPACING; 
const PADDING_LEFT = 20; 


//
// Dedicated Focus Block (Main task visualization)
//
const FocusBlock = ({ item, onPress }) => (
    <View style={styles.focusBlockWrapper}>
        <Pressable
            onPress={() => onPress && onPress(item)}
            android_ripple={{ color: COLORS.textOnGradient + '40' }}
            style={({ pressed }) => [styles.focusBlock, pressed && { transform: [{ scale: 0.99 }] }]}
        >
            <LinearGradient
                colors={item.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
            />
            <View style={styles.focusBlockInner}>
                <View style={styles.focusBlockTop}>
                    <View>
                        <Text style={[styles.cardLabel, { color: COLORS.textOnGradient + 'cc' }]}>{item.title.toUpperCase()}</Text> 
                    </View>
                    <Ionicons name={item.icon} size={32} color={COLORS.textOnGradient} />
                </View>
                
                <Text style={[styles.focusBlockValue, { color: COLORS.textOnGradient }]} numberOfLines={2}> 
                    {typeof item.value === "number" ? item.value : item.value}
                </Text>

                <Text style={[styles.focusBlockSubtitle, { color: COLORS.textOnGradient + 'aa' }]} numberOfLines={1}>
                    {item.subtitle}
                </Text>
            </View>
        </Pressable>
    </View>
);


//
// Carousel Card (Displays top 3 items)
//
function CarouselCard({ item, index, scrollX, onPress }) {
  const animatedStyle = useAnimatedStyle(() => {
    const x = scrollX.value;
    const centerOffset = index * ITEM_SIZE; 
    const dist = centerOffset - (x + PADDING_LEFT); 

    const norm = dist / ITEM_SIZE; 

    const scale = interpolate(Math.abs(norm), [0, 1], [1, 0.92], Extrapolate.CLAMP);
    const rotate = interpolate(norm, [-1, 0, 1], ["6deg", "0deg", "-6deg"], Extrapolate.CLAMP);
    const translateY = interpolate(Math.abs(norm), [0, 1], [0, 12], Extrapolate.CLAMP);
    const opacity = interpolate(Math.abs(norm), [0, 1], [1, 0.72], Extrapolate.CLAMP);

    return {
      transform: [{ translateY }, { scale }, { rotateZ: rotate }],
      opacity,
    };
  });

  return (
    <Animated.View style={[
      styles.card, 
      animatedStyle, 
      { 
        width: CARD_WIDTH,
        marginRight: SPACING,
        marginHorizontal: 0,
      }
    ]}>
      
      <LinearGradient
        colors={item.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <Pressable
        onPress={() => {
            onPress && onPress(item);
        }}
        android_ripple={{ color: COLORS.textOnGradient + '40' }}
        style={({ pressed }) => [styles.cardInner, pressed && { transform: [{ scale: 0.986 }] }]}
      >
        <View style={styles.cardTop}>
  <View>
    <Text style={[styles.cardLabel, { color: COLORS.textOnGradient + 'cc' }]}>{item.title}</Text> 
  </View>
  <Ionicons name={item.icon} size={28} color={COLORS.textOnGradient} />
</View>
        
        <Text style={[styles.cardValue, { color: COLORS.textOnGradient }]}> 
          {typeof item.value === "number" ? item.value : item.value}
        </Text>

        <Text style={[styles.cardSubtitle, { color: COLORS.textOnGradient + 'aa' }]} numberOfLines={2}>
          {item.subtitle}
        </Text>

        {item.recentItems && item.recentItems.length > 0 && (
          <View style={styles.cardRecent}>
            {item.recentItems.slice(0, 3).map((r, i) => (
              <Text key={i} style={[styles.cardRecentText, { color: COLORS.textOnGradient + 'aa' }]} numberOfLines={1}> 
                • {r.title || r.taskName || r.name || "Untitled"}
              </Text>
            ))}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

//
// Active Dot Indicator Component 
//
const DotIndicator = ({ index, activeIndex, dotAnim }) => {
    const isActive = index === activeIndex;

    const dotAnimatedStyle = useAnimatedStyle(() => {
        const scale = interpolate(dotAnim.value, [0, 1], [1, 1.8]); 
        const opacity = interpolate(dotAnim.value, [0, 1], [0.4, 1]);
        const shadowOpacity = interpolate(dotAnim.value, [0, 1], [0, 0.8]); 
        
        return {
            transform: [{ scale }],
            opacity,
            shadowOpacity,
            backgroundColor: isActive ? COLORS.accentBlush : COLORS.textSecondary + '40',
        };
    });

    useEffect(() => {
        dotAnim.value = withTiming(isActive ? 1 : 0, { duration: 300, easing: Easing.inOut(Easing.ease) });
    }, [isActive, dotAnim]);

    return (
        <Animated.View style={[styles.dotBase, dotAnimatedStyle]} />
    );
};

//
// Quick Stats Card Component (Updated for Goals and Milestones)
//
const QuickStatsCard = ({ goalsCompleted, milestonesCompleted }) => (
    <View style={styles.quickStatsCard}>
        <Text style={styles.quickStatsTitle}>Goals Progress</Text>
        <View style={styles.quickStatsRow}>
            <View style={styles.statPillLarge}>
                <View style={styles.statPillHeader}>
                    <Ionicons name="analytics-outline" size={24} color={COLORS.accentBlush} /> 
                    <Text style={styles.statValue}>{goalsCompleted}</Text> 
                </View>
                <Text style={styles.statLabel}>Goals Completed</Text>
            </View>

            <View style={styles.statSeparator} />

            <View style={styles.statPillLarge}>
                <View style={styles.statPillHeader}>
                    <Ionicons name="flag-outline" size={24} color={COLORS.accentWarm} />
                    <Text style={styles.statValue}>{milestonesCompleted}</Text> 
                </View>
                <Text style={styles.statLabel}>Milestones Achieved</Text>
            </View>
        </View>
    </View>
);


export default function HomeScreen() {
  const navigation = useNavigation();
  const { user } = useApp();
  
  // Data states
  const [backlogCount, setBacklogCount] = useState(0); 
  const [completedCount, setCompletedCount] = useState(0); 
  const [streak, setStreak] = useState(0); 
  const [userProfile, setUserProfile] = useState({});
  const [allTasks, setAllTasks] = useState([]);
  const [allGoals, setAllGoals] = useState([]);
  const [allNotes, setAllNotes] = useState([]);
  const [allJournalEntries, setAllJournalEntries] = useState([]); // ← NEW

  // derived content
  const topTask = allTasks
    .filter((t) => !t.completed)
    .sort((a, b) => (a.dueDate?.seconds || 0) - (b.dueDate?.seconds || 0))[0];
  const activeGoals = allGoals.filter((g) => g.status !== "completed");
  const pendingTasks = allTasks.filter((t) => !t.completed); 

  // Goal Stats Calculation
  const goalsCompletedCount = allGoals.filter(g => g.status === 'completed').length;
  const milestonesCompletedCount = allGoals.reduce((total, goal) => {
      return total + (goal.milestones?.filter(m => m.completed).length || 0);
  }, 0);

  // ← FIXED: Now uses real journal entries
  const top3Journal = allJournalEntries
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
    .slice(0, 3);

  const top3Notes = allNotes.sort(
    (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
  ).slice(0, 3);

  const top3Goals = activeGoals.slice(0, 3);

  const focusBlockData = useMemo(() => ({
    id: "focus",
    title: "Today's Focus",
    icon: "checkmark-circle-outline",
    value: topTask ? topTask.title : "No Top Task Set",
    subtitle: topTask
      ? `Due: ${topTask.dueDate ? new Date(topTask.dueDate.seconds * 1000).toLocaleDateString() : "No Deadline"}`
      : "Tap 'Add Task' to set a primary focus",
    gradient: COLORS.gradientFocus, 
    route: "Planner",
  }), [topTask]);

  const carouselData = useMemo(
    () => [
      // 1. Journal – NOW USES REAL JOURNAL DATA
      {
        id: "journal",
        title: "Journal",
        icon: "book-outline", 
        value: allJournalEntries.length || 0,
        subtitle: allJournalEntries.length 
          ? `${allJournalEntries.length} journal entries`
          : "No entries yet",
        gradient: COLORS.gradientJournal,
        recentItems: top3Journal,
        route: "Journal",
      },
      // 2. Notes
      {
        id: "notes",
        title: "Notes",
        icon: "document-text-outline", 
        value: allNotes.length || 0,
        subtitle: `${allNotes.length} captured ideas`,
        gradient: COLORS.gradientNotes, 
        recentItems: top3Notes,
        route: "Notes",
      },
      // 3. Goals
      {
        id: "goals",
        title: "Goals",
        icon: "trending-up-outline",
        value: activeGoals.length,
        subtitle: `${activeGoals.reduce((acc, g) => acc + (g.milestones?.length || 0), 0)} milestones to achieve`,
        gradient: COLORS.gradientGoals,
        recentItems: top3Goals,
        route: "Goals",
      },
    ],
    [allJournalEntries, allNotes, activeGoals, top3Journal, top3Notes, top3Goals]
  );
  
  // Reanimated shared values
  const scrollX = useSharedValue(0);
  const carouselRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const dotAnimShared = useRef(Array(carouselData.length).fill(0).map(() => useSharedValue(0))).current;

  // breathing for Add Task
  const breathe = useSharedValue(1);
  useEffect(() => {
    breathe.value = withRepeat(withTiming(1.02, { duration: 1500, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [breathe]);
  const breathStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: breathe.value }],
      shadowOpacity: interpolate(breathe.value, [1, 1.02], [0.12, 0.17]),
    };
  });
  
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
    onMomentumEnd: (event) => {
      const x = event.contentOffset.x || 0;
      const idx = Math.round(x / ITEM_SIZE);
      runOnJS(setActiveIndex)(idx);
    },
  });

  // firestore listeners 
  useEffect(() => {
    if (!user) return;
    const uid = user.uid;

    const unsubProfile = onSnapshot(doc(db, "users", uid), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        const emailPrefix = (user.email || "Explorer").split("@")[0];
        const defaultUsername = emailPrefix.replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

        setUserProfile({
          username: d.username || user.displayName || defaultUsername,
          profilePic: d.profilePic || d.photoURL || null,
        });
        setStreak(d.streak || 0);
      } else {
        const emailPrefix = (user.email || "Explorer").split("@")[0];
        const defaultUsername = emailPrefix.replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        setUserProfile({ username: defaultUsername, profilePic: null });
      }
    });

    const listenTo = (colName, setter) => {
      const q = query(collection(db, colName), where("userId", "==", uid));
      return onSnapshot(
        q,
        (snap) => {
          const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setter(items);
        },
        (err) => console.error(`listen ${colName} err`, err)
      );
    };

    const unsubTasks = listenTo("planner", (tasks) => {
      setAllTasks(tasks);
      const pending = tasks.filter((t) => !t.completed);
      setBacklogCount(pending.length);
      setCompletedCount(tasks.filter((t) => t.completed).length);
    });

    const unsubGoals = listenTo("goals", setAllGoals);
    const unsubNotes = listenTo("notes", setAllNotes); 
    const unsubJournal = listenTo("journal", setAllJournalEntries); // ← ADDED

    return () => {
      unsubProfile();
      unsubTasks();
      unsubGoals();
      unsubNotes();
      unsubJournal(); // ← CLEANUP
    };
  }, [user]);


  const handleCardPress = (item) => {
    if (item.route) navigation.navigate(item.route);
  };


  return (
    <View style={{ flex: 1, backgroundColor: COLORS.backgroundBase }}>
      <SafeAreaView style={styles.safeArea}>
        <Animated.ScrollView 
            contentContainerStyle={styles.container} 
            showsVerticalScrollIndicator={false} 
            onScroll={scrollHandler} 
            scrollEventThrottle={16}
        >
          {/* Header */}
          <View style={[styles.headerRow, styles.headerRowModified]}>
            <View style={styles.headerLeft}>
                <TouchableOpacity onPress={() => navigation.dispatch(DrawerActions.toggleDrawer())} style={styles.menuBtn}>
                  <Ionicons name="menu" size={20} color={COLORS.textPrimary} />
                </TouchableOpacity>

                <View style={styles.greetingWrap}>
                  <Text style={styles.greetingDate}>
                    {new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
                  </Text>
                  <Text style={styles.greetingTitle}>
                    Hello, <Text style={{ fontWeight: "700" }}>{userProfile.username || "Explorer"}</Text>
                  </Text>
                </View>
            </View>

            <View style={styles.headerRight}>
              <Animated.View style={[styles.primaryPillWrapper, breathStyle]}>
                <TouchableOpacity style={styles.primaryPillTouchable} onPress={() => navigation.navigate("Planner")}>
                  <Ionicons name="add" size={18} color={COLORS.accentBlush} />
                  <Text style={[styles.primaryPillText, { color: COLORS.accentBlush }]}>Add Task</Text>
                </TouchableOpacity>
              </Animated.View>

              <TouchableOpacity onPress={() => navigation.navigate("Settings")} style={styles.settingsBtn}>
                <Ionicons name="settings-outline" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>
          
          {/* Dedicated Focus Block */}
          <FocusBlock item={focusBlockData} onPress={handleCardPress} />

          {/* Dedicated Quick Stats Card */}
          <QuickStatsCard 
            goalsCompleted={goalsCompletedCount} 
            milestonesCompleted={milestonesCompletedCount} 
          />

          {/* Section for Carousel */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Explore</Text>
            <Text style={styles.sectionSub}>Swipe to browse your content</Text>
          </View>

          {/* Carousel */}
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
                const x = e.nativeEvent.contentOffset.x || 0;
                const idx = Math.round(x / ITEM_SIZE);
                setActiveIndex(idx);
              }}
            >
              {carouselData.map((c, i) => (
                <CarouselCard key={c.id} item={c} index={i} scrollX={scrollX} onPress={handleCardPress} />
              ))}
            </Animated.ScrollView>

            {/* Dot Indicator */}
            <View style={styles.dotIndicatorWrap}>
                {carouselData.map((_, i) => (
                    <DotIndicator 
                        key={i} 
                        index={i} 
                        activeIndex={activeIndex} 
                        dotAnim={dotAnimShared[i]}
                    />
                ))}
            </View>
          </View>

          <View style={{ height: 40 }} /> 
        </Animated.ScrollView>
      </SafeAreaView>
    </View>
  );
}

//
// Styles 
//
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.backgroundBase },
  container: { 
    paddingHorizontal: 20, 
    paddingTop: 18, 
    paddingBottom: 40, 
    backgroundColor: COLORS.backgroundLayer 
  }, 

  // header
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6, paddingTop: 6 },
  headerRowModified: { marginBottom: 18 },
  headerLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  headerRight: { flexDirection: "row", alignItems: "center" },

  menuBtn: {
    width: 44,
    height: 44,
    borderRadius: 28,
    backgroundColor: COLORS.card,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 14,
    elevation: 4,
  },
  greetingWrap: { flex: 1, marginLeft: 12 },
  greetingDate: { fontSize: 13, color: COLORS.textSecondary, fontWeight: "600" },
  greetingTitle: { fontSize: 20, fontWeight: "700", color: COLORS.textPrimary, letterSpacing: -0.4 }, 

  settingsBtn: { 
    width: 46, 
    height: 46, 
    borderRadius: 24, 
    marginLeft: 12, 
    backgroundColor: COLORS.card,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 14,
    elevation: 4,
  },

  primaryPillWrapper: {
    borderRadius: 24,
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.8, 
    shadowRadius: 16,
    elevation: 6,
  },
  primaryPillTouchable: {
    backgroundColor: COLORS.card,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 0.5,
    borderColor: COLORS.accentBlush + "22",
  },
  primaryPillText: { color: COLORS.accentBlush, marginLeft: 8, fontWeight: "700" }, 

  // Focus Block Styles
  focusBlockWrapper: { marginBottom: 24 },
  focusBlock: {
    height: 140,
    borderRadius: 24,
    overflow: 'hidden', 
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 12 }, 
    shadowOpacity: 0.8,
    shadowRadius: 20, 
    elevation: 10,
    borderWidth: 0.5,
    borderColor: COLORS.accentBlush + "06",
  },
  focusBlockInner: { flex: 1, padding: 20, justifyContent: "space-between" },
  focusBlockTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  cardLabel: { fontSize: 12, fontWeight: "800" }, 
  focusBlockValue: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5 }, 
  focusBlockSubtitle: { fontSize: 14, fontWeight: "600" },

  // Quick Stats Card 
  quickStatsCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 18,
    marginBottom: 24,
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.8,
    shadowRadius: 18,
    elevation: 6,
  },
  quickStatsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 12,
  },
  quickStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statPillLarge: {
    flex: 1,
    alignItems: 'flex-start',
    paddingHorizontal: 10,
  },
  statPillHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  statValue: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginLeft: 10,
    letterSpacing: -1,
  },
  statLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  statSeparator: {
    width: 1,
    height: '80%',
    backgroundColor: COLORS.textSecondary + '20',
    marginHorizontal: 10,
  },

  // section
  sectionHeader: { marginTop: 6, marginBottom: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: COLORS.textPrimary }, 
  sectionSub: { fontSize: 12, color: COLORS.textSecondary },

  // carousel & cards
  carouselWrap: { marginBottom: 12 },
  card: {
    height: 220,
    borderRadius: 22,
    backgroundColor: COLORS.card, 
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 10 }, 
    shadowOpacity: 0.8,
    shadowRadius: 20, 
    elevation: 8,
    overflow: 'hidden', 
    borderWidth: 0.5,
    borderColor: COLORS.accentBlush + "06",
  },
  cardInner: { flex: 1, padding: 18, justifyContent: "space-between" },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardValue: { fontSize: 26, fontWeight: "800", marginTop: 6 }, 
  cardSubtitle: { fontSize: 13, marginTop: 4 }, 
  cardRecent: { marginTop: 4 }, 
  cardRecentText: { fontSize: 12, lineHeight: 18 }, 
  
  // Dot Indicator
  dotIndicatorWrap: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 18,
    height: 20, 
  },
  dotBase: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginHorizontal: 5,
    shadowColor: COLORS.accentBlush, 
    shadowOffset: { width: 0, height: 0 },
    elevation: 4, 
  },
});