// screens/GoalsScreen.js - COMPLETE ENHANCED VERSION
// Add these new imports at the top (if not already present)
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from "@react-native-community/datetimepicker";
import { useNavigation } from "@react-navigation/native";
import * as Notifications from 'expo-notifications';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { Circle, Svg } from "react-native-svg";
import { useApp } from "../context/AppContext";
import { db } from "../firebaseConfig";
import { sendNotification } from "../utils/notifications";

const { width } = Dimensions.get("window");

// --- NOTIFICATION CONFIG ---
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Theme - Enhanced with new colors
const COLORS = {
  backgroundBase: "#FAFAFA",
  layer: "#FAFAFA",
  card: "#FFFFFF",
  textPrimary: "#4A3228",
  textSecondary: "#A98467",
  accentBlush: "#D8A39D",
  accent: "#A98467",
  lightBorder: "#E0E0E0",
  completedText: "#888",
  error: "#D64545",
  nudeShadow: "rgba(216,163,157,0.12)",
  owner: "#A98467",
  collaborator: "#D8A39D",
  success: "#4CAF50",
  warning: "#FF9800",
  archived: "#95A5A6",
  template: "#9B59B6",
  recurring: "#1ABC9C",
  chartGrid: "#F0F0F0",
  priority: {
    high: "#E74C3C",
    medium: "#F39C12",
    low: "#3498DB",
  }
};

const PRIORITY_OPTIONS = [
  { value: "high", label: "High", color: COLORS.priority.high },
  { value: "medium", label: "Medium", color: COLORS.priority.medium },
  { value: "low", label: "Low", color: COLORS.priority.low },
];

const CATEGORY_OPTIONS = [
  { value: "personal", label: "Personal", icon: "person" },
  { value: "work", label: "Work", icon: "briefcase" },
  { value: "health", label: "Health", icon: "fitness" },
  { value: "learning", label: "Learning", icon: "school" },
  { value: "finance", label: "Finance", icon: "cash" },
  { value: "other", label: "Other", icon: "ellipsis-horizontal" },
];

const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

const getSharedGoalsCollectionPath = (appId) =>
  `artifacts/${appId || "default-app-id"}/public/data/sharedGoals`;

// Enhanced docToGoal function with new fields
const docToGoal = (d, isOwner = true, sharedDocId = null, ownerId = null) => {
  const data = d.data ? d.data() : d;
  const id = d.id;
  const milestones = data.milestones || [];
  const completed = milestones.filter((m) => m.completed).length;
  const progress = milestones.length ? Math.round((completed / milestones.length) * 100) : 0;
  
  const dueDate = data.dueDate?.toDate ? data.dueDate.toDate() : (data.dueDate ? new Date(data.dueDate) : new Date());
  const today = new Date();
  const daysRemaining = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
  
  // Calculate time spent
  const totalTimeSpent = data.timeEntries ? 
    data.timeEntries.reduce((sum, entry) => sum + (entry.duration || 0), 0) : 0;
  
  return {
    id: id,
    ...data,
    dueDate,
    milestones,
    progress,
    daysRemaining,
    isOwner,
    isCollaborator: !isOwner,
    sharedDocId,
    ownerId: ownerId || data.userId,
    priority: data.priority || "medium",
    category: data.category || "personal",
    tags: data.tags || [],
    archived: data.archived || false,
    isTemplate: data.isTemplate || false,
    recurrence: data.recurrence || { type: 'none', interval: 1 },
    timeEntries: data.timeEntries || [],
    totalTimeSpent,
    estimatedTime: data.estimatedTime || 0,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt || new Date()),
  };
};

