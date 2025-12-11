// screens/GoalsScreen.js - ENHANCED VERSION (With Milestone Dates & Notifications)
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from "@react-native-community/datetimepicker";
import { useNavigation } from "@react-navigation/native";
import * as Notifications from 'expo-notifications';
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

// Theme
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

const getSharedGoalsCollectionPath = (appId) =>
  `artifacts/${appId || "default-app-id"}/public/data/sharedGoals`;

// Helper to convert Firestore doc to a full goal object
const docToGoal = (d, isOwner = true, sharedDocId = null, ownerId = null) => {
  const data = d.data ? d.data() : d; // Handle both Firestore snapshot and raw object
  const id = d.id;
  const milestones = data.milestones || [];
  const completed = milestones.filter((m) => m.completed).length;
  const progress = milestones.length ? Math.round((completed / milestones.length) * 100) : 0;
  
  // Calculate days remaining
  const dueDate = data.dueDate?.toDate ? data.dueDate.toDate() : (data.dueDate ? new Date(data.dueDate) : new Date());
  const today = new Date();
  const daysRemaining = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
  
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
  const [sortBy, setSortBy] = useState("dueDate"); // dueDate, priority, progress, title
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
  const [goalMilestones, setGoalMilestones] = useState([]); // For creating/editing goal form

  // --- Share Modal State ---
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [shareGoal, setShareGoal] = useState(null);
  const [shareEmail, setShareEmail] = useState("");
  const [shareCollaborators, setShareCollaborators] = useState([]);
  const [shareEmailError, setShareEmailError] = useState("");

  // --- Notifications State ---
  const [notifications, setNotifications] = useState([]);
  const notificationsUnsub = useRef(null);

  // --- Statistics ---
  const [stats, setStats] = useState({
    total: 0,
    completed: 0,
    inProgress: 0,
    overdue: 0,
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
          // Re-hydrate dates
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
    
    setStats({ total, completed, inProgress, overdue });

    // Check for upcoming milestones and schedule notifications
    scheduleMilestoneNotifications(goals);

  }, [goals]);

  // --- NOTIFICATION SCHEDULER ---
  const scheduleMilestoneNotifications = async (currentGoals) => {
    // Cancel all existing to avoid duplicates (simple strategy)
    await Notifications.cancelAllScheduledNotificationsAsync();

    const today = new Date();
    
    for (const goal of currentGoals) {
      // Schedule goal notifications
      if (goal.daysRemaining > 0 && goal.daysRemaining <= 3) {
        const triggerDate = new Date(goal.dueDate);
        triggerDate.setHours(9, 0, 0, 0); // 9 AM on due date
        
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

      // Schedule milestone notifications
      const incompleteMilestones = goal.milestones.filter(m => !m.completed && m.dueDate);
      for (const milestone of incompleteMilestones) {
        const milestoneDueDate = milestone.dueDate?.toDate ? milestone.dueDate.toDate() : new Date(milestone.dueDate);
        const daysUntilMilestone = Math.ceil((milestoneDueDate - today) / (1000 * 60 * 60 * 24));
        
        if (daysUntilMilestone > 0 && daysUntilMilestone <= 3) {
          const triggerDate = new Date(milestoneDueDate);
          triggerDate.setHours(9, 0, 0, 0); // 9 AM on due date
          
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
      }

      // Schedule notifications for new/updated milestones
      await scheduleMilestoneNotifications([{...goalData, id: savedGoalId}]);

      showMessage(isEditing ? "Goal updated" : "Goal created");
      setIsFormModalVisible(false);
      setTags([]);
      setGoalMilestones([]);
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
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        userId: user.uid,
        createdAt: new Date(),
        milestones: goal.milestones.map(m => ({ ...m, completed: false })),
        priority: goal.priority,
        category: goal.category,
        tags: goal.tags || [],
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

      // Schedule notification for the new milestone
      if (dueDate) {
        const triggerDate = new Date(dueDate);
        triggerDate.setHours(9, 0, 0, 0); // 9 AM on due date
        
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

  const filteredGoals = getFilteredAndSortedGoals();

  return (
    <View style={styles.container}>
      {/* Header with Statistics */}
      <View style={styles.header}>
        <View>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text style={styles.headerTitle}>My Goals</Text>
            {notifications.filter((n) => !n.read).length > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>
                  {notifications.filter((n) => !n.read).length}
                </Text>
              </View>
            )}
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
          </View>
        </View>
        <TouchableOpacity style={styles.addButton} onPress={() => openGoalModal()}>
          <Ionicons name="add" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
      </View>

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
        <TouchableOpacity style={styles.filterButton} onPress={() => setShowFiltersModal(true)}>
          <Ionicons name="options" size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Goals List - SCROLL FIX: Added flex: 1 via styles.goalsList */}
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
                : "No goals yet. Tap + to create one."}
            </Text>
          </View>
        ) : (
          filteredGoals.map((goal) => {
            const isEditable = goal.isOwner;
            const isExpanded = expandedGoalId === goal.id;
            const isOverdue = goal.daysRemaining < 0 && goal.progress < 100;

            return (
              <View key={goal.id} style={[styles.goalItem, isOverdue && styles.goalItemOverdue]}>
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
                        
                        <Text style={[styles.daysRemaining, isOverdue && styles.overdueText]}>
                          {isOverdue 
                            ? `${Math.abs(goal.daysRemaining)} days overdue` 
                            : `${goal.daysRemaining} days left`}
                        </Text>
                      </View>

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
                    <ProgressCircle progress={goal.progress} />
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
          })
        )}
      </ScrollView>

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
  statsContainer: { flexDirection: "row", gap: 16, marginTop: 4 },
  statItem: { alignItems: "center" },
  statNumber: { fontSize: 20, fontWeight: "700", color: COLORS.textPrimary },
  statLabel: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
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
  goalsList: {
    flex: 1, // Essential for ScrollView to scroll properly
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
    gap: 12,
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
  goalMeta: { 
    fontSize: 12, 
    color: COLORS.completedText, 
    marginTop: 8, 
    fontWeight: "500" 
  },
  ownerBadge: { fontWeight: "700", color: COLORS.owner },
  collaboratorBadge: { fontWeight: "700", color: COLORS.collaborator },
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
  // New styles for milestone form
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
});