export default function GoalsScreen() {
  const navigation = useNavigation();
  const { user, appId } = useApp();

  // --- Form State ---
  const [goalTitle, setGoalTitle] = useState("");
  const [goalDescription, setGoalDescription] = useState("");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isFormModalVisible, setIsFormModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentGoal, setCurrentGoal] = useState(null);
  const [selectedPriority, setSelectedPriority] = useState("medium");
  const [selectedCategory, setSelectedCategory] = useState("personal");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState([]);

  // --- Goals State ---
  const [goals, setGoals] = useState([]);
  const ownedGoalsCache = useRef([]);
  const sharedMetadataCache = useRef([]);

  // --- Filtering & Sorting ---
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [sortBy, setSortBy] = useState("dueDate");
  const [showCompleted, setShowCompleted] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // --- Modals & Loading ---
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalMessage, setModalMessage] = useState("");
  const [showFiltersModal, setShowFiltersModal] = useState(false);

  // --- Milestones ---
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");
  const [newMilestoneDueDate, setNewMilestoneDueDate] = useState(new Date());
  const [showMilestoneDatePicker, setShowMilestoneDatePicker] = useState(false);
  const [expandedGoalId, setExpandedGoalId] = useState(null);
  const [goalMilestones, setGoalMilestones] = useState([]);

  // --- Share Modal State ---
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [shareGoal, setShareGoal] = useState(null);
  const [shareEmail, setShareEmail] = useState("");
  const [shareCollaborators, setShareCollaborators] = useState([]);
  const [shareEmailError, setShareEmailError] = useState("");

  // --- Notifications State ---
  const [notifications, setNotifications] = useState([]);
  const notificationsUnsub = useRef(null);

  // --- NEW ENHANCEMENT STATES ---
  const [archivedGoals, setArchivedGoals] = useState([]);
  const [goalTemplates, setGoalTemplates] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState('none');
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);
  const [timeTracking, setTimeTracking] = useState({});
  const [activeTimer, setActiveTimer] = useState(null);
  const [analyticsView, setAnalyticsView] = useState('list');
  const [showExportModal, setShowExportModal] = useState(false);
  const [estimatedHours, setEstimatedHours] = useState("");

  // --- Statistics ---
  const [stats, setStats] = useState({
    total: 0,
    completed: 0,
    inProgress: 0,
    overdue: 0,
    archived: 0,
    avgProgress: 0,
    totalTimeSpent: 0,
    categoryStats: {},
  });

  const showMessage = (message) => {
    setModalMessage(message);
    setShowModal(true);
    setTimeout(() => setShowModal(false), 3000);
  };

  // --- SETUP LOCAL NOTIFICATIONS ---
  useEffect(() => {
    async function registerForPushNotificationsAsync() {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        console.log('Failed to get push token for push notification!');
        return;
      }
    }

    registerForPushNotificationsAsync();
  }, []);

  // --- OFFLINE FIRST: LOAD CACHE ---
  useEffect(() => {
    const loadCachedGoals = async () => {
      try {
        const cached = await AsyncStorage.getItem(`goals_cache_${user?.uid}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          const hydrated = parsed.map(g => ({
            ...g,
            dueDate: new Date(g.dueDate),
            milestones: g.milestones.map(m => ({
              ...m, 
              createdAt: m.createdAt ? new Date(m.createdAt) : new Date(),
              dueDate: m.dueDate ? new Date(m.dueDate) : null
            }))
          }));
          setGoals(hydrated);
        }
      } catch (e) {
        console.error("Failed to load cached goals", e);
      }
    };
    if (user) loadCachedGoals();
  }, [user]);

  // --- CALCULATE STATISTICS ---
  useEffect(() => {
    const total = goals.length;
    const completed = goals.filter(g => g.progress === 100).length;
    const inProgress = goals.filter(g => g.progress > 0 && g.progress < 100).length;
    const overdue = goals.filter(g => g.daysRemaining < 0 && g.progress < 100).length;
    const archivedCount = goals.filter(g => g.archived).length;
    
    // Calculate average progress
    const avgProgress = goals.length > 0 
      ? Math.round(goals.reduce((sum, g) => sum + g.progress, 0) / goals.length)
      : 0;
    
    // Calculate total time spent
    const totalTimeSpent = goals.reduce((sum, g) => sum + (g.totalTimeSpent || 0), 0);
    
    // Calculate completion rate by category
    const categoryStats = {};
    goals.forEach(g => {
      if (!categoryStats[g.category]) {
        categoryStats[g.category] = { total: 0, completed: 0 };
      }
      categoryStats[g.category].total++;
      if (g.progress === 100) categoryStats[g.category].completed++;
    });

    setStats({ 
      total, 
      completed, 
      inProgress, 
      overdue,
      archived: archivedCount,
      avgProgress,
      totalTimeSpent: Math.floor(totalTimeSpent / 3600),
      categoryStats
    });

    // Check for upcoming milestones and schedule notifications
    scheduleMilestoneNotifications(goals);

  }, [goals]);

  // --- NOTIFICATION SCHEDULER ---
  const scheduleMilestoneNotifications = async (currentGoals) => {
    await Notifications.cancelAllScheduledNotificationsAsync();

    const today = new Date();
    
    for (const goal of currentGoals) {
      if (goal.daysRemaining > 0 && goal.daysRemaining <= 3) {
        const triggerDate = new Date(goal.dueDate);
        triggerDate.setHours(9, 0, 0, 0);
        
        if (triggerDate > today) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "Goal Due Soon!",
              body: `"${goal.title}" is due in ${goal.daysRemaining} day(s)`,
              data: { goalId: goal.id, type: "goal_reminder" },
            },
            trigger: triggerDate,
          });
        }
      }

      const incompleteMilestones = goal.milestones.filter(m => !m.completed && m.dueDate);
      for (const milestone of incompleteMilestones) {
        const milestoneDueDate = milestone.dueDate?.toDate ? milestone.dueDate.toDate() : new Date(milestone.dueDate);
        const daysUntilMilestone = Math.ceil((milestoneDueDate - today) / (1000 * 60 * 60 * 24));
        
        if (daysUntilMilestone > 0 && daysUntilMilestone <= 3) {
          const triggerDate = new Date(milestoneDueDate);
          triggerDate.setHours(9, 0, 0, 0);
          
          if (triggerDate > today) {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: "Milestone Due Soon!",
                body: `"${milestone.title}" for "${goal.title}" is due in ${daysUntilMilestone} day(s)`,
                data: { 
                  goalId: goal.id, 
                  milestoneTitle: milestone.title,
                  type: "milestone_reminder" 
                },
              },
              trigger: triggerDate,
            });
          }
        }
      }
    }
  };

  // --- NOTIFICATIONS LISTENER ---
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "notifications"),
      where("toUid", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setNotifications(list);
    });

    notificationsUnsub.current = unsub;
    return () => {
      if (notificationsUnsub.current) notificationsUnsub.current();
    };
  }, [user]);

  // --- SHOW TOAST FOR UNREAD NOTIFICATIONS ---
  useEffect(() => {
    const unread = notifications.filter((n) => !n.read);
    unread.forEach((notif) => {
      showMessage(notif.message);
      updateDoc(doc(db, "notifications", notif.id), { read: true }).catch(() => {});
    });
  }, [notifications]);

  // --- GOAL FETCHING AND MERGING ---
  useEffect(() => {
    if (!user) return;
    const allUnsubs = [];
    const ownedGoalsRef = collection(db, "goals");
    const sharedGoalsRef = collection(db, getSharedGoalsCollectionPath(appId));

    const mergeAndSetGoals = async (owned, sharedMetadata) => {
      let combinedGoals = [...owned.map((g) => docToGoal(g, true))];
      const ownedIds = new Set(owned.map((g) => g.id));

      const sharedPromises = sharedMetadata.map(async (sharedDoc) => {
        if (ownedIds.has(sharedDoc.originalGoalId)) return null;
        const originalGoalRef = doc(db, "goals", sharedDoc.originalGoalId);
        try {
          const originalGoalSnap = await getDoc(originalGoalRef);
          if (originalGoalSnap.exists()) {
            return docToGoal(
              originalGoalSnap,
              false,
              sharedDoc.id,
              sharedDoc.ownerId
            );
          }
        } catch (error) {
          console.error("Error fetching shared goal:", error);
        }
        return null;
      });

      const fetchedSharedGoals = (await Promise.all(sharedPromises)).filter((g) => g !== null);
      combinedGoals = [...combinedGoals, ...fetchedSharedGoals];

      setGoals(combinedGoals);

      // OFFLINE FIRST: SAVE TO CACHE
      try {
        await AsyncStorage.setItem(`goals_cache_${user.uid}`, JSON.stringify(combinedGoals));
      } catch (e) {
        console.error("Error caching goals", e);
      }
    };

    const ownedQuery = query(ownedGoalsRef, where("userId", "==", user.uid));
    const unsubscribeOwned = onSnapshot(ownedQuery, async (snapshot) => {
      ownedGoalsCache.current = snapshot.docs;
      await mergeAndSetGoals(ownedGoalsCache.current, sharedMetadataCache.current);
    });
    allUnsubs.push(unsubscribeOwned);

    const sharedQuery = query(sharedGoalsRef, where("collaborators", "array-contains", user.uid));
    const unsubscribeShared = onSnapshot(sharedQuery, async (snapshot) => {
      sharedMetadataCache.current = snapshot.docs.map((d) => ({
        id: d.id,
        originalGoalId: d.data().originalGoalId,
        ownerId: d.data().ownerId,
      }));
      await mergeAndSetGoals(ownedGoalsCache.current, sharedMetadataCache.current);
    });
    allUnsubs.push(unsubscribeShared);

    return () => allUnsubs.forEach((unsub) => unsub());
  }, [user, appId]);

  // --- FILTER AND SORT GOALS ---
  const getFilteredAndSortedGoals = () => {
    let filtered = [...goals];

    // Filter archived goals
    if (!showArchived) {
      filtered = filtered.filter(g => !g.archived);
    } else {
      filtered = filtered.filter(g => g.archived);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(g => 
        g.title.toLowerCase().includes(query) ||
        g.description?.toLowerCase().includes(query) ||
        g.tags?.some(tag => tag.toLowerCase().includes(query))
      );
    }

    // Filter by category
    if (filterCategory !== "all") {
      filtered = filtered.filter(g => g.category === filterCategory);
    }

    // Filter by priority
    if (filterPriority !== "all") {
      filtered = filtered.filter(g => g.priority === filterPriority);
    }

    // Filter completed
    if (!showCompleted) {
      filtered = filtered.filter(g => g.progress < 100);
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "priority":
          const priorityOrder = { high: 0, medium: 1, low: 2 };
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        case "progress":
          return b.progress - a.progress;
        case "title":
          return a.title.localeCompare(b.title);
        case "dueDate":
        default:
          if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
          return new Date(a.dueDate) - new Date(b.dueDate);
      }
    });

    return filtered;
  };

  // --- DATE PICKER ---
  const handleDateChange = (event, date) => {
    setShowDatePicker(false);
    if (event?.type === "set" && date) setSelectedDate(date);
  };

  const handleMilestoneDateChange = (event, date) => {
    setShowMilestoneDatePicker(false);
    if (event?.type === "set" && date) setNewMilestoneDueDate(date);
  };

  // --- OPEN CREATE/EDIT MODAL ---
  const openGoalModal = (goal = null) => {
    if (goal && !goal.isOwner) {
      showMessage("Only the owner can edit this goal.");
      return;
    }

    setIsEditing(!!goal);
    setCurrentGoal(goal);
    setGoalTitle(goal?.title || "");
    setGoalDescription(goal?.description || "");
    setSelectedDate(goal?.dueDate || new Date());
    setSelectedPriority(goal?.priority || "medium");
    setSelectedCategory(goal?.category || "personal");
    setTags(goal?.tags || []);
    setGoalMilestones(goal?.milestones || []);
    setIsRecurring(goal?.recurrence?.type !== 'none' || false);
    setRecurrenceType(goal?.recurrence?.type || 'none');
    setRecurrenceInterval(goal?.recurrence?.interval || 1);
    setEstimatedHours(goal?.estimatedTime ? Math.floor(goal.estimatedTime / 3600).toString() : "");
    setIsFormModalVisible(true);
  };

  // --- TAG MANAGEMENT ---
  const handleAddTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !tags.includes(tag) && tags.length < 5) {
      setTags([...tags, tag]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tag) => {
    setTags(tags.filter(t => t !== tag));
  };

  // --- MILESTONE MANAGEMENT IN FORM ---
  const handleAddMilestoneInForm = () => {
    if (!newMilestoneTitle.trim()) {
      showMessage("Enter milestone title");
      return;
    }
    
    const newMilestone = {
      title: newMilestoneTitle.trim(),
      dueDate: newMilestoneDueDate,
      completed: false,
      createdAt: new Date()
    };
    
    setGoalMilestones([...goalMilestones, newMilestone]);
    setNewMilestoneTitle("");
    setNewMilestoneDueDate(new Date());
  };

  const handleRemoveMilestoneInForm = (index) => {
    const updated = [...goalMilestones];
    updated.splice(index, 1);
    setGoalMilestones(updated);
  };

  const handleToggleMilestoneInForm = (index) => {
    const updated = [...goalMilestones];
    updated[index] = {
      ...updated[index],
      completed: !updated[index].completed
    };
    setGoalMilestones(updated);
  };

  // --- RESOLVE EMAIL TO UID ---
  const resolveOneEmail = async (email) => {
    try {
      const q = query(collection(db, "users"), where("email", "==", email.trim().toLowerCase()));
      const snap = await getDocs(q);
      if (snap.empty) return { notFound: true };
      const docData = snap.docs[0].data();
      return { 
        uid: snap.docs[0].id,
        email: docData.email,
        displayName: docData.displayName || docData.username || docData.email?.split("@")[0] || "User"
      };
    } catch (e) {
      console.error("resolveOneEmail", e);
      return { notFound: true };
    }
  };

  // --- ADD COLLABORATOR (SHARE MODAL) ---
  const handleAddShareEmail = async () => {
    setShareEmailError("");
    const email = shareEmail.trim().toLowerCase();
    if (!email) return;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setShareEmailError("Invalid email");
      return;
    }

    if (shareCollaborators.find(c => c.email === email)) {
      setShareEmailError("Already added");
      return;
    }

    const res = await resolveOneEmail(email);
    if (res.notFound) {
      showMessage(`User "${email}" is not registered`);
      return;
    }

    if (res.uid === user.uid) {
      setShareEmailError("You are the owner");
      return;
    }

    setShareCollaborators((prev) => [...prev, { 
      email: res.email, 
      uid: res.uid,
      displayName: res.displayName
    }]);
    setShareEmail("");
  };

  const handleRemoveShareUid = (uid) => {
    setShareCollaborators((prev) => prev.filter((c) => c.uid !== uid));
  };

  // --- OPEN SHARE MODAL ---
  const openShareModal = async (goal) => {
    if (!goal.isOwner) {
      showMessage("Only the owner can share");
      return;
    }
    setShareGoal(goal);
    setShareCollaborators([]);
    setShareEmail("");
    setShareEmailError("");
    setShareModalVisible(true);

    try {
      const publicPath = getSharedGoalsCollectionPath(appId);
      const q = query(
        collection(db, publicPath),
        where("originalGoalId", "==", goal.id),
        where("ownerId", "==", user.uid)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const existingCollabs = snap.docs[0].data().collaborators || [];
        const filtered = existingCollabs.filter((uid) => uid !== user.uid);
        
        const profiles = await Promise.all(
          filtered.map(async (uid) => {
            const userDoc = await getDoc(doc(db, "users", uid));
            if (userDoc.exists()) {
              const data = userDoc.data();
              return {
                uid,
                email: data.email,
                displayName: data.displayName || data.username || data.email?.split("@")[0] || "User"
              };
            }
            return { uid, email: uid, displayName: uid.slice(0, 8) };
          })
        );
        setShareCollaborators(profiles);
      }
    } catch (e) {
      console.error("openShareModal", e);
    }
  };

  // --- SAVE SHARING ---
  const handleSaveSharing = async () => {
    if (shareCollaborators.length === 0) {
      showMessage("Add at least one collaborator");
      return;
    }

    setLoading(true);
    try {
      const publicPath = getSharedGoalsCollectionPath(appId);
      const collaboratorUids = shareCollaborators.map(c => c.uid);
      
      const payload = {
        title: shareGoal.title,
        description: shareGoal.description || "",
        dueDate: shareGoal.dueDate,
        ownerId: user.uid,
        creatorId: user.uid,
        creatorName: user.displayName || user.email,
        originalGoalId: shareGoal.id,
        participants: Array.from(new Set([user.uid, ...collaboratorUids])),
        collaborators: Array.from(new Set([user.uid, ...collaboratorUids])),
        progress: shareGoal.progress || 0,
        milestones: shareGoal.milestones || [],
        priority: shareGoal.priority || "medium",
        category: shareGoal.category || "personal",
        tags: shareGoal.tags || [],
        contributions: { [user.uid]: shareGoal.progress || 0 },
        comments: [],
        sharedAt: new Date(),
        createdAt: shareGoal.createdAt || new Date(),
      };

      const q = query(
        collection(db, publicPath),
        where("originalGoalId", "==", shareGoal.id),
        where("ownerId", "==", user.uid)
      );
      const existing = await getDocs(q);

      if (!existing.empty) {
        await updateDoc(doc(db, publicPath, existing.docs[0].id), payload);
      } else {
        await addDoc(collection(db, publicPath), payload);
      }

      const notifyUids = collaboratorUids.filter((uid) => uid !== user.uid);
      if (notifyUids.length) {
        for (const uid of notifyUids) {
          try {
            await sendNotification(
              [uid],
              `${user.displayName || user.email} shared "${shareGoal.title}" with you`,
              { 
                goalId: shareGoal.id,
                type: "goal_shared",
                screen: "SharedGoals"
              }
            );
          } catch (notifError) {
            console.error("Notification error:", notifError);
          }
        }
      }

      showMessage("Goal shared successfully!");
      setShareModalVisible(false);
      setShareCollaborators([]);
    } catch (e) {
      console.error("Share error:", e);
      showMessage("Sharing failed: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  // --- NEW ENHANCEMENT FUNCTIONS ---

  // 1. Archive Goal Function
  const handleArchiveGoal = async (goal) => {
    if (!goal.isOwner) {
      showMessage("Only owner can archive");
      return;
    }

    Alert.alert(
      "Archive Goal",
      `Archive "${goal.title}"? You can restore it later from settings.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Archive",
          style: "default",
          onPress: async () => {
            try {
              await updateDoc(doc(db, "goals", goal.id), {
                archived: true,
                archivedAt: new Date(),
              });
              showMessage("Goal archived");
              
              // Notify collaborators
              const uids = await getSharedCollaborators(goal.id);
              if (uids.length) {
                for (const uid of uids) {
                  try {
                    await sendNotification(
                      [uid],
                      `${user.displayName || user.email} archived "${goal.title}"`,
                      { goalId: goal.id, type: "goal_archived" }
                    );
                  } catch (e) {
                    console.error("Notification error:", e);
                  }
                }
              }
            } catch (err) {
              console.error(err);
              showMessage("Archive failed");
            }
          }
        }
      ]
    );
  };

  // 2. Restore Goal Function
  const handleRestoreGoal = async (goal) => {
    try {
      await updateDoc(doc(db, "goals", goal.id), {
        archived: false,
        restoredAt: new Date(),
      });
      showMessage("Goal restored");
    } catch (err) {
      console.error(err);
      showMessage("Restore failed");
    }
  };

  // 3. Save as Template Function
  const handleSaveAsTemplate = async (goal) => {
    if (!goal.isOwner) {
      showMessage("Only owner can save as template");
      return;
    }

    try {
      const templateData = {
        title: goal.title,
        description: goal.description,
        category: goal.category,
        priority: goal.priority,
        tags: goal.tags || [],
        milestones: goal.milestones.map(m => ({ 
          ...m, 
          completed: false,
          dueDate: null 
        })),
        estimatedTime: goal.estimatedTime || 0,
        isTemplate: true,
        userId: user.uid,
        createdAt: new Date(),
        templateName: `${goal.title} Template`,
      };

      await addDoc(collection(db, "goalTemplates"), templateData);
      showMessage("Template saved successfully");
    } catch (err) {
      console.error(err);
      showMessage("Failed to save template");
    }
  };

  // 4. Time Tracking Functions
  const handleStartTimer = (goalId) => {
    if (activeTimer && activeTimer.goalId !== goalId) {
      handleStopTimer(activeTimer.goalId);
    }

    const timerId = Date.now();
    setActiveTimer({
      goalId,
      startTime: Date.now(),
      timerId
    });

    showMessage(`Started timer for goal`);
  };

  const handleStopTimer = async (goalId) => {
    if (!activeTimer || activeTimer.goalId !== goalId) return;

    const duration = Math.floor((Date.now() - activeTimer.startTime) / 1000);
    const goal = goals.find(g => g.id === goalId);
    
    if (goal) {
      try {
        const newTimeEntry = {
          startTime: new Date(activeTimer.startTime),
          endTime: new Date(),
          duration,
          notes: ""
        };

        const updatedTimeEntries = [...(goal.timeEntries || []), newTimeEntry];
        
        await updateDoc(doc(db, "goals", goalId), {
          timeEntries: updatedTimeEntries,
          totalTimeSpent: (goal.totalTimeSpent || 0) + duration
        });

        showMessage(`Tracked ${Math.floor(duration / 60)} minutes`);
      } catch (err) {
        console.error("Error saving time entry:", err);
        showMessage("Failed to save time");
      }
    }

    setActiveTimer(null);
  };

  // 5. Export Goals Function
  const handleExportGoals = async () => {
    try {
      const dataToExport = goals.map(goal => ({
        title: goal.title,
        description: goal.description,
        dueDate: goal.dueDate.toISOString(),
        priority: goal.priority,
        category: goal.category,
        progress: goal.progress,
        milestones: goal.milestones.map(m => ({
          title: m.title,
          completed: m.completed,
          dueDate: m.dueDate ? new Date(m.dueDate).toISOString() : null
        })),
        tags: goal.tags,
        timeSpent: goal.totalTimeSpent,
        createdAt: goal.createdAt.toISOString()
      }));

      const jsonString = JSON.stringify(dataToExport, null, 2);
      const fileUri = FileSystem.documentDirectory + `goals_export_${Date.now()}.json`;
      
      await FileSystem.writeAsStringAsync(fileUri, jsonString);
      
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/json',
        dialogTitle: 'Export Goals',
        UTI: 'public.json'
      });
      
      showMessage("Goals exported successfully");
    } catch (err) {
      console.error("Export error:", err);
      showMessage("Export failed");
    }
  };

  // Helper function to calculate next due date
  const calculateNextDueDate = (currentDate, recurrence) => {
    const date = new Date(currentDate);
    
    switch (recurrence.type) {
      case 'daily':
        date.setDate(date.getDate() + recurrence.interval);
        break;
      case 'weekly':
        date.setDate(date.getDate() + (recurrence.interval * 7));
        break;
      case 'monthly':
        date.setMonth(date.getMonth() + recurrence.interval);
        break;
      case 'yearly':
        date.setFullYear(date.getFullYear() + recurrence.interval);
        break;
      default:
        return null;
    }
    
    return date;
  };

  // --- SAVE GOAL (CREATE/EDIT) ---
  const handleSaveGoal = async () => {
    if (!goalTitle.trim()) {
      showMessage("Enter a title");
      return;
    }
    if (!user) return;

    setLoading(true);
    try {
      const goalData = {
        title: goalTitle.trim(),
        description: goalDescription.trim(),
        dueDate: selectedDate,
        userId: user.uid,
        createdAt: currentGoal?.createdAt || new Date(),
        milestones: goalMilestones,
        priority: selectedPriority,
        category: selectedCategory,
        tags: tags,
        updatedAt: new Date(),
        archived: false,
        recurrence: isRecurring ? {
          type: recurrenceType,
          interval: recurrenceInterval
        } : { type: 'none', interval: 1 },
        estimatedTime: estimatedHours ? parseInt(estimatedHours) * 3600 : 0,
      };

      let savedGoalId;
      if (isEditing && currentGoal) {
        await updateDoc(doc(db, "goals", currentGoal.id), goalData);
        savedGoalId = currentGoal.id;

        const participants = [user.uid];
        if (currentGoal.sharedDocId) {
          const sharedSnap = await getDoc(doc(db, getSharedGoalsCollectionPath(appId), currentGoal.sharedDocId));
          if (sharedSnap.exists()) participants.push(...(sharedSnap.data().collaborators || []));
        }
        const others = participants.filter((uid) => uid !== user.uid);
        if (others.length) {
          for (const uid of others) {
            try {
              await sendNotification(
                [uid],
                `${user.displayName || user.email} updated "${goalData.title}"`,
                { goalId: savedGoalId, type: "goal_updated" }
              );
            } catch (e) {
              console.error("Notification error:", e);
            }
          }
        }
      } else {
        const docRef = await addDoc(collection(db, "goals"), goalData);
        savedGoalId = docRef.id;

        // If recurring, create next instance
        if (isRecurring && recurrenceType !== 'none') {
          const nextDueDate = calculateNextDueDate(selectedDate, goalData.recurrence);
          if (nextDueDate) {
            const nextGoalData = {
              ...goalData,
              dueDate: nextDueDate,
              parentGoalId: savedGoalId,
              recurrence: goalData.recurrence,
              createdAt: new Date()
            };
            
            await addDoc(collection(db, "goals"), nextGoalData);
          }
        }
      }

      // Schedule notifications
      await scheduleMilestoneNotifications([{...goalData, id: savedGoalId}]);

      showMessage(isEditing ? "Goal updated" : "Goal created");
      setIsFormModalVisible(false);
      setTags([]);
      setGoalMilestones([]);
      setIsRecurring(false);
      setRecurrenceType('none');
      setRecurrenceInterval(1);
      setEstimatedHours("");
    } catch (err) {
      console.error(err);
      showMessage("Save failed");
    } finally {
      setLoading(false);
    }
  };

  // --- DELETE GOAL ---
  const handleDeleteGoal = (goal) => {
    if (!goal.isOwner) {
      showMessage("Only owner can delete");
      return;
    }

    Alert.alert(
      "Delete Goal",
      `Are you sure you want to delete "${goal.title}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              if (goal.sharedDocId) {
                const sharedPath = getSharedGoalsCollectionPath(appId);
                const sharedSnap = await getDoc(doc(db, sharedPath, goal.sharedDocId));
                
                if (sharedSnap.exists()) {
                  const uidsToNotify = (sharedSnap.data().collaborators || []).filter((uid) => uid !== user.uid);
                  if (uidsToNotify.length) {
                    for (const uid of uidsToNotify) {
                      try {
                        await sendNotification(
                          [uid],
                          `${user.displayName || user.email} deleted "${goal.title}"`,
                          { type: "goal_deleted" }
                        );
                      } catch (e) {
                        console.error("Notification error:", e);
                      }
                    }
                  }
                }
                await deleteDoc(doc(db, sharedPath, goal.sharedDocId));
              }

              await deleteDoc(doc(db, "goals", goal.id));
              showMessage("Goal deleted");
            } catch (err) {
              console.error(err);
              showMessage("Delete failed");
            }
          }
        }
      ]
    );
  };

  // --- DUPLICATE GOAL ---
  const handleDuplicateGoal = async (goal) => {
    if (!goal.isOwner) {
      showMessage("Only owner can duplicate");
      return;
    }

    try {
      const newGoal = {
        title: `${goal.title} (Copy)`,
        description: goal.description,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        userId: user.uid,
        createdAt: new Date(),
        milestones: goal.milestones.map(m => ({ ...m, completed: false })),
        priority: goal.priority,
        category: goal.category,
        tags: goal.tags || [],
        recurrence: goal.recurrence,
        estimatedTime: goal.estimatedTime || 0,
      };

      await addDoc(collection(db, "goals"), newGoal);
      showMessage("Goal duplicated successfully");
    } catch (err) {
      console.error(err);
      showMessage("Duplicate failed");
    }
  };

  // --- MILESTONE HELPERS ---
  const getSharedCollaborators = async (goalId) => {
    const sharedRef = collection(db, getSharedGoalsCollectionPath(appId));
    const q = query(sharedRef, where("originalGoalId", "==", goalId));
    const snap = await getDocs(q);
    if (snap.empty) return [];
    return (snap.docs[0].data().collaborators || []).filter((uid) => uid !== user.uid);
  };

  const handleAddMilestone = async (goalId, title, dueDate = null) => {
    if (!title?.trim()) return;
    const goal = goals.find((g) => g.id === goalId);
    if (!goal?.isOwner) {
      showMessage("Only owner can add milestones");
      return;
    }
    try {
      const newMilestone = {
        title: title.trim(),
        completed: false,
        createdAt: new Date(),
        dueDate: dueDate || null
      };

      await updateDoc(doc(db, "goals", goalId), {
        milestones: arrayUnion(newMilestone),
      });

      if (dueDate) {
        const triggerDate = new Date(dueDate);
        triggerDate.setHours(9, 0, 0, 0);
        
        if (triggerDate > new Date()) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "Milestone Due Soon!",
              body: `"${title.trim()}" is due on ${triggerDate.toLocaleDateString()}`,
              data: { 
                goalId: goalId, 
                milestoneTitle: title.trim(),
                type: "milestone_reminder" 
              },
            },
            trigger: triggerDate,
          });
        }
      }

      const uids = await getSharedCollaborators(goalId);
      if (uids.length) {
        for (const uid of uids) {
          try {
            await sendNotification(
              [uid],
              `${user.displayName || user.email} added milestone "${title.trim()}"`,
              { goalId, type: "milestone_added" }
            );
          } catch (e) {
            console.error("Notification error:", e);
          }
        }
      }
    } catch (err) {
      console.error(err);
      showMessage("Add failed");
    }
  };

  const handleToggleMilestone = async (goalId, milestoneIndex) => {
    const goal = goals.find((g) => g.id === goalId);
    if (!goal?.isOwner) {
      showMessage("Only owner can update");
      return;
    }
    const milestone = goal.milestones[milestoneIndex];
    const updated = { ...milestone, completed: !milestone.completed };
    const updatedMilestones = goal.milestones.map((m, i) => (i === milestoneIndex ? updated : m));

    try {
      await updateDoc(doc(db, "goals", goalId), { milestones: updatedMilestones });

      const action = updated.completed ? "completed" : "incomplete";
      const uids = await getSharedCollaborators(goalId);
      if (uids.length) {
        for (const uid of uids) {
          try {
            await sendNotification(
              [uid],
              `${user.displayName || user.email} marked "${milestone.title}" as ${action}`,
              { goalId, milestoneTitle: milestone.title, type: "milestone_toggled" }
            );
          } catch (e) {
            console.error("Notification error:", e);
          }
        }
      }
    } catch (err) {
      console.error(err);
      showMessage("Update failed");
    }
  };

  const handleDeleteMilestone = async (goalId, milestone) => {
    const goal = goals.find((g) => g.id === goalId);
    if (!goal?.isOwner) {
      showMessage("Only owner can delete");
      return;
    }
    try {
      await updateDoc(doc(db, "goals", goalId), { milestones: arrayRemove(milestone) });

      const uids = await getSharedCollaborators(goalId);
      if (uids.length) {
        for (const uid of uids) {
          try {
            await sendNotification(
              [uid],
              `${user.displayName || user.email} removed milestone "${milestone.title}"`,
              { goalId, type: "milestone_deleted" }
            );
          } catch (e) {
            console.error("Notification error:", e);
          }
        }
      }
      showMessage("Milestone removed");
    } catch (err) {
      console.error(err);
      showMessage("Remove failed");
    }
  };

  // --- PROGRESS CIRCLE ---
  const ProgressCircle = ({ progress, size = 70 }) => {
    const radius = size / 2;
    const strokeWidth = 5;
    const circumference = 2 * Math.PI * radius;
    const progressStroke = circumference - (progress / 100) * circumference;
    const color = progress === 100 ? COLORS.success : progress > 50 ? COLORS.accent : COLORS.priority.medium;
    
    return (
      <View style={[styles.progressCircleContainer, { width: size, height: size }]}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Circle 
            stroke={COLORS.lightBorder} 
            cx={radius} 
            cy={radius} 
            r={radius - strokeWidth / 2} 
            strokeWidth={strokeWidth} 
            fill="none" 
          />
          <Circle
            stroke={color}
            cx={radius}
            cy={radius}
            r={radius - strokeWidth / 2}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={progressStroke}
            strokeLinecap="round"
            transform={`rotate(-90 ${radius} ${radius})`}
          />
        </Svg>
        <Text style={[styles.progressText, { color, fontSize: size / 5 }]}>{progress}%</Text>
      </View>
    );
  };

  // --- PRIORITY BADGE ---
  const PriorityBadge = ({ priority }) => {
    const config = PRIORITY_OPTIONS.find(p => p.value === priority) || PRIORITY_OPTIONS[1];
    return (
      <View style={[styles.priorityBadge, { backgroundColor: config.color + '20' }]}>
        <Text style={[styles.priorityText, { color: config.color }]}>{config.label}</Text>
      </View>
    );
  };

  // --- MILESTONE DUE DATE BADGE ---
  const MilestoneDueDateBadge = ({ milestone }) => {
    if (!milestone.dueDate) return null;
    
    const dueDate = milestone.dueDate?.toDate ? milestone.dueDate.toDate() : new Date(milestone.dueDate);
    const today = new Date();
    const daysUntil = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
    
    let color = COLORS.textSecondary;
    if (daysUntil < 0) color = COLORS.error;
    else if (daysUntil <= 3) color = COLORS.warning;
    
    return (
      <View style={[styles.milestoneDueDateBadge, { backgroundColor: color + '20' }]}>
        <Ionicons name="calendar" size={12} color={color} />
        <Text style={[styles.milestoneDueDateText, { color }]}>
          {daysUntil < 0 ? 'Overdue' : `${daysUntil}d`}
        </Text>
      </View>
    );
  };

  // --- HEADER COMPONENT ---
  const Header = () => (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={styles.headerTitle}>My Goals</Text>
          <View style={styles.viewToggleContainer}>
            <TouchableOpacity 
              style={[styles.viewToggleButton, analyticsView === 'list' && styles.viewToggleActive]}
              onPress={() => setAnalyticsView('list')}
            >
              <Ionicons name="list" size={20} color={analyticsView === 'list' ? '#fff' : COLORS.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.viewToggleButton, analyticsView === 'charts' && styles.viewToggleActive]}
              onPress={() => setAnalyticsView('charts')}
            >
              <Ionicons name="stats-chart" size={20} color={analyticsView === 'charts' ? '#fff' : COLORS.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
        
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{stats.total}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: COLORS.success }]}>{stats.completed}</Text>
            <Text style={styles.statLabel}>Done</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: COLORS.accent }]}>{stats.inProgress}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: COLORS.error }]}>{stats.overdue}</Text>
            <Text style={styles.statLabel}>Overdue</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, { color: COLORS.archived }]}>{stats.archived}</Text>
            <Text style={styles.statLabel}>Archived</Text>
          </View>
        </View>
      </View>
      
      <View style={styles.headerActions}>
        <TouchableOpacity style={styles.actionButtonSmall} onPress={() => setShowExportModal(true)}>
          <Ionicons name="download-outline" size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButtonSmall} onPress={() => setShowTemplatesModal(true)}>
          <Ionicons name="copy-outline" size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.addButton} onPress={() => openGoalModal()}>
          <Ionicons name="add" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
      </View>
    </View>
  );

  // --- GOAL ITEM COMPONENT ---
  const GoalItem = ({ goal }) => {
    const isEditable = goal.isOwner;
    const isExpanded = expandedGoalId === goal.id;
    const isOverdue = goal.daysRemaining < 0 && goal.progress < 100;
    const isTimerActive = activeTimer && activeTimer.goalId === goal.id;

    return (
      <View style={[
        styles.goalItem, 
        isOverdue && styles.goalItemOverdue,
        goal.archived && styles.goalItemArchived,
      ]}>
        <TouchableOpacity 
          onPress={() => setExpandedGoalId(isExpanded ? null : goal.id)}
          activeOpacity={0.7}
        >
          <View style={styles.goalHeader}>
            <View style={styles.goalDetails}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                <Text style={styles.goalTitle}>{goal.title}</Text>
                <PriorityBadge priority={goal.priority} />
              </View>
              <Text style={styles.goalDescription} numberOfLines={2}>{goal.description}</Text>
              
              <View style={styles.metaRow}>
                <View style={styles.categoryBadge}>
                  <Ionicons 
                    name={CATEGORY_OPTIONS.find(c => c.value === goal.category)?.icon || "ellipsis-horizontal"} 
                    size={12} 
                    color={COLORS.textSecondary} 
                  />
                  <Text style={styles.categoryText}>
                    {CATEGORY_OPTIONS.find(c => c.value === goal.category)?.label || "Other"}
                  </Text>
                </View>
                
                {goal.recurrence.type !== 'none' && (
                  <View style={styles.recurrenceBadge}>
                    <Ionicons name="repeat" size={12} color={COLORS.recurring} />
                    <Text style={styles.recurrenceText}>
                      {goal.recurrence.interval > 1 ? `${goal.recurrence.interval} ` : ''}
                      {goal.recurrence.type}
                    </Text>
                  </View>
                )}
                
                {goal.totalTimeSpent > 0 && (
                  <View style={styles.timeTrackingBadge}>
                    <Ionicons name="time-outline" size={12} color={COLORS.textSecondary} />
                    <Text style={styles.timeTrackingText}>
                      {Math.floor(goal.totalTimeSpent / 3600)}h {Math.floor((goal.totalTimeSpent % 3600) / 60)}m
                    </Text>
                  </View>
                )}
              </View>

              <Text style={[styles.daysRemaining, isOverdue && styles.overdueText]}>
                {isOverdue 
                  ? `${Math.abs(goal.daysRemaining)} days overdue` 
                  : `${goal.daysRemaining} days left`}
              </Text>

              {goal.tags && goal.tags.length > 0 && (
                <View style={styles.tagsContainer}>
                  {goal.tags.map((tag, idx) => (
                    <View key={idx} style={styles.tag}>
                      <Text style={styles.tagText}>#{tag}</Text>
                    </View>
                  ))}
                </View>
              )}

              <Text style={styles.goalMeta}>
                Due: {new Date(goal.dueDate).toLocaleDateString()}
                {goal.isOwner && <Text style={styles.ownerBadge}> • Owned</Text>}
                {goal.isCollaborator && <Text style={styles.collaboratorBadge}> • Collaborating</Text>}
              </Text>
            </View>
            
            <View style={styles.timeTrackingControls}>
              {isEditable && (
                isTimerActive ? (
                  <TouchableOpacity 
                    style={[styles.timerButton, styles.timerButtonActive]}
                    onPress={() => handleStopTimer(goal.id)}
                  >
                    <Ionicons name="stop-circle" size={24} color="#fff" />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity 
                    style={styles.timerButton}
                    onPress={() => handleStartTimer(goal.id)}
                  >
                    <Ionicons name="play-circle" size={24} color={COLORS.accent} />
                  </TouchableOpacity>
                )
              )}
              <ProgressCircle progress={goal.progress} size={60} />
            </View>
          </View>
        </TouchableOpacity>

        {/* Milestones - Expanded View */}
        {isExpanded && (
          <View style={styles.milestonesContainer}>
            <View style={styles.milestoneHeader}>
              <Text style={styles.milestonesTitle}>Milestones</Text>
              <Text style={styles.milestoneCount}>
                {goal.milestones.filter(m => m.completed).length}/{goal.milestones.length}
              </Text>
            </View>
            
            {goal.milestones.length === 0 ? (
              <Text style={styles.emptyMilestonesText}>No milestones yet.</Text>
            ) : (
              goal.milestones.map((m, idx) => (
                <View key={idx} style={styles.milestoneRow}>
                  <TouchableOpacity
                    style={styles.milestoneItem}
                    onPress={isEditable ? () => handleToggleMilestone(goal.id, idx) : null}
                    activeOpacity={isEditable ? 0.7 : 1}
                  >
                    <Ionicons
                      name={m.completed ? "checkmark-circle" : "ellipse-outline"}
                      size={20}
                      color={m.completed ? COLORS.success : isEditable ? COLORS.textSecondary : COLORS.completedText}
                    />
                    <View style={styles.milestoneContent}>
                      <Text style={[styles.milestoneText, m.completed && styles.completedMilestoneText]}>
                        {m.title}
                      </Text>
                      <MilestoneDueDateBadge milestone={m} />
                    </View>
                  </TouchableOpacity>
                  {isEditable && (
                    <TouchableOpacity
                      style={styles.deleteMilestoneButton}
                      onPress={() => handleDeleteMilestone(goal.id, m)}
                    >
                      <Ionicons name="trash-outline" size={18} color={COLORS.completedText} />
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}

            {isEditable && (
              <View style={styles.milestoneInputContainer}>
                <View style={{ flex: 1 }}>
                  <TextInput
                    style={[styles.input, { marginRight: 10, marginBottom: 8 }]}
                    placeholder="Add a new milestone"
                    placeholderTextColor={COLORS.completedText}
                    value={newMilestoneTitle}
                    onChangeText={setNewMilestoneTitle}
                  />
                  <TouchableOpacity 
                    style={styles.datePickerButton} 
                    onPress={() => setShowMilestoneDatePicker(true)}
                  >
                    <Ionicons name="calendar-outline" size={16} color={COLORS.accent} />
                    <Text style={styles.datePickerText}>
                      {newMilestoneDueDate.toLocaleDateString()}
                    </Text>
                  </TouchableOpacity>
                  {showMilestoneDatePicker && (
                    <DateTimePicker 
                      value={newMilestoneDueDate} 
                      mode="date" 
                      onChange={handleMilestoneDateChange} 
                    />
                  )}
                </View>
                <TouchableOpacity
                  style={styles.milestoneAddButton}
                  onPress={() => {
                    handleAddMilestone(goal.id, newMilestoneTitle, newMilestoneDueDate);
                    setNewMilestoneTitle("");
                    setNewMilestoneDueDate(new Date());
                  }}
                >
                  <Ionicons name="add" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Actions */}
        <View style={styles.goalActions}>
          {goal.archived ? (
            <TouchableOpacity onPress={() => handleRestoreGoal(goal)} style={styles.actionButton}>
              <Ionicons name="refresh-outline" size={22} color={COLORS.success} />
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity onPress={() => handleArchiveGoal(goal)} style={styles.actionButton}>
                <Ionicons name="archive-outline" size={22} color={COLORS.archived} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleSaveAsTemplate(goal)} style={styles.actionButton}>
                <Ionicons name="document-text-outline" size={22} color={COLORS.template} />
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity
            onPress={() => openGoalModal(goal)}
            style={[styles.actionButton, !isEditable && styles.disabledAction]}
          >
            <Ionicons name="create-outline" size={22} color={isEditable ? COLORS.textSecondary : COLORS.completedText} />
          </TouchableOpacity>

          {isEditable && (
            <>
              <TouchableOpacity onPress={() => handleDuplicateGoal(goal)} style={styles.actionButton}>
                <Ionicons name="copy-outline" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>

              <TouchableOpacity onPress={() => openShareModal(goal)} style={styles.actionButton}>
                <Ionicons name="share-social-outline" size={22} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity
            onPress={() => handleDeleteGoal(goal)}
            style={[styles.actionButton, !isEditable && styles.disabledAction]}
          >
            <Ionicons name="trash-outline" size={22} color={isEditable ? COLORS.error : COLORS.completedText} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // --- TEMPLATES MODAL ---
  const TemplatesModal = () => (
    <Modal visible={showTemplatesModal} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.formModalContainer}>
          <View style={styles.formModalHeader}>
            <Text style={styles.formModalTitle}>Goal Templates</Text>
            <TouchableOpacity onPress={() => setShowTemplatesModal(false)}>
              <Ionicons name="close" size={24} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>
          
          <ScrollView>
            <Text style={styles.label}>Create new goal from template</Text>
            <View style={styles.filterOptions}>
              <TouchableOpacity 
                style={styles.filterOption}
                onPress={() => {
                  setIsFormModalVisible(true);
                  setShowTemplatesModal(false);
                }}
              >
                <Ionicons name="add-circle" size={20} color={COLORS.accent} />
                <Text style={styles.filterOptionText}>Create New Goal</Text>
              </TouchableOpacity>
            </View>
            
            <Text style={[styles.label, { marginTop: 20 }]}>Quick Templates</Text>
            <View style={styles.filterOptions}>
              <TouchableOpacity 
                style={styles.filterOption}
                onPress={() => {
                  setGoalTitle("Daily Exercise");
                  setGoalDescription("Complete 30 minutes of exercise daily");
                  setSelectedCategory("health");
                  setSelectedPriority("medium");
                  setShowTemplatesModal(false);
                  setIsFormModalVisible(true);
                }}
              >
                <Ionicons name="fitness" size={20} color={COLORS.accent} />
                <Text style={styles.filterOptionText}>Daily Exercise Routine</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.filterOption}
                onPress={() => {
                  setGoalTitle("Learn New Skill");
                  setGoalDescription("Spend 1 hour daily learning a new skill");
                  setSelectedCategory("learning");
                  setSelectedPriority("high");
                  setShowTemplatesModal(false);
                  setIsFormModalVisible(true);
                }}
              >
                <Ionicons name="school" size={20} color={COLORS.accent} />
                <Text style={styles.filterOptionText}>Skill Learning</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.filterOption}
                onPress={() => {
                  setGoalTitle("Monthly Budget");
                  setGoalDescription("Track and manage monthly expenses");
                  setSelectedCategory("finance");
                  setSelectedPriority("medium");
                  setShowTemplatesModal(false);
                  setIsFormModalVisible(true);
                }}
              >
                <Ionicons name="cash" size={20} color={COLORS.accent} />
                <Text style={styles.filterOptionText}>Budget Planning</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
          
          <TouchableOpacity 
            style={[styles.saveButton, { backgroundColor: COLORS.accentBlush }]}
            onPress={() => setShowTemplatesModal(false)}
          >
            <Text style={styles.saveButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  // --- FILTERED GOALS ---
  const filteredGoals = getFilteredAndSortedGoals();

  return (
    <View style={styles.container}>
      <Header />
      
      {analyticsView === 'charts' ? (
        <ScrollView style={styles.goalsList}>
          <View style={styles.chartContainer}>
            <Text style={styles.chartTitle}>Progress Overview</Text>
            <View style={styles.progressGrid}>
              <View style={styles.progressStat}>
                <Text style={styles.progressStatNumber}>{stats.avgProgress}%</Text>
                <Text style={styles.progressStatLabel}>Avg Progress</Text>
              </View>
              <View style={styles.progressStat}>
                <Text style={styles.progressStatNumber}>{stats.totalTimeSpent}h</Text>
                <Text style={styles.progressStatLabel}>Total Time</Text>
              </View>
              <View style={styles.progressStat}>
                <Text style={styles.progressStatNumber}>{stats.completed}/{stats.total}</Text>
                <Text style={styles.progressStatLabel}>Completed</Text>
              </View>
            </View>
          </View>
          
          <View style={styles.chartContainer}>
            <Text style={styles.chartTitle}>Goals by Category</Text>
            <View style={styles.categoryStats}>
              {Object.entries(stats.categoryStats || {}).map(([category, data]) => (
                <View key={category} style={styles.categoryStatItem}>
                  <View style={styles.categoryStatHeader}>
                    <Ionicons 
                      name={CATEGORY_OPTIONS.find(c => c.value === category)?.icon || "ellipsis-horizontal"} 
                      size={16} 
                      color={COLORS.textSecondary} 
                    />
                    <Text style={styles.categoryStatName}>
                      {CATEGORY_OPTIONS.find(c => c.value === category)?.label || category}
                    </Text>
                  </View>
                  <View style={styles.categoryStatBar}>
                    <View 
                      style={[
                        styles.categoryStatFill, 
                        { 
                          width: `${(data.completed / data.total) * 100}%`,
                          backgroundColor: COLORS.accent 
                        }
                      ]} 
                    />
                  </View>
                  <Text style={styles.categoryStatCount}>
                    {data.completed}/{data.total} ({data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0}%)
                  </Text>
                </View>
              ))}
            </View>
          </View>
          
          <TouchableOpacity 
            style={[styles.saveButton, { margin: 20 }]}
            onPress={() => setAnalyticsView('list')}
          >
            <Text style={styles.saveButtonText}>Back to List View</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <>
          {/* Search and Filters */}
          <View style={styles.searchContainer}>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={20} color={COLORS.textSecondary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search goals..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholderTextColor={COLORS.completedText}
              />
            </View>
            <TouchableOpacity 
              style={[styles.filterButton, showArchived && styles.filterButtonActive]}
              onPress={() => setShowArchived(!showArchived)}
            >
              <Ionicons name={showArchived ? "archive" : "archive-outline"} size={20} color={showArchived ? COLORS.accent : COLORS.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.filterButton} onPress={() => setShowFiltersModal(true)}>
              <Ionicons name="options" size={20} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Goals List */}
          <ScrollView 
            contentContainerStyle={styles.scrollContent} 
            style={styles.goalsList}
            showsVerticalScrollIndicator={false}
          >
            {filteredGoals.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="flag-outline" size={64} color={COLORS.completedText} />
                <Text style={styles.emptyListText}>
                  {searchQuery || filterCategory !== "all" || filterPriority !== "all" 
                    ? "No goals match your filters" 
                    : showArchived 
                      ? "No archived goals"
                      : "No goals yet. Tap + to create one."}
                </Text>
              </View>
            ) : (
              filteredGoals.map((goal) => (
                <GoalItem key={goal.id} goal={goal} />
              ))
            )}
          </ScrollView>
        </>
      )}

      {/* Create/Edit Modal */}
      <Modal visible={isFormModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.formModalContainer}>
            <View style={styles.formModalHeader}>
              <Text style={styles.formModalTitle}>{isEditing ? "Edit Goal" : "Create New Goal"}</Text>
              <TouchableOpacity onPress={() => setIsFormModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView>
              <Text style={styles.label}>Title *</Text>
              <TextInput 
                style={styles.input} 
                placeholder="Goal title" 
                value={goalTitle} 
                onChangeText={setGoalTitle} 
              />

              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, { height: 100 }]}
                placeholder="Goal description"
                value={goalDescription}
                onChangeText={setGoalDescription}
                multiline
              />

              <Text style={styles.label}>Priority</Text>
              <View style={styles.prioritySelector}>
                {PRIORITY_OPTIONS.map((priority) => (
                  <TouchableOpacity
                    key={priority.value}
                    style={[
                      styles.priorityOption,
                      selectedPriority === priority.value && { 
                        backgroundColor: priority.color + '20',
                        borderColor: priority.color 
                      }
                    ]}
                    onPress={() => setSelectedPriority(priority.value)}
                  >
                    <Text style={[
                      styles.priorityOptionText,
                      selectedPriority === priority.value && { color: priority.color, fontWeight: '700' }
                    ]}>
                      {priority.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Category</Text>
              <View style={styles.categorySelector}>
                {CATEGORY_OPTIONS.map((category) => (
                  <TouchableOpacity
                    key={category.value}
                    style={[
                      styles.categoryOption,
                      selectedCategory === category.value && styles.categoryOptionSelected
                    ]}
                    onPress={() => setSelectedCategory(category.value)}
                  >
                    <Ionicons 
                      name={category.icon} 
                      size={20} 
                      color={selectedCategory === category.value ? COLORS.accent : COLORS.textSecondary} 
                    />
                    <Text style={[
                      styles.categoryOptionText,
                      selectedCategory === category.value && styles.categoryOptionTextSelected
                    ]}>
                      {category.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Tags (max 5)</Text>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <TextInput
                  style={[styles.input, { flex: 1, marginRight: 8 }]}
                  placeholder="Add tag..."
                  value={tagInput}
                  onChangeText={setTagInput}
                  onSubmitEditing={handleAddTag}
                />
                <TouchableOpacity 
                  style={[styles.saveButton, { marginTop: 0, paddingHorizontal: 12 }]} 
                  onPress={handleAddTag}
                  disabled={tags.length >= 5}
                >
                  <Text style={styles.saveButtonText}>Add</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.tagsContainer}>
                {tags.map((tag, idx) => (
                  <View key={idx} style={styles.tagEdit}>
                    <Text style={styles.tagText}>#{tag}</Text>
                    <TouchableOpacity onPress={() => handleRemoveTag(tag)}>
                      <Ionicons name="close-circle" size={16} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>

              {/* Recurrence Settings */}
              <View style={styles.recurrenceContainer}>
                <TouchableOpacity 
                  style={styles.toggleOption}
                  onPress={() => setIsRecurring(!isRecurring)}
                >
                  <Text style={styles.filterOptionText}>Recurring Goal</Text>
                  <Ionicons 
                    name={isRecurring ? "checkmark-circle" : "ellipse-outline"} 
                    size={24} 
                    color={isRecurring ? COLORS.recurring : COLORS.textSecondary} 
                  />
                </TouchableOpacity>
                
                {isRecurring && (
                  <>
                    <Text style={[styles.label, { marginTop: 12 }]}>Recurrence Pattern</Text>
                    <View style={styles.recurrenceSelector}>
                      {RECURRENCE_OPTIONS.map((option) => (
                        <TouchableOpacity
                          key={option.value}
                          style={[
                            styles.recurrenceOption,
                            recurrenceType === option.value && styles.recurrenceOptionSelected
                          ]}
                          onPress={() => setRecurrenceType(option.value)}
                        >
                          <Text style={[
                            styles.recurrenceOptionText,
                            recurrenceType === option.value && styles.recurrenceOptionTextSelected
                          ]}>
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    
                    {recurrenceType !== 'none' && (
                      <>
                        <Text style={[styles.label, { marginTop: 12 }]}>Repeat Every</Text>
                        <View style={styles.intervalContainer}>
                          <TextInput
                            style={[styles.input, { width: 80 }]}
                            placeholder="1"
                            value={recurrenceInterval.toString()}
                            onChangeText={(text) => {
                              const num = parseInt(text) || 1;
                              setRecurrenceInterval(num > 0 ? num : 1);
                            }}
                            keyboardType="numeric"
                          />
                          <Text style={styles.intervalText}>
                            {recurrenceType === 'daily' ? 'day(s)' : 
                             recurrenceType === 'weekly' ? 'week(s)' : 
                             recurrenceType === 'monthly' ? 'month(s)' : 
                             'year(s)'}
                          </Text>
                        </View>
                      </>
                    )}
                  </>
                )}
              </View>

              {/* Time Estimation */}
              <Text style={styles.label}>Estimated Time (hours)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 10 (leave empty if not needed)"
                value={estimatedHours}
                onChangeText={setEstimatedHours}
                keyboardType="numeric"
              />

              <Text style={styles.label}>Due Date *</Text>
              <TouchableOpacity style={styles.datePickerButton} onPress={() => setShowDatePicker(true)}>
                <Ionicons name="calendar-outline" size={20} color={COLORS.accent} />
                <Text style={styles.datePickerText}>{selectedDate.toLocaleDateString()}</Text>
              </TouchableOpacity>
              {showDatePicker && <DateTimePicker value={selectedDate} mode="date" onChange={handleDateChange} />}

              {/* Milestones in Goal Form */}
              <Text style={styles.label}>Milestones</Text>
              {goalMilestones.length > 0 && (
                <View style={styles.milestonesList}>
                  {goalMilestones.map((milestone, index) => (
                    <View key={index} style={styles.milestoneFormItem}>
                      <TouchableOpacity
                        style={styles.milestoneCheckbox}
                        onPress={() => handleToggleMilestoneInForm(index)}
                      >
                        <Ionicons
                          name={milestone.completed ? "checkmark-circle" : "ellipse-outline"}
                          size={20}
                          color={milestone.completed ? COLORS.success : COLORS.textSecondary}
                        />
                      </TouchableOpacity>
                      <View style={styles.milestoneFormContent}>
                        <Text style={[
                          styles.milestoneFormText,
                          milestone.completed && styles.completedMilestoneText
                        ]}>
                          {milestone.title}
                        </Text>
                        {milestone.dueDate && (
                          <Text style={styles.milestoneFormDueDate}>
                            Due: {new Date(milestone.dueDate).toLocaleDateString()}
                          </Text>
                        )}
                      </View>
                      <TouchableOpacity
                        style={styles.deleteMilestoneFormButton}
                        onPress={() => handleRemoveMilestoneInForm(index)}
                      >
                        <Ionicons name="trash-outline" size={18} color={COLORS.error} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              <Text style={styles.label}>Add New Milestone</Text>
              <TextInput
                style={[styles.input, { marginBottom: 8 }]}
                placeholder="Milestone title"
                value={newMilestoneTitle}
                onChangeText={setNewMilestoneTitle}
              />
              <TouchableOpacity 
                style={styles.datePickerButton} 
                onPress={() => setShowMilestoneDatePicker(true)}
              >
                <Ionicons name="calendar-outline" size={16} color={COLORS.accent} />
                <Text style={styles.datePickerText}>
                  {newMilestoneDueDate.toLocaleDateString()}
                </Text>
              </TouchableOpacity>
              {showMilestoneDatePicker && (
                <DateTimePicker 
                  value={newMilestoneDueDate} 
                  mode="date" 
                  onChange={handleMilestoneDateChange} 
                />
              )}
              <TouchableOpacity 
                style={[styles.saveButton, { backgroundColor: COLORS.accent, marginTop: 8 }]} 
                onPress={handleAddMilestoneInForm}
              >
                <Text style={styles.saveButtonText}>Add Milestone</Text>
              </TouchableOpacity>
            </ScrollView>

            <TouchableOpacity style={styles.saveButton} onPress={handleSaveGoal} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>{isEditing ? "Update Goal" : "Create Goal"}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Filters Modal */}
      <Modal visible={showFiltersModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.formModalContainer}>
            <View style={styles.formModalHeader}>
              <Text style={styles.formModalTitle}>Filters & Sorting</Text>
              <TouchableOpacity onPress={() => setShowFiltersModal(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView>
              <Text style={styles.label}>Sort By</Text>
              <View style={styles.filterOptions}>
                {[
                  { value: "dueDate", label: "Due Date", icon: "calendar" },
                  { value: "priority", label: "Priority", icon: "flag" },
                  { value: "progress", label: "Progress", icon: "stats-chart" },
                  { value: "title", label: "Title", icon: "text" },
                ].map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.filterOption, sortBy === option.value && styles.filterOptionSelected]}
                    onPress={() => setSortBy(option.value)}
                  >
                    <Ionicons name={option.icon} size={18} color={sortBy === option.value ? COLORS.accent : COLORS.textSecondary} />
                    <Text style={[styles.filterOptionText, sortBy === option.value && styles.filterOptionTextSelected]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Filter by Category</Text>
              <View style={styles.filterOptions}>
                <TouchableOpacity
                  style={[styles.filterOption, filterCategory === "all" && styles.filterOptionSelected]}
                  onPress={() => setFilterCategory("all")}
                >
                  <Ionicons name="apps" size={18} color={filterCategory === "all" ? COLORS.accent : COLORS.textSecondary} />
                  <Text style={[styles.filterOptionText, filterCategory === "all" && styles.filterOptionTextSelected]}>
                    All Categories
                  </Text>
                </TouchableOpacity>
                {CATEGORY_OPTIONS.map((category) => (
                  <TouchableOpacity
                    key={category.value}
                    style={[styles.filterOption, filterCategory === category.value && styles.filterOptionSelected]}
                    onPress={() => setFilterCategory(category.value)}
                  >
                    <Ionicons name={category.icon} size={18} color={filterCategory === category.value ? COLORS.accent : COLORS.textSecondary} />
                    <Text style={[styles.filterOptionText, filterCategory === category.value && styles.filterOptionTextSelected]}>
                      {category.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Filter by Priority</Text>
              <View style={styles.filterOptions}>
                <TouchableOpacity
                  style={[styles.filterOption, filterPriority === "all" && styles.filterOptionSelected]}
                  onPress={() => setFilterPriority("all")}
                >
                  <Text style={[styles.filterOptionText, filterPriority === "all" && styles.filterOptionTextSelected]}>
                    All Priorities
                  </Text>
                </TouchableOpacity>
                {PRIORITY_OPTIONS.map((priority) => (
                  <TouchableOpacity
                    key={priority.value}
                    style={[styles.filterOption, filterPriority === priority.value && styles.filterOptionSelected]}
                    onPress={() => setFilterPriority(priority.value)}
                  >
                    <View style={[styles.priorityDot, { backgroundColor: priority.color }]} />
                    <Text style={[styles.filterOptionText, filterPriority === priority.value && styles.filterOptionTextSelected]}>
                      {priority.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity 
                style={styles.toggleOption}
                onPress={() => setShowCompleted(!showCompleted)}
              >
                <Text style={styles.filterOptionText}>Show Completed Goals</Text>
                <Ionicons 
                  name={showCompleted ? "checkmark-circle" : "ellipse-outline"} 
                  size={24} 
                  color={showCompleted ? COLORS.success : COLORS.textSecondary} 
                />
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.saveButton, { backgroundColor: COLORS.accentBlush }]}
                onPress={() => {
                  setFilterCategory("all");
                  setFilterPriority("all");
                  setSortBy("dueDate");
                  setShowCompleted(true);
                  setSearchQuery("");
                  setShowArchived(false);
                }}
              >
                <Text style={styles.saveButtonText}>Reset All Filters</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Share Modal */}
      <Modal visible={shareModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.formModalContainer}>
            <View style={styles.formModalHeader}>
              <Text style={styles.formModalTitle}>Share Goal</Text>
              <TouchableOpacity onPress={() => setShareModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: "70%" }}>
              <Text style={styles.label}>Goal</Text>
              <Text style={{ marginBottom: 12, fontWeight: "600", color: COLORS.textPrimary }}>
                {shareGoal?.title}
              </Text>

              <Text style={styles.label}>Add collaborator (email)</Text>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="friend@example.com"
                  value={shareEmail}
                  onChangeText={setShareEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <TouchableOpacity 
                  style={[styles.saveButton, { marginLeft: 8, paddingHorizontal: 12, marginTop: 0 }]} 
                  onPress={handleAddShareEmail}
                  disabled={loading}
                >
                  {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveButtonText}>Add</Text>}
                </TouchableOpacity>
              </View>

              {shareEmailError ? <Text style={styles.errorText}>{shareEmailError}</Text> : null}

              <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 10 }}>
                {shareCollaborators.map((collab) => (
                  <View key={collab.uid} style={styles.emailPill}>
                    <Text style={styles.emailPillText}>{collab.displayName || collab.email}</Text>
                    <TouchableOpacity onPress={() => handleRemoveShareUid(collab.uid)} style={{ marginLeft: 6 }}>
                      <Ionicons name="close-circle" size={16} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </ScrollView>

            <TouchableOpacity style={styles.saveButton} onPress={handleSaveSharing} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Share Goal</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Export Modal */}
      <Modal visible={showExportModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.formModalContainer}>
            <View style={styles.formModalHeader}>
              <Text style={styles.formModalTitle}>Export Goals</Text>
              <TouchableOpacity onPress={() => setShowExportModal(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.label}>Select Export Format</Text>
            <View style={styles.filterOptions}>
              <TouchableOpacity style={styles.filterOption} onPress={handleExportGoals}>
                <Ionicons name="document-text-outline" size={20} color={COLORS.accent} />
                <Text style={styles.filterOptionText}>JSON Format</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.filterOption} onPress={() => showMessage("CSV export coming soon!")}>
                <Ionicons name="document-outline" size={20} color={COLORS.textSecondary} />
                <Text style={styles.filterOptionText}>CSV Format (Coming Soon)</Text>
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity style={styles.saveButton} onPress={() => setShowExportModal(false)}>
              <Text style={styles.saveButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Templates Modal */}
      <TemplatesModal />

      {/* Toast Message */}
      <Modal visible={showModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.messageModalContainer}>
            <Text style={styles.modalText}>{modalMessage}</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* Enhanced Styles */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.backgroundBase },
  header: { 
    flexDirection: "row", 
    alignItems: "flex-start", 
    justifyContent: "space-between", 
    paddingTop: 50, 
    paddingHorizontal: 20, 
    marginBottom: 16,
    backgroundColor: COLORS.card,
    paddingBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  headerTitle: { fontSize: 28, fontWeight: "800", color: COLORS.textPrimary, marginBottom: 8 },
  statsContainer: { flexDirection: "row", gap: 16, marginTop: 4, flexWrap: "wrap" },
  statItem: { alignItems: "center", minWidth: 60 },
  statNumber: { fontSize: 20, fontWeight: "700", color: COLORS.textPrimary },
  statLabel: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  
  // New header styles
  viewToggleContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.backgroundBase,
    borderRadius: 12,
    padding: 4,
  },
  viewToggleButton: {
    padding: 8,
    borderRadius: 8,
    marginHorizontal: 2,
  },
  viewToggleActive: {
    backgroundColor: COLORS.accent,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionButtonSmall: {
    backgroundColor: COLORS.card,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  addButton: { 
    backgroundColor: COLORS.accentBlush, 
    borderRadius: 50, 
    padding: 12, 
    elevation: 4,
    shadowColor: COLORS.accentBlush,
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
  },
  
  // Search and filters
  searchContainer: { 
    flexDirection: "row", 
    paddingHorizontal: 20, 
    marginBottom: 16, 
    gap: 12 
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  filterButton: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  filterButtonActive: {
    backgroundColor: COLORS.accent + '15',
    borderColor: COLORS.accent,
  },
  
  // Goals list
  goalsList: {
    flex: 1,
  },
  scrollContent: { padding: 20, paddingTop: 0, paddingBottom: 100 },
  emptyState: { 
    alignItems: "center", 
    justifyContent: "center", 
    marginTop: 80 
  },
  emptyListText: { 
    textAlign: "center", 
    color: COLORS.completedText, 
    marginTop: 16, 
    fontSize: 16 
  },
  
  // Goal item
  goalItem: { 
    backgroundColor: COLORS.card, 
    borderRadius: 16, 
    padding: 16, 
    marginBottom: 16, 
    borderWidth: 1, 
    borderColor: COLORS.lightBorder, 
    shadowColor: COLORS.nudeShadow, 
    shadowOpacity: 0.6, 
    shadowOffset: { width: 0, height: 4 }, 
    shadowRadius: 12, 
    elevation: 3 
  },
  goalItemOverdue: {
    borderColor: COLORS.error + '40',
    backgroundColor: COLORS.error + '05',
  },
  goalItemArchived: {
    opacity: 0.7,
    borderColor: COLORS.archived + '40',
  },
  goalHeader: { 
    flexDirection: "row", 
    alignItems: "flex-start", 
    justifyContent: "space-between", 
    marginBottom: 12 
  },
  goalDetails: { flex: 1, marginRight: 12 },
  goalTitle: { 
    fontSize: 18, 
    fontWeight: "700", 
    color: COLORS.textPrimary,
    marginRight: 8,
    flex: 1,
  },
  goalDescription: { 
    fontSize: 14, 
    color: COLORS.textSecondary, 
    marginTop: 6,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 8,
    flexWrap: "wrap",
  },
  categoryBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.accent + '15',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  categoryText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  daysRemaining: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  overdueText: {
    color: COLORS.error,
  },
  
  // New badge styles
  recurrenceBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.recurring + '15',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  recurrenceText: {
    fontSize: 11,
    color: COLORS.recurring,
    fontWeight: "600",
  },
  timeTrackingBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.accent + '15',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  timeTrackingText: {
    fontSize: 11,
    color: COLORS.accent,
    fontWeight: "600",
  },
  
  goalMeta: { 
    fontSize: 12, 
    color: COLORS.completedText, 
    marginTop: 8, 
    fontWeight: "500" 
  },
  ownerBadge: { fontWeight: "700", color: COLORS.owner },
  collaboratorBadge: { fontWeight: "700", color: COLORS.collaborator },
  
  // Time tracking controls
  timeTrackingControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  timerButton: {
    backgroundColor: COLORS.backgroundBase,
    padding: 8,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: COLORS.accent,
  },
  timerButtonActive: {
    backgroundColor: COLORS.error,
    borderColor: COLORS.error,
  },
  
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginLeft: 8,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  tagsContainer: { 
    flexDirection: "row", 
    flexWrap: "wrap", 
    marginTop: 8, 
    gap: 6 
  },
  tag: {
    backgroundColor: COLORS.accentBlush + '30',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tagEdit: {
    backgroundColor: COLORS.accentBlush + '30',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tagText: {
    fontSize: 11,
    color: COLORS.accent,
    fontWeight: "600",
  },
  
  // Progress circle
  progressCircleContainer: { 
    position: "relative", 
    alignItems: "center", 
    justifyContent: "center" 
  },
  progressText: { 
    position: "absolute", 
    fontWeight: "700", 
    color: COLORS.textPrimary 
  },
  
  // Milestones
  milestonesContainer: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: COLORS.lightBorder },
  milestoneHeader: { 
    flexDirection: "row", 
    justifyContent: "space-between", 
    alignItems: "center", 
    marginBottom: 8 
  },
  milestonesTitle: { 
    fontSize: 15, 
    fontWeight: "700", 
    color: COLORS.textPrimary 
  },
  milestoneCount: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  emptyMilestonesText: { 
    fontSize: 13, 
    color: COLORS.completedText, 
    marginBottom: 8,
    fontStyle: "italic",
  },
  milestoneRow: { 
    flexDirection: "row", 
    justifyContent: "space-between", 
    alignItems: "center", 
    paddingVertical: 8 
  },
  milestoneItem: { flex: 1, flexDirection: "row", alignItems: "center" },
  milestoneContent: {
    flex: 1,
    marginLeft: 10,
  },
  milestoneText: { fontSize: 14, color: COLORS.textPrimary },
  completedMilestoneText: { 
    textDecorationLine: "line-through", 
    color: COLORS.completedText 
  },
  milestoneDueDateBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 4,
    gap: 2,
  },
  milestoneDueDateText: {
    fontSize: 10,
    fontWeight: "600",
  },
  deleteMilestoneButton: { padding: 6 },
  milestoneInputContainer: { 
    flexDirection: "row", 
    alignItems: "flex-start", 
    marginTop: 12 
  },
  milestoneAddButton: { 
    backgroundColor: COLORS.accent, 
    borderRadius: 50, 
    padding: 8,
    marginLeft: 8,
  },
  
  // Goal actions
  goalActions: { 
    flexDirection: "row", 
    justifyContent: "flex-end", 
    marginTop: 12, 
    borderTopWidth: 1, 
    borderTopColor: COLORS.lightBorder, 
    paddingTop: 12,
    gap: 8,
  },
  actionButton: { 
    padding: 8, 
    borderRadius: 8,
    backgroundColor: COLORS.backgroundBase,
  },
  disabledAction: { opacity: 0.4 },
  
  // Modals
  modalOverlay: { 
    flex: 1, 
    backgroundColor: "rgba(0,0,0,0.4)", 
    justifyContent: "center", 
    alignItems: "center" 
  },
  formModalContainer: { 
    backgroundColor: COLORS.card, 
    borderRadius: 20, 
    padding: 24, 
    width: "92%", 
    maxHeight: "85%", 
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 16,
  },
  formModalHeader: { 
    flexDirection: "row", 
    justifyContent: "space-between", 
    marginBottom: 20, 
    alignItems: "center" 
  },
  formModalTitle: { 
    fontSize: 22, 
    fontWeight: "800", 
    color: COLORS.textPrimary 
  },
  label: { 
    fontSize: 14, 
    marginBottom: 8, 
    marginTop: 16, 
    fontWeight: "700", 
    color: COLORS.textPrimary 
  },
  input: { 
    borderWidth: 1, 
    borderColor: COLORS.lightBorder, 
    borderRadius: 12, 
    padding: 14, 
    marginBottom: 12, 
    fontSize: 15, 
    backgroundColor: COLORS.backgroundBase, 
    color: COLORS.textPrimary 
  },
  
  // Priority selector
  prioritySelector: { 
    flexDirection: "row", 
    gap: 8, 
    marginBottom: 12 
  },
  priorityOption: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.lightBorder,
    alignItems: "center",
    backgroundColor: COLORS.backgroundBase,
  },
  priorityOptionText: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.textSecondary,
  },
  
  // Category selector
  categorySelector: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  categoryOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
    backgroundColor: COLORS.backgroundBase,
    gap: 6,
  },
  categoryOptionSelected: {
    backgroundColor: COLORS.accent + '15',
    borderColor: COLORS.accent,
  },
  categoryOptionText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  categoryOptionTextSelected: {
    color: COLORS.accent,
    fontWeight: "700",
  },
  
  // Recurrence settings
  recurrenceContainer: {
    marginBottom: 12,
  },
  recurrenceSelector: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  recurrenceOption: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
    backgroundColor: COLORS.backgroundBase,
  },
  recurrenceOptionSelected: {
    backgroundColor: COLORS.recurring + '15',
    borderColor: COLORS.recurring,
  },
  recurrenceOptionText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  recurrenceOptionTextSelected: {
    color: COLORS.recurring,
    fontWeight: "700",
  },
  intervalContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  intervalText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  
  // Date picker
  datePickerButton: { 
    flexDirection: "row", 
    alignItems: "center", 
    borderWidth: 1, 
    borderColor: COLORS.lightBorder, 
    borderRadius: 12, 
    padding: 14, 
    backgroundColor: COLORS.backgroundBase,
    marginBottom: 12,
  },
  datePickerText: { 
    marginLeft: 12, 
    fontSize: 15, 
    color: COLORS.textPrimary,
    fontWeight: "600",
  },
  
  // Save button
  saveButton: { 
    backgroundColor: COLORS.textPrimary, 
    borderRadius: 12, 
    padding: 16, 
    alignItems: "center", 
    marginTop: 20 
  },
  saveButtonText: { 
    color: "#fff", 
    fontWeight: "700", 
    fontSize: 16 
  },
  
  // Message modal
  messageModalContainer: { 
    backgroundColor: COLORS.card, 
    borderRadius: 16, 
    padding: 24, 
    minWidth: "75%", 
    alignItems: "center", 
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
  },
  modalText: { 
    fontSize: 16, 
    textAlign: "center", 
    color: COLORS.textPrimary,
    lineHeight: 24,
  },
  errorText: { 
    color: COLORS.error, 
    fontSize: 13, 
    marginBottom: 8, 
    textAlign: "center", 
    marginTop: 4 
  },
  
  // Email pill
  emailPill: { 
    flexDirection: "row", 
    alignItems: "center", 
    backgroundColor: COLORS.accentBlush + '30', 
    paddingHorizontal: 12, 
    paddingVertical: 8, 
    borderRadius: 20, 
    marginRight: 8, 
    marginBottom: 8 
  },
  emailPillText: { 
    color: COLORS.accent, 
    fontWeight: "600",
    fontSize: 13,
  },
  
  // Notification badge
  notifBadge: { 
    backgroundColor: COLORS.error, 
    borderRadius: 12, 
    minWidth: 22, 
    height: 22, 
    justifyContent: "center", 
    alignItems: "center", 
    marginLeft: 10 
  },
  notifBadgeText: { 
    color: "#fff", 
    fontSize: 11, 
    fontWeight: "700" 
  },
  
  // Filter options
  filterOptions: {
    gap: 8,
    marginBottom: 12,
  },
  filterOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
    backgroundColor: COLORS.backgroundBase,
    gap: 10,
  },
  filterOptionSelected: {
    backgroundColor: COLORS.accent + '15',
    borderColor: COLORS.accent,
  },
  filterOptionText: {
    fontSize: 15,
    color: COLORS.textSecondary,
    fontWeight: "600",
    flex: 1,
  },
  filterOptionTextSelected: {
    color: COLORS.accent,
    fontWeight: "700",
  },
  priorityDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  toggleOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
    backgroundColor: COLORS.backgroundBase,
    marginTop: 8,
    marginBottom: 16,
  },
  
  // Milestone form
  milestonesList: {
    marginBottom: 16,
  },
  milestoneFormItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: COLORS.backgroundBase,
    borderRadius: 8,
    marginBottom: 8,
  },
  milestoneCheckbox: {
    marginRight: 12,
  },
  milestoneFormContent: {
    flex: 1,
  },
  milestoneFormText: {
    fontSize: 14,
    color: COLORS.textPrimary,
    fontWeight: "500",
  },
  milestoneFormDueDate: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  deleteMilestoneFormButton: {
    padding: 6,
    marginLeft: 8,
  },
  
  // Analytics charts
  chartContainer: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    marginHorizontal: 20,
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 16,
  },
  progressGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressStat: {
    alignItems: 'center',
    flex: 1,
  },
  progressStatNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.accent,
    marginBottom: 4,
  },
  progressStatLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  categoryStats: {
    gap: 12,
  },
  categoryStatItem: {
    marginBottom: 8,
  },
  categoryStatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  categoryStatName: {
    fontSize: 14,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  categoryStatBar: {
    height: 8,
    backgroundColor: COLORS.lightBorder,
    borderRadius: 4,
    overflow: 'hidden',
  },
  categoryStatFill: {
    height: '100%',
    borderRadius: 4,
  },
  categoryStatCount: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
    textAlign: 'right',
  },
});