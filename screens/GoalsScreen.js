// screens/GoalsScreen.js - PRODUCTION READY VERSION WITH ALL CRITICAL FIXES

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from "@react-native-community/datetimepicker";
import { useNavigation } from "@react-navigation/native";
import * as Notifications from 'expo-notifications';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Haptics from "expo-haptics";
import * as Device from 'expo-device';
import Constants from 'expo-constants';
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
import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
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
  View,
  Switch,
  Linking,
  Animated,
  KeyboardAvoidingView
} from "react-native";
import { Circle, Svg } from "react-native-svg";
import { useApp } from "../context/AppContext";
import { db } from "../firebaseConfig";

// Constants
// Constants moved to proper location below (after imports)

// Safe import of centralized notification utilities with fallbacks
let scheduleGoalNotifications, cancelGoalNotifications, requestNotificationPermissions, 
    configureNotificationHandler, sendNotification, NOTIFICATION_TYPES;

try {
  const notificationUtils = require("../utils/notifications");
  scheduleGoalNotifications = notificationUtils.scheduleGoalNotifications;
  cancelGoalNotifications = notificationUtils.cancelGoalNotifications;
  requestNotificationPermissions = notificationUtils.requestNotificationPermissions;
  configureNotificationHandler = notificationUtils.configureNotificationHandler;
  sendNotification = notificationUtils.sendNotification;
  NOTIFICATION_TYPES = notificationUtils.NOTIFICATION_TYPES;
} catch (error) {
  console.error("Failed to load notification utilities:", error);
  // Provide fallback functions
  scheduleGoalNotifications = async () => ({ ids: [] });
  cancelGoalNotifications = async () => {};
  requestNotificationPermissions = async () => false;
  configureNotificationHandler = () => {};
  sendNotification = async () => {};
  NOTIFICATION_TYPES = {
    GOAL_UPDATED: 'goal_updated',
    MILESTONE_COMPLETED: 'milestone_completed',
    MILESTONE_ADDED: 'milestone_added',
    GOAL_INVITE: 'goal_invite',
    GOAL_DELETED: 'goal_deleted'
  };
}

const { width } = Dimensions.get("window");

// Theme - Updated to match PlannerScreen
const COLORS = {
  backgroundBase: "#FAFAFA",
  layer: "#FAFAFA",
  card: "#FFFFFF",
  textPrimary: "#4A3228",
  textSecondary: "#A98467",
  accentBlush: "#D8A39D",
  accentWarm: "#E3B777",
  sage: "#5D8B7E",
  nudeShadow: "rgba(216,163,157,0.12)",
  shadowDark: "rgba(0,0,0,0.06)",
  danger: "#FF6347",
  success: "#5D8B7E",
  info: "#2196F3",
  warning: "#FFA726",
  archived: "#95A5A6",
  template: "#9B59B6",
  recurring: "#1ABC9C",
  chartGrid: "#F0F0F0",
};

const PRIORITY_COLORS = {
  high: COLORS.accentBlush,
  medium: COLORS.accentWarm,
  low: COLORS.sage,
};

const CATEGORY_COLORS = {
  personal: COLORS.accentBlush,
  work: COLORS.accentWarm,
  health: COLORS.sage,
  learning: "#9B59B6",
  finance: "#3498DB",
  other: "#95A5A6",
};

const PRIORITY_OPTIONS = [
  { value: "high", label: "High", color: PRIORITY_COLORS.high },
  { value: "medium", label: "Medium", color: PRIORITY_COLORS.medium },
  { value: "low", label: "Low", color: PRIORITY_COLORS.low },
];

const CATEGORY_OPTIONS = [
  { value: "personal", label: "Personal", icon: "person", color: CATEGORY_COLORS.personal },
  { value: "work", label: "Work", icon: "briefcase", color: CATEGORY_COLORS.work },
  { value: "health", label: "Health", icon: "fitness", color: CATEGORY_COLORS.health },
  { value: "learning", label: "Learning", icon: "school", color: CATEGORY_COLORS.learning },
  { value: "finance", label: "Finance", icon: "cash", color: CATEGORY_COLORS.finance },
  { value: "other", label: "Other", icon: "ellipsis-horizontal", color: CATEGORY_COLORS.other },
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

const triggerHaptic = async (style = "light") => {
  try {
    await Haptics.impactAsync(
      style === "heavy" ? Haptics.ImpactFeedbackStyle.Heavy :
      style === "medium" ? Haptics.ImpactFeedbackStyle.Medium :
      Haptics.ImpactFeedbackStyle.Light
    );
  } catch (e) {
    console.warn("Haptic feedback failed:", e);
  }
};

// Helper function to check and request notification permissions
const checkAndRequestNotificationPermissions = async () => {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert(
          'Notification Permissions Required',
          'Please enable notifications in your device settings to receive goal reminders.',
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Open Settings', 
              onPress: () => {
                if (Platform.OS === 'ios') {
                  Linking.openURL('app-settings:');
                } else {
                  Linking.openSettings();
                }
              }
            }
          ]
        );
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error checking notification permissions:', error);
    return false;
  }
};

// ========================================================================
// PRODUCTION CONSTANTS
// ========================================================================

// Time constants (milliseconds)
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

// Utility function to normalize date to midnight UTC for accurate day calculations
const normalizeToMidnightUTC = (date) => {
  const normalized = new Date(date);
  normalized.setUTCHours(0, 0, 0, 0);
  return normalized;
};

// Calculate days remaining with timezone safety
const calculateDaysRemaining = (dueDate) => {
  const today = normalizeToMidnightUTC(new Date());
  const due = normalizeToMidnightUTC(dueDate);
  const diffMs = due - today;
  return Math.ceil(diffMs / DAY);
};

// Input validation
const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_TAG_LENGTH = 30;
const MAX_TAGS = 5;
const MAX_MILESTONES = 20;
const MAX_COLLABORATORS = 10;

// Default values
const DEFAULT_REMINDER_OFFSET = 30 * MINUTE;
const CACHE_VERSION = 2;
const CACHE_KEY_PREFIX = 'goals_cache_v' + CACHE_VERSION + '_';
const DEBOUNCE_DELAY = 500;

// UI constants
const MAX_SEARCH_RESULTS = 50;
const ANIMATION_DURATION = 300;
const HAPTIC_FEEDBACK_DURATION = 50;

// Enhanced docToGoal function with robust error handling
const docToGoal = (d, isOwner = true, sharedDocId = null, ownerId = null) => {
  try {
    const data = d.data ? d.data() : d;
    // FIX: Generate truly unique ID if missing to prevent duplicate key errors
    const id = d.id || `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const milestones = Array.isArray(data.milestones) ? data.milestones : [];
    const completed = milestones.filter((m) => m?.completed).length;
    const progress = milestones.length ? Math.round((completed / milestones.length) * 100) : 0;
    
    // Robust date handling
    let dueDate;
    try {
      const dueDateValue = data.dueDate;
      if (dueDateValue?.toDate) {
        dueDate = dueDateValue.toDate();
      } else if (dueDateValue) {
        dueDate = new Date(dueDateValue);
      } else {
        // Set default due date to 30 days from now
        dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30);
      }
    } catch (error) {
      console.error("Error parsing due date:", error);
      dueDate = new Date(Date.now() + 30 * DAY); // 30 days from now
    }
    
    // Calculate time spent
    const totalTimeSpent = Array.isArray(data.timeEntries) ? 
      data.timeEntries.reduce((sum, entry) => sum + (entry.duration || 0), 0) : 0;
    
    return {
      id: id,
      ...data,
      dueDate,
      milestones,
      progress,
      daysRemaining: calculateDaysRemaining(dueDate),
      isOwner,
      isCollaborator: !isOwner,
      sharedDocId,
      ownerId: ownerId || data.userId,
      priority: data.priority || "medium",
      category: data.category || "personal",
      tags: Array.isArray(data.tags) ? data.tags : [],
      archived: Boolean(data.archived),
      isTemplate: Boolean(data.isTemplate),
      recurrence: data.recurrence || { type: 'none', interval: 1 },
      timeEntries: Array.isArray(data.timeEntries) ? data.timeEntries : [],
      totalTimeSpent,
      estimatedTime: Number(data.estimatedTime) || 0,
      enableNotifications: data.enableNotifications !== false,
      notificationIds: Array.isArray(data.notificationIds) ? data.notificationIds : [],
      notificationTime: data.notificationTime ? new Date(data.notificationTime) : new Date(dueDate.getTime() - DEFAULT_REMINDER_OFFSET),
      customNotificationMessage: data.customNotificationMessage || "",
      syncToCalendar: Boolean(data.syncToCalendar),
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt || new Date()),
    };
  } catch (error) {
    console.error("Error converting document to goal:", error, d);
    // Return a minimal valid goal object with unique ID
    const now = new Date();
    const defaultDueDate = new Date(now.getTime() + 30 * DAY);
    return {
      id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: "Error Loading Goal",
      description: "",
      dueDate: defaultDueDate,
      milestones: [],
      progress: 0,
      daysRemaining: 30,
      isOwner: true,
      isCollaborator: false,
      sharedDocId: null,
      ownerId: null,
      priority: "medium",
      category: "personal",
      tags: [],
      archived: false,
      isTemplate: false,
      recurrence: { type: 'none', interval: 1 },
      timeEntries: [],
      totalTimeSpent: 0,
      estimatedTime: 0,
      enableNotifications: true,
      notificationIds: [],
      notificationTime: new Date(defaultDueDate.getTime() - DEFAULT_REMINDER_OFFSET),
      customNotificationMessage: "",
      syncToCalendar: false,
      createdAt: now,
    };
  }
};

// Helper function to merge goals by ID (preserves local state)
const mergeGoalsById = (existingGoals, newGoals) => {
  const merged = [...existingGoals];
  const existingIds = new Set(existingGoals.map(g => g.id));
  
  newGoals.forEach(newGoal => {
    const existingIndex = merged.findIndex(g => g.id === newGoal.id);
    if (existingIndex >= 0) {
      // Preserve local state like active timer, animations, etc.
      const existing = merged[existingIndex];
      merged[existingIndex] = {
        ...newGoal,
        // Preserve local-only state
        localTimer: existing.localTimer,
        isAnimating: existing.isAnimating,
        expanded: existing.expanded,
      };
    } else {
      merged.push(newGoal);
    }
  });
  
  return merged;
};

// Email resolution cache
const emailResolutionCache = {
  cache: new Map(),
  get: (email) => emailResolutionCache.cache.get(email),
  set: (email, result) => {
    emailResolutionCache.cache.set(email, result);
    // Auto-clean old entries
    if (emailResolutionCache.cache.size > 100) {
      const firstKey = emailResolutionCache.cache.keys().next().value;
      emailResolutionCache.cache.delete(firstKey);
    }
  },
  clear: () => emailResolutionCache.cache.clear(),
};

export default function GoalsScreen() {
  // Safe date utilities
  const createSafeDate = (dateValue) => {
    try {
      if (!dateValue) return new Date();
      
      if (dateValue?.toDate && typeof dateValue.toDate === 'function') {
        return dateValue.toDate();
      }
      
      if (dateValue instanceof Date) {
        return isNaN(dateValue.getTime()) ? new Date() : dateValue;
      }
      
      const date = new Date(dateValue);
      return isNaN(date.getTime()) ? new Date() : date;
    } catch (error) {
      console.warn('Invalid date value:', dateValue);
      return new Date();
    }
  };
  
  const getDaysDifference = (date1, date2) => {
    const utc1 = Date.UTC(date1.getFullYear(), date1.getMonth(), date1.getDate());
    const utc2 = Date.UTC(date2.getFullYear(), date2.getMonth(), date2.getDate());
    return Math.ceil((utc2 - utc1) / DAY);
  };
  
  const isDateInPast = (date) => {
    return date.getTime() < Date.now();
  };
  
  const addTime = (date, milliseconds) => {
    return new Date(date.getTime() + milliseconds);
  };
  
  const navigation = useNavigation();
  const { user, appId } = useApp();

  // Mount tracking
  const isMounted = useRef(true);
  const notificationsProcessed = useRef([]);

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

  // --- Notification States ---
  const [enableNotifications, setEnableNotifications] = useState(true);
  const [notificationTime, setNotificationTime] = useState(new Date(Date.now() + DEFAULT_REMINDER_OFFSET));
  const [customNotificationMessage, setCustomNotificationMessage] = useState("");
  const [syncToCalendar, setSyncToCalendar] = useState(false);
  const [showNotificationTimePicker, setShowNotificationTimePicker] = useState(false);
  const [showNotificationDatePicker, setShowNotificationDatePicker] = useState(false);
  const [notificationTimeMode, setNotificationTimeMode] = useState('date');
  const [tempNotificationTime, setTempNotificationTime] = useState(new Date());
  const [formStep, setFormStep] = useState(1);
  const [formProgress, setFormProgress] = useState(25);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Animation helper for step transitions
  const animateToStep = useCallback((newStep) => {
    if (!isMounted.current) return;
    
    const direction = newStep > formStep ? 1 : -1;
    
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: direction * 50,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (isMounted.current) {
        setFormStep(newStep);
        slideAnim.setValue(-direction * 50);
        
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: ANIMATION_DURATION,
            useNativeDriver: true,
          }),
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: ANIMATION_DURATION,
            useNativeDriver: true,
          }),
        ]).start();
      }
    });
    
    const totalSteps = 4;
    if (isMounted.current) {
      setFormProgress((newStep / totalSteps) * 100);
    }
  }, [formStep, fadeAnim, slideAnim]);

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

  // Safe message display with mount check
  const showMessage = useCallback((message) => {
    if (!isMounted.current) return;
    setModalMessage(message);
    setShowModal(true);
    setTimeout(() => {
      if (isMounted.current) setShowModal(false);
    }, ANIMATION_DURATION);
  }, []);

  // --- Helper function: getSharedCollaborators ---
  const getSharedCollaborators = useCallback(async (goalId) => {
    try {
      const sharedRef = collection(db, getSharedGoalsCollectionPath(appId));
      const q = query(sharedRef, where("originalGoalId", "==", goalId));
      const snap = await getDocs(q);
      if (snap.empty) return [];
      return (snap.docs[0].data().collaborators || []).filter((uid) => uid !== user?.uid);
    } catch (error) {
      console.error("Error getting shared collaborators:", error);
      return [];
    }
  }, [appId, user?.uid]);

  // Input validation helper
  const validateGoalInput = () => {
    if (!goalTitle.trim()) {
      showMessage("Please enter a goal title");
      return false;
    }
    
    if (goalTitle.trim().length > MAX_TITLE_LENGTH) {
      showMessage(`Title must be ${MAX_TITLE_LENGTH} characters or less`);
      return false;
    }
    
    if (goalDescription && goalDescription.length > MAX_DESCRIPTION_LENGTH) {
      showMessage(`Description must be ${MAX_DESCRIPTION_LENGTH} characters or less`);
      return false;
    }
    
    if (tags.length > MAX_TAGS) {
      showMessage(`Maximum ${MAX_TAGS} tags allowed`);
      return false;
    }
    
    if (goalMilestones.length > MAX_MILESTONES) {
      showMessage(`Maximum ${MAX_MILESTONES} milestones allowed`);
      return false;
    }
    
    return true;
  };

  // Helper function to calculate next due date with limits
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
    
    // Limit to max 1 year in future for recurring goals
    const maxDate = new Date();
    maxDate.setFullYear(maxDate.getFullYear() + 1);
    return date > maxDate ? null : date;
  };

  // --- SINGLE NOTIFICATION SETUP (RUN ONCE) ---
  useEffect(() => {
    const setupNotifications = async () => {
      if (!isMounted.current) return;
      
      await requestNotificationPermissions();
      configureNotificationHandler();
      
      if (Platform.OS === 'android') {
        try {
          await Notifications.setNotificationChannelAsync('goals', {
            name: 'Goals',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#4CAF50',
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
            bypassDnd: false,
            showBadge: true,
            enableVibrate: true,
            enableLights: true,
          });
          
          await Notifications.setNotificationChannelAsync('collaboration', {
            name: 'Collaboration',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 100, 250],
            lightColor: '#9C27B0',
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
            bypassDnd: false,
            showBadge: true,
            enableVibrate: true,
            enableLights: true,
          });
        } catch (error) {
          console.error("Error setting up notification channels:", error);
        }
      }
    };
    
    setupNotifications();
    
    const subscription = Notifications.addNotificationReceivedListener(notification => {
      triggerHaptic('light');
    });
    
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
      const { goalId, type, screen } = response.notification.request.content.data || {};
      
      if (goalId && screen === "Goals") {
        const goal = goals.find(g => g.id === goalId);
        if (goal) {
          setExpandedGoalId(goalId);
          showMessage(`Opening ${type?.includes('milestone') ? 'milestone' : 'goal'}...`);
        }
      }
    });
    
    return () => {
      subscription.remove();
      responseSubscription.remove();
    };
  }, []); // EMPTY DEPENDENCY - RUN ONCE

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
      if (notificationsUnsub.current) {
        try {
          notificationsUnsub.current();
        } catch (error) {
          console.error("Error unsubscribing from notifications:", error);
        }
      }
    };
  }, []);

  // --- OFFLINE FIRST: LOAD CACHE ---
  useEffect(() => {
    const loadCachedGoals = async () => {
      if (!user?.uid) return;
      
      try {
        const cacheKey = `goals_cache_${user.uid}_${CACHE_VERSION}`;
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
          let parsed = [];
          try {
            parsed = JSON.parse(cached);
            if (!Array.isArray(parsed)) throw new Error('Invalid cache format');
          } catch (error) {
            console.error("Corrupt cache, clearing...", error);
            await AsyncStorage.removeItem(cacheKey);
            return;
          }
          
          const hydrated = parsed.map(g => {
            try {
              return {
                ...g,
                dueDate: g.dueDate ? createSafeDate(g.dueDate) : new Date(),
                milestones: (g.milestones || []).map(m => ({
                  ...m,
                  createdAt: m.createdAt ? new Date(m.createdAt) : new Date(),
                  dueDate: m.dueDate ? new Date(m.dueDate) : null
                }))
              };
            } catch (e) {
              console.error("Error hydrating goal:", e, g);
              return null;
            }
          }).filter(g => g !== null);
          
          if (isMounted.current) {
            setGoals(hydrated);
          }
        }
      } catch (e) {
        console.error("Failed to load cached goals", e);
      }
    };
    
    if (user) loadCachedGoals();
  }, [user]);

  // --- CALCULATE STATISTICS ---
  useEffect(() => {
    if (!isMounted.current) return;
    
    const total = goals.length;
    const completed = goals.filter(g => g.progress === 100).length;
    const inProgress = goals.filter(g => g.progress > 0 && g.progress < 100).length;
    const overdue = goals.filter(g => g.daysRemaining < 0 && g.progress < 100).length;
    const archivedCount = goals.filter(g => g.archived).length;
    
    const avgProgress = goals.length > 0 
      ? Math.round(goals.reduce((sum, g) => sum + g.progress, 0) / goals.length)
      : 0;
    
    const totalTimeSpent = goals.reduce((sum, g) => sum + (g.totalTimeSpent || 0), 0);
    
    const categoryStats = {};
    goals.forEach(g => {
      if (!categoryStats[g.category]) {
        categoryStats[g.category] = { total: 0, completed: 0 };
      }
      categoryStats[g.category].total++;
      if (g.progress === 100) categoryStats[g.category].completed++;
    });

    if (isMounted.current) {
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
    }
  }, [goals]);

  // --- NOTIFICATIONS LISTENER ---
  useEffect(() => {
    if (!user?.uid) return;

    // Try with orderBy, fallback to unordered if index missing
    const setupNotificationListener = async () => {
      try {
        const q = query(
          collection(db, "notifications"),
          where("toUid", "==", user.uid),
          orderBy("createdAt", "desc")
        );

        const unsub = onSnapshot(q, (snap) => {
          if (!isMounted.current) return;
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          setNotifications(list);
        });

        notificationsUnsub.current = unsub;
      } catch (error) {
        console.error("Ordered notification query failed, falling back to unordered:", error);
        // Fallback to unordered query
        const q = query(
          collection(db, "notifications"),
          where("toUid", "==", user.uid)
        );

        const unsub = onSnapshot(q, (snap) => {
          if (!isMounted.current) return;
          const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => 
            new Date(b.createdAt?.toDate?.() || b.createdAt || 0) - 
            new Date(a.createdAt?.toDate?.() || a.createdAt || 0)
          );
          setNotifications(list);
        });

        notificationsUnsub.current = unsub;
      }
    };

    setupNotificationListener();
    
    return () => {
      if (notificationsUnsub.current) {
        notificationsUnsub.current();
      }
    };
  }, [user]);

  // --- SHOW TOAST FOR UNREAD NOTIFICATIONS ---
  useEffect(() => {
    if (!isMounted.current) return;
    
    const unread = notifications.filter((n) => !n.read);
    const newUnread = unread.filter(notif => 
      !notificationsProcessed.current.includes(notif.id)
    );
    
    newUnread.forEach((notif) => {
      showMessage(notif.message || "New notification");
      // DO NOT auto-mark as read - let user tap to mark as read
      notificationsProcessed.current = [...notificationsProcessed.current, notif.id];
      if (notificationsProcessed.current.length > 100) {
        notificationsProcessed.current = notificationsProcessed.current.slice(-100);
      }
    });
    
    // Clean up old IDs to prevent memory growth
    if (notificationsProcessed.current.length > 100) {
      notificationsProcessed.current = notificationsProcessed.current.slice(-50);
    }
    
    // Also clean up IDs that no longer exist in notifications
    notificationsProcessed.current = notificationsProcessed.current.filter(id =>
      notifications.some(n => n.id === id)
    );
  }, [notifications, showMessage]);

  // --- GOAL FETCHING AND MERGING ---
  useEffect(() => {
    if (!user?.uid) return;
    
    let isMountedLocal = true;
    let allUnsubs = [];
    const ownedGoalsRef = collection(db, "goals");
    const sharedGoalsRef = collection(db, getSharedGoalsCollectionPath(appId));

    const mergeAndSetGoals = async (owned, sharedMetadata) => {
      if (!isMountedLocal) return;
      
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

      if (isMountedLocal) {
        // Use merge instead of replace to preserve local state
        setGoals(prev => mergeGoalsById(prev, combinedGoals));

        // OFFLINE FIRST: SAVE TO CACHE
        try {
          const cacheKey = `goals_cache_${user.uid}_${CACHE_VERSION}`;
          await AsyncStorage.setItem(cacheKey, JSON.stringify(combinedGoals));
        } catch (e) {
          console.error("Error caching goals", e);
        }
      }
    };

    const ownedQuery = query(ownedGoalsRef, where("userId", "==", user.uid));
    const unsubscribeOwned = onSnapshot(ownedQuery, async (snapshot) => {
      if (!isMountedLocal) return;
      ownedGoalsCache.current = snapshot.docs;
      await mergeAndSetGoals(ownedGoalsCache.current, sharedMetadataCache.current);
    });
    allUnsubs = [...allUnsubs, unsubscribeOwned];

    // Try with orderBy, fallback to unordered if index missing
    const setupSharedListener = async () => {
      try {
        const sharedQuery = query(
          sharedGoalsRef, 
          where("collaborators", "array-contains", user.uid),
          orderBy("sharedAt", "desc")
        );
        
        const unsubscribeShared = onSnapshot(sharedQuery, async (snapshot) => {
          if (!isMountedLocal) return;
          sharedMetadataCache.current = snapshot.docs.map((d) => ({
            id: d.id,
            originalGoalId: d.data().originalGoalId,
            ownerId: d.data().ownerId,
          }));
          await mergeAndSetGoals(ownedGoalsCache.current, sharedMetadataCache.current);
        });
        allUnsubs = [...allUnsubs, unsubscribeShared];
      } catch (error) {
        console.error("Ordered shared query failed, falling back to unordered:", error);
        // Fallback to unordered query
        const sharedQuery = query(
          sharedGoalsRef, 
          where("collaborators", "array-contains", user.uid)
        );
        
        const unsubscribeShared = onSnapshot(sharedQuery, async (snapshot) => {
          if (!isMountedLocal) return;
          sharedMetadataCache.current = snapshot.docs.map((d) => ({
            id: d.id,
            originalGoalId: d.data().originalGoalId,
            ownerId: d.data().ownerId,
          }));
          await mergeAndSetGoals(ownedGoalsCache.current, sharedMetadataCache.current);
        });
        allUnsubs = [...allUnsubs, unsubscribeShared];
      }
    };

    setupSharedListener();

    return () => {
      isMountedLocal = false;
      allUnsubs.forEach((unsub) => {
        try {
          unsub();
        } catch (error) {
          console.error("Error unsubscribing from Firestore:", error);
        }
      });
    };
  }, [user, appId]);

  // --- FILTER AND SORT GOALS (with useMemo for performance) ---
  const filteredGoals = useMemo(() => {
    let filtered = [...goals];

    // FIX: Deduplicate goals by ID to prevent duplicate key errors
    const seenIds = new Set();
    filtered = filtered.filter(g => {
      if (seenIds.has(g.id)) {
        console.warn(`Duplicate goal ID detected and removed: ${g.id}`);
        return false;
      }
      seenIds.add(g.id);
      return true;
    });

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
        (g.title || "").toLowerCase().includes(query) ||
        (g.description || "").toLowerCase().includes(query) ||
        (g.tags || []).some(tag => tag.toLowerCase().includes(query))
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
          return (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1);
        case "progress":
          return (b.progress || 0) - (a.progress || 0);
        case "title":
          return (a.title || "").localeCompare(b.title || "");
        case "dueDate":
        default:
          if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
          return new Date(a.dueDate || 0) - new Date(b.dueDate || 0);
      }
    });

    return filtered;
  }, [goals, filterCategory, filterPriority, sortBy, showCompleted, searchQuery, showArchived]);

  // --- DATE PICKER ---
  const handleDateChange = (event, date) => {
    setShowDatePicker(false);
    if (event?.type === "set" && date) {
      setSelectedDate(date);
      
      // Auto-adjust notification time if it's now after the new due date
      if (enableNotifications && notificationTime >= date) {
        const newNotifTime = new Date(date.getTime() - DEFAULT_REMINDER_OFFSET);
        setNotificationTime(newNotifTime);
        setTempNotificationTime(newNotifTime);
        showMessage("Reminder time adjusted to 30 minutes before new due date");
      }
    }
  };

  const handleMilestoneDateChange = (event, date) => {
    setShowMilestoneDatePicker(false);
    if (event?.type === "set" && date) setNewMilestoneDueDate(date);
  };

  const handleNotificationTimeChange = (event, date) => {
    if (Platform.OS === 'android') {
      setShowNotificationTimePicker(false);
    }
    
    if (event?.type === "set" && date) {
      if (notificationTimeMode === 'date') {
        setTempNotificationTime(date);
        if (Platform.OS === 'android') {
          setNotificationTimeMode('time');
          setShowNotificationTimePicker(true);
        }
      } else {
        const combinedDateTime = new Date(tempNotificationTime);
        combinedDateTime.setHours(date.getHours());
        combinedDateTime.setMinutes(date.getMinutes());
        combinedDateTime.setSeconds(0);
        
        // Validate: notification time must be before due date
        if (combinedDateTime >= selectedDate) {
          showMessage("Reminder time must be before the due date");
          return;
        }
        
        setNotificationTime(combinedDateTime);
        setNotificationTimeMode('date');
        if (Platform.OS === 'ios') {
          setShowNotificationTimePicker(false);
        }
      }
    } else if (event?.type === "dismissed") {
      setNotificationTimeMode('date');
      if (Platform.OS === 'ios') {
        setShowNotificationTimePicker(false);
      }
    }
  };

  // --- OPEN CREATE/EDIT MODAL ---
  const openGoalModal = (goal = null) => {
    if (goal && !goal.isOwner) {
      showMessage("Only the owner can edit this goal.");
      return;
    }

    triggerHaptic("light");
    setIsEditing(!!goal);
    setCurrentGoal(goal);
    setGoalTitle(goal?.title || "");
    setGoalDescription(goal?.description || "");
    setSelectedDate(goal?.dueDate ? createSafeDate(goal.dueDate) : new Date());
    setSelectedPriority(goal?.priority || "medium");
    setSelectedCategory(goal?.category || "personal");
    setTags(Array.isArray(goal?.tags) ? goal.tags : []);
    setGoalMilestones(Array.isArray(goal?.milestones) ? goal.milestones : []);
    setIsRecurring(goal?.recurrence?.type !== 'none' || false);
    setRecurrenceType(goal?.recurrence?.type || 'none');
    setRecurrenceInterval(goal?.recurrence?.interval || 1);
    setEstimatedHours(goal?.estimatedTime ? Math.floor(goal.estimatedTime / 3600).toString() : "");
    setEnableNotifications(goal?.enableNotifications !== false);
    
    // Set notification time with validation
    const defaultNotifTime = goal?.notificationTime || new Date((goal?.dueDate || new Date()).getTime() - DEFAULT_REMINDER_OFFSET);
    const now = new Date();
    const dueDate = goal?.dueDate ? createSafeDate(goal.dueDate) : new Date();
    let finalNotifTime = new Date(defaultNotifTime);
    
    if (finalNotifTime >= dueDate) {
      finalNotifTime = new Date(dueDate.getTime() - 60 * MINUTE);
    }
    if (finalNotifTime <= now) {
      finalNotifTime = new Date(now.getTime() + DEFAULT_REMINDER_OFFSET);
      if (finalNotifTime >= dueDate) {
        finalNotifTime = new Date(dueDate.getTime() - 5 * MINUTE);
      }
    }
    
    setNotificationTime(finalNotifTime);
    setTempNotificationTime(finalNotifTime);
    setCustomNotificationMessage(goal?.customNotificationMessage || "");
    setSyncToCalendar(Boolean(goal?.syncToCalendar));
    setIsFormModalVisible(true);
    setFormStep(1);
    setFormProgress(25);
  };

  // --- TAG MANAGEMENT ---
  const handleAddTag = () => {
    const tag = tagInput.trim().toLowerCase();
    
    // Validate tag
    if (!tag) {
      showMessage("Please enter a tag");
      return;
    }
    
    if (tag.length > MAX_TAG_LENGTH) {
      showMessage(`Tag must be ${MAX_TAG_LENGTH} characters or less`);
      return;
    }
    
    if (tags.includes(tag)) {
      showMessage("Tag already exists");
      return;
    }
    
    if (tags.length >= MAX_TAGS) {
      showMessage(`Maximum ${MAX_TAGS} tags allowed`);
      return;
    }
    
    if (tag) {
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
    
    if (newMilestoneTitle.trim().length > MAX_TITLE_LENGTH) {
      showMessage(`Milestone title must be ${MAX_TITLE_LENGTH} characters or less`);
      return;
    }
    
    if (goalMilestones.length >= MAX_MILESTONES) {
      showMessage(`Maximum ${MAX_MILESTONES} milestones allowed`);
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
    if (index < 0 || index >= goalMilestones.length) return;
    const updated = [...goalMilestones];
    updated.splice(index, 1);
    setGoalMilestones(updated);
  };

  const handleToggleMilestoneInForm = (index) => {
    if (index < 0 || index >= goalMilestones.length) return;
    const updated = [...goalMilestones];
    updated[index] = {
      ...updated[index],
      completed: !updated[index].completed
    };
    setGoalMilestones(updated);
  };

  // --- TOGGLE NOTIFICATIONS FOR A GOAL ---
  const handleToggleNotifications = async (goal) => {
    if (!goal.isOwner) {
      showMessage("Only owner can modify notifications");
      return;
    }

    try {
      const newEnableNotifications = !goal.enableNotifications;
      
      // Optimistic update
      setGoals(prev => prev.map(g => 
        g.id === goal.id ? { ...g, enableNotifications: newEnableNotifications } : g
      ));
      
      await updateDoc(doc(db, "goals", goal.id), {
        enableNotifications: newEnableNotifications,
        lastNotifiedAt: new Date(),
      });

      if (newEnableNotifications && !goal.archived && goal.progress < 100) {
        try {
          const notificationIds = await scheduleGoalNotifications(
            {
              id: goal.id,
              title: goal.title,
              deadline: goal.dueDate,
              completed: goal.progress === 100,
              enableNotifications: true,
              milestones: goal.milestones,
              notificationTime: goal.notificationTime,
              customNotificationMessage: goal.customNotificationMessage,
              ...goal
            },
            [user.uid],
            goal.sharedDocId ? true : false
          );
          
          await updateDoc(doc(db, "goals", goal.id), {
            notificationIds: notificationIds.ids || notificationIds || [],
            lastNotificationUpdate: new Date()
          });
          
          showMessage("Notifications enabled for this goal");
        } catch (error) {
          console.error("Failed to enable notifications:", error);
          showMessage("Goal saved but notifications failed to schedule");
        }
      } else {
        await cancelGoalNotifications(goal.id);
        showMessage("Notifications disabled for this goal");
      }
    } catch (error) {
      console.error("Error toggling notifications:", error);
      showMessage("Failed to update notifications");
      // Revert optimistic update
      setGoals(prev => prev.map(g => 
        g.id === goal.id ? { ...g, enableNotifications: goal.enableNotifications } : g
      ));
    }
  };

  // --- RESOLVE EMAIL TO UID (with caching and debouncing) ---
  const resolveOneEmail = async (email) => {
    const cached = emailResolutionCache.get(email);
    if (cached) return cached;
    
    try {
      const q = query(collection(db, "users"), where("email", "==", email.trim().toLowerCase()));
      const snap = await getDocs(q);
      if (snap.empty) {
        const result = { notFound: true };
        emailResolutionCache.set(email, result);
        return result;
      }
      const docData = snap.docs[0].data();
      const result = { 
        uid: snap.docs[0].id,
        email: docData.email,
        displayName: docData.displayName || docData.username || docData.email?.split("@")[0] || "User"
      };
      emailResolutionCache.set(email, result);
      return result;
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
                goalTitle: shareGoal.title,
                type: NOTIFICATION_TYPES.GOAL_INVITE,
                screen: "SharedGoals"
              },
              {
                pushTitle: "🎯 Goal Invitation",
                type: NOTIFICATION_TYPES.GOAL_INVITE,
                priority: "high",
                actionRequired: true
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
      showMessage("Sharing failed: " + (e.message || "Unknown error"));
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
              // Optimistic update
              setGoals(prev => prev.map(g => 
                g.id === goal.id ? { ...g, archived: true, archivedAt: new Date() } : g
              ));
              
              await updateDoc(doc(db, "goals", goal.id), {
                archived: true,
                archivedAt: new Date(),
              });
              
              await cancelGoalNotifications(goal.id);
              
              const uids = await getSharedCollaborators(goal.id);
              if (uids.length) {
                try {
                  await sendNotification(
                    uids,
                    `${user.displayName || user.email} archived "${goal.title}"`,
                    { 
                      goalId: goal.id,
                      goalTitle: goal.title,
                      type: NOTIFICATION_TYPES.GOAL_UPDATED,
                      screen: "Goals"
                    },
                    {
                      pushTitle: "📦 Goal Archived",
                      type: NOTIFICATION_TYPES.GOAL_UPDATED
                    }
                  );
                } catch (e) {
                  console.error("Notification error:", e);
                }
              }
              
              showMessage("Goal archived");
            } catch (err) {
              console.error(err);
              showMessage("Archive failed");
              // Revert optimistic update
              setGoals(prev => prev.map(g => 
                g.id === goal.id ? { ...g, archived: goal.archived } : g
              ));
            }
          }
        }
      ]
    );
  };

  // 2. Restore Goal Function
  const handleRestoreGoal = async (goal) => {
    try {
      // Optimistic update
      setGoals(prev => prev.map(g => 
        g.id === goal.id ? { ...g, archived: false, restoredAt: new Date() } : g
      ));
      
      await updateDoc(doc(db, "goals", goal.id), {
        archived: false,
        restoredAt: new Date(),
      });
      
      if (goal.enableNotifications && !goal.archived && goal.progress < 100) {
        await scheduleGoalNotifications(
          {
            id: goal.id,
            title: goal.title,
            deadline: goal.dueDate,
            completed: goal.progress === 100,
            enableNotifications: true,
            milestones: goal.milestones,
            ...goal
          },
          [user.uid],
          goal.sharedDocId ? true : false
        );
      }
      
      showMessage("Goal restored");
    } catch (err) {
      console.error(err);
      showMessage("Restore failed");
      // Revert optimistic update
      setGoals(prev => prev.map(g => 
        g.id === goal.id ? { ...g, archived: goal.archived } : g
      ));
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

  // 4. Time Tracking Functions with persistence
  const handleStartTimer = async (goalId) => {
    if (activeTimer && activeTimer.goalId !== goalId) {
      await handleStopTimer(activeTimer.goalId);
    }

    const timerId = Date.now();
    const timerData = {
      goalId,
      startTime: Date.now(),
      timerId
    };
    
    setActiveTimer(timerData);
    
    // Persist timer to AsyncStorage
    try {
      await AsyncStorage.setItem(`active_timer_${user.uid}`, JSON.stringify(timerData));
    } catch (error) {
      console.error("Failed to persist timer:", error);
    }

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
        const newTotalTimeSpent = (goal.totalTimeSpent || 0) + duration;
        
        // Optimistic update
        setGoals(prev => prev.map(g => 
          g.id === goalId ? { 
            ...g, 
            timeEntries: updatedTimeEntries,
            totalTimeSpent: newTotalTimeSpent
          } : g
        ));
        
        await updateDoc(doc(db, "goals", goalId), {
          timeEntries: updatedTimeEntries,
          totalTimeSpent: newTotalTimeSpent
        });

        showMessage(`Tracked ${Math.floor(duration / 60)} minutes`);
      } catch (err) {
        console.error("Error saving time entry:", err);
        showMessage("Failed to save time");
        // Revert optimistic update
        setGoals(prev => prev.map(g => 
          g.id === goalId ? g : g
        ));
      }
    }

    setActiveTimer(null);
    // Clear persisted timer
    try {
      await AsyncStorage.removeItem(`active_timer_${user.uid}`);
    } catch (error) {
      console.error("Failed to clear timer:", error);
    }
  };

  // Load active timer on mount
  useEffect(() => {
    const loadActiveTimer = async () => {
      if (!user?.uid) return;
      
      try {
        const timerData = await AsyncStorage.getItem(`active_timer_${user.uid}`);
        if (timerData) {
          const parsed = JSON.parse(timerData);
          // Check if timer is still valid (not older than 24 hours)
          if (Date.now() - parsed.startTime < 24 * HOUR) {
            setActiveTimer(parsed);
          } else {
            // Timer expired, clean up
            await AsyncStorage.removeItem(`active_timer_${user.uid}`);
          }
        }
      } catch (error) {
        console.error("Failed to load active timer:", error);
      }
    };
    
    loadActiveTimer();
  }, [user?.uid]);

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

  // --- SAVE GOAL (CREATE/EDIT) with input validation ---
  const handleSaveGoal = async () => {
    if (loading) {
      console.warn('Operation already in progress');
      return;
    }
    
    // Input validation
    if (!validateGoalInput()) return;
    
    if (!user?.uid) return;

    setLoading(true);
    triggerHaptic("heavy");
    
    let savedGoalId;
    
    try {
      const combined = new Date(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        selectedDate.getDate(),
        selectedDate.getHours(),
        selectedDate.getMinutes()
      );

      const goalData = {
        title: goalTitle.trim(),
        description: goalDescription.trim(),
        dueDate: combined,
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
        enableNotifications: enableNotifications,
        notificationTime: enableNotifications ? notificationTime : null,
        customNotificationMessage: customNotificationMessage.trim(),
        syncToCalendar: syncToCalendar,
        notificationIds: currentGoal?.notificationIds || [],
      };

      if (isEditing && currentGoal) {
        // Optimistic update for editing
        setGoals(prev => prev.map(g => 
          g.id === currentGoal.id ? { ...g, ...goalData } : g
        ));
        
        await updateDoc(doc(db, "goals", currentGoal.id), goalData);
        savedGoalId = currentGoal.id;

        await cancelGoalNotifications(savedGoalId);

        const participants = [user.uid];
        if (currentGoal.sharedDocId) {
          const sharedSnap = await getDoc(doc(db, getSharedGoalsCollectionPath(appId), currentGoal.sharedDocId));
          if (sharedSnap.exists()) participants.push(...(sharedSnap.data().collaborators || []));
        }
        const others = participants.filter((uid) => uid !== user.uid);
        if (others.length) {
          try {
            await sendNotification(
              others,
              `${user.displayName || user.email} updated "${goalData.title}"`,
              { 
                goalId: savedGoalId,
                goalTitle: goalData.title,
                type: NOTIFICATION_TYPES.GOAL_UPDATED,
                screen: "Goals"
              },
              {
                pushTitle: "✏️ Goal Updated",
                type: NOTIFICATION_TYPES.GOAL_UPDATED
              }
            );
          } catch (e) {
            console.error("Notification error:", e);
          }
        }
      } else {
        const docRef = await addDoc(collection(db, "goals"), goalData);
        savedGoalId = docRef.id;

        // Optimistic update for new goal
        const newGoal = { ...goalData, id: savedGoalId, progress: 0, daysRemaining: calculateDaysRemaining(combined) };
        setGoals(prev => [...prev, newGoal]);

        // Handle recurring goals with limits
        if (isRecurring && recurrenceType !== 'none') {
          const nextDueDate = calculateNextDueDate(combined, goalData.recurrence);
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

      // Schedule notifications if enabled and goal is not completed/archived
      if (enableNotifications && !currentGoal?.archived && currentGoal?.progress !== 100) {
        const hasPermissions = await checkAndRequestNotificationPermissions();
        
        if (hasPermissions) {
          try {
            const notificationIds = await scheduleGoalNotifications(
              {
                id: savedGoalId,
                title: goalData.title,
                deadline: combined,
                completed: false,
                enableNotifications: true,
                milestones: goalMilestones,
                notificationTime: notificationTime,
                customNotificationMessage: customNotificationMessage.trim(),
                ...goalData
              },
              [user.uid],
              false
            );
            
            await updateDoc(doc(db, "goals", savedGoalId), {
              notificationIds: notificationIds.ids || notificationIds || [],
              lastNotificationUpdate: new Date()
            });
          } catch (error) {
            console.error("Failed to schedule notifications:", error);
            showMessage("Goal saved but notifications failed to schedule");
          }
        } else {
          showMessage("Goal saved, but notifications are disabled");
        }
      }

      showMessage(isEditing ? "Goal updated" : "Goal created");
      setIsFormModalVisible(false);
      setTags([]);
      setGoalMilestones([]);
      setIsRecurring(false);
      setRecurrenceType('none');
      setRecurrenceInterval(1);
      setEstimatedHours("");
      setEnableNotifications(true);
      setNotificationTime(new Date(Date.now() + DEFAULT_REMINDER_OFFSET));
      setCustomNotificationMessage("");
      setSyncToCalendar(false);
    } catch (err) {
      console.error(err);
      showMessage("Save failed");
      // Revert optimistic updates
      if (isEditing && currentGoal) {
        setGoals(prev => prev.map(g => 
          g.id === currentGoal.id ? currentGoal : g
        ));
      } else if (savedGoalId) {
        setGoals(prev => prev.filter(g => g.id !== savedGoalId));
      }
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
              // Optimistic update
              setGoals(prev => prev.filter(g => g.id !== goal.id));
              
              await cancelGoalNotifications(goal.id);

              if (goal.sharedDocId) {
                const sharedPath = getSharedGoalsCollectionPath(appId);
                const sharedSnap = await getDoc(doc(db, sharedPath, goal.sharedDocId));
                
                if (sharedSnap.exists()) {
                  const uidsToNotify = (sharedSnap.data().collaborators || []).filter((uid) => uid !== user.uid);
                  if (uidsToNotify.length) {
                    try {
                      await sendNotification(
                        uidsToNotify,
                        `${user.displayName || user.email} deleted "${goal.title}"`,
                        { 
                          goalTitle: goal.title,
                          type: NOTIFICATION_TYPES.GOAL_DELETED,
                          screen: "Goals"
                        },
                        {
                          pushTitle: "🗑️ Goal Deleted",
                          type: NOTIFICATION_TYPES.GOAL_DELETED
                        }
                      );
                    } catch (e) {
                      console.error("Notification error:", e);
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
              // Revert optimistic update
              setGoals(prev => [...prev, goal]);
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

    let newGoalId;

    try {
      const newGoal = {
        title: `${goal.title} (Copy)`,
        description: goal.description,
        dueDate: new Date(Date.now() + 7 * DAY),
        userId: user.uid,
        createdAt: new Date(),
        milestones: goal.milestones.map(m => ({ ...m, completed: false })),
        priority: goal.priority,
        category: goal.category,
        tags: goal.tags || [],
        recurrence: goal.recurrence,
        estimatedTime: goal.estimatedTime || 0,
        enableNotifications: goal.enableNotifications,
        notificationTime: goal.notificationTime,
        customNotificationMessage: goal.customNotificationMessage,
        syncToCalendar: goal.syncToCalendar,
      };

      const docRef = await addDoc(collection(db, "goals"), newGoal);
      newGoalId = docRef.id;

      // Optimistic update
      const optimisticGoal = { ...newGoal, id: newGoalId, progress: 0, daysRemaining: calculateDaysRemaining(newGoal.dueDate) };
      setGoals(prev => [...prev, optimisticGoal]);

      if (goal.enableNotifications && !goal.archived && goal.progress < 100) {
        try {
          const notificationIds = await scheduleGoalNotifications(
            {
              id: newGoalId,
              title: newGoal.title,
              deadline: newGoal.dueDate,
              completed: false,
              enableNotifications: true,
              milestones: newGoal.milestones,
              notificationTime: newGoal.notificationTime,
              customNotificationMessage: newGoal.customNotificationMessage,
              ...newGoal
            },
            [user.uid],
            false
          );
          
          await updateDoc(doc(db, "goals", newGoalId), {
            notificationIds: notificationIds.ids || notificationIds || [],
            lastNotificationUpdate: new Date()
          });
        } catch (error) {
          console.error("Failed to schedule notifications for duplicated goal:", error);
          showMessage("Goal duplicated, but notifications may need manual setup");
        }
      }

      showMessage("Goal duplicated successfully");
    } catch (err) {
      console.error(err);
      showMessage("Duplicate failed");
      // Revert optimistic update
      if (newGoalId) {
        setGoals(prev => prev.filter(g => g.id !== newGoalId));
      }
    }
  };

  // --- MILESTONE HELPERS with optimistic updates ---
  const handleAddMilestone = async (goalId, title, dueDate = null) => {
    if (!title?.trim()) return;
    const goal = goals.find((g) => g.id === goalId);
    if (!goal?.isOwner) {
      showMessage("Only owner can add milestones");
      return;
    }
    
    const newMilestone = {
      title: title.trim(),
      completed: false,
      createdAt: new Date(),
      dueDate: dueDate || null
    };
    
    try {
      // Optimistic update
      const updatedMilestones = [...goal.milestones, newMilestone];
      const newProgress = updatedMilestones.length ? 
        Math.round((updatedMilestones.filter(m => m.completed).length / updatedMilestones.length) * 100) : 0;
      
      setGoals(prev => prev.map(g => 
        g.id === goalId ? { 
          ...g, 
          milestones: updatedMilestones,
          progress: newProgress
        } : g
      ));

      await updateDoc(doc(db, "goals", goalId), {
        milestones: arrayUnion(newMilestone),
      });

      if (goal.enableNotifications && !goal.archived && goal.progress < 100) {
        await cancelGoalNotifications(goalId);
        await scheduleGoalNotifications(
          {
            id: goal.id,
            title: goal.title,
            deadline: goal.dueDate,
            milestones: updatedMilestones,
            enableNotifications: true,
            ...goal
          },
          [user.uid],
          goal.sharedDocId ? true : false
        );
      }

      const uids = await getSharedCollaborators(goalId);
      if (uids.length) {
        await sendNotification(
          uids,
          `${user.displayName || user.email} added milestone "${title.trim()}" to "${goal.title}"`,
          { 
            goalId: goalId, 
            type: NOTIFICATION_TYPES.MILESTONE_ADDED,
            screen: "Goals"
          },
          {
            pushTitle: "🎯 New Milestone",
            type: NOTIFICATION_TYPES.MILESTONE_ADDED
          }
        );
      }
    } catch (err) {
      console.error(err);
      showMessage("Add failed");
      // Revert optimistic update
      setGoals(prev => prev.map(g => 
        g.id === goalId ? goal : g
      ));
    }
  };

  const handleToggleMilestone = async (goalId, milestoneIndex) => {
    const goal = goals.find((g) => g.id === goalId);
    if (!goal?.isOwner || milestoneIndex >= goal.milestones.length) {
      showMessage("Cannot update milestone");
      return;
    }
    
    const milestone = goal.milestones[milestoneIndex];
    const updated = { ...milestone, completed: !milestone.completed };
    const updatedMilestones = goal.milestones.map((m, i) => (i === milestoneIndex ? updated : m));
    const newProgress = updatedMilestones.length ? 
      Math.round((updatedMilestones.filter(m => m.completed).length / updatedMilestones.length) * 100) : 0;

    try {
      // Optimistic update
      setGoals(prev => prev.map(g => 
        g.id === goalId ? { 
          ...g, 
          milestones: updatedMilestones,
          progress: newProgress
        } : g
      ));

      await updateDoc(doc(db, "goals", goalId), { milestones: updatedMilestones });

      const action = updated.completed ? "completed" : "incomplete";
      const uids = await getSharedCollaborators(goalId);
      if (uids.length) {
        const notificationType = updated.completed ? 
          NOTIFICATION_TYPES.MILESTONE_COMPLETED : 
          NOTIFICATION_TYPES.GOAL_UPDATED;
        
        try {
          await sendNotification(
            uids,
            `${user.displayName || user.email} marked "${milestone.title}" as ${action}`,
            { 
              goalId, 
              goalTitle: goal.title,
              milestoneTitle: milestone.title, 
              type: notificationType,
              screen: "Goals"
            },
            {
              pushTitle: updated.completed ? "✨ Milestone Completed!" : "📝 Milestone Updated",
              type: notificationType,
              priority: updated.completed ? "high" : "default"
            }
          );
        } catch (e) {
          console.error("Notification error:", e);
        }
      }
    } catch (err) {
      console.error(err);
      showMessage("Update failed");
      // Revert optimistic update
      setGoals(prev => prev.map(g => 
        g.id === goalId ? goal : g
      ));
    }
  };

  const handleDeleteMilestone = async (goalId, milestone) => {
    const goal = goals.find((g) => g.id === goalId);
    if (!goal?.isOwner) {
      showMessage("Only owner can delete");
      return;
    }
    
    const updatedMilestones = goal.milestones.filter(m => m.title !== milestone.title);
    const newProgress = updatedMilestones.length ? 
      Math.round((updatedMilestones.filter(m => m.completed).length / updatedMilestones.length) * 100) : 0;
    
    try {
      // Optimistic update
      setGoals(prev => prev.map(g => 
        g.id === goalId ? { 
          ...g, 
          milestones: updatedMilestones,
          progress: newProgress
        } : g
      ));

      await updateDoc(doc(db, "goals", goalId), { milestones: arrayRemove(milestone) });

      if (goal.enableNotifications && !goal.archived && goal.progress < 100) {
        await cancelGoalNotifications(goalId);
        await scheduleGoalNotifications(
          {
            id: goal.id,
            title: goal.title,
            deadline: goal.dueDate,
            milestones: updatedMilestones,
            enableNotifications: true,
            ...goal
          },
          [user.uid],
          goal.sharedDocId ? true : false
        );
      }

      const uids = await getSharedCollaborators(goalId);
      if (uids.length) {
        try {
          await sendNotification(
            uids,
            `${user.displayName || user.email} removed milestone "${milestone.title}"`,
            { 
              goalId,
              goalTitle: goal.title,
              milestoneTitle: milestone.title,
              type: NOTIFICATION_TYPES.GOAL_UPDATED,
              screen: "Goals"
            },
            {
              pushTitle: "🗑️ Milestone Removed",
              type: NOTIFICATION_TYPES.GOAL_UPDATED
            }
          );
        } catch (e) {
          console.error("Notification error:", e);
        }
      }
      showMessage("Milestone removed");
    } catch (err) {
      console.error(err);
      showMessage("Remove failed");
      // Revert optimistic update
      setGoals(prev => prev.map(g => 
        g.id === goalId ? goal : g
      ));
    }
  };

  // --- PROGRESS CIRCLE ---
  const ProgressCircle = ({ progress, size = 70 }) => {
    const radius = size / 2;
    const strokeWidth = 5;
    const circumference = 2 * Math.PI * radius;
    const progressStroke = circumference - (progress / 100) * circumference;
    const color = progress === 100 ? COLORS.success : progress > 50 ? COLORS.sage : COLORS.accentWarm;
    
    return (
      <View style={[styles.progressCircleContainer, { width: size, height: size }]}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Circle 
            stroke={COLORS.shadowDark} 
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
    const color = PRIORITY_COLORS[priority] || COLORS.accentWarm;
    const label = priority.charAt(0).toUpperCase() + priority.slice(1);
    
    return (
      <View style={[styles.priorityBadge, { backgroundColor: color + '20' }]}>
        <Text style={[styles.priorityText, { color }]}>{label}</Text>
      </View>
    );
  };

  // --- MILESTONE DUE DATE BADGE ---
  const MilestoneDueDateBadge = ({ milestone }) => {
    if (!milestone.dueDate) return null;
    
    let dueDate;
    try {
      dueDate = milestone.dueDate?.toDate ? milestone.dueDate.toDate() : createSafeDate(milestone.dueDate);
    } catch (error) {
      console.error("Error parsing milestone due date:", error);
      return null;
    }
    
    const daysUntil = calculateDaysRemaining(dueDate);
    
    let color = COLORS.textSecondary;
    if (daysUntil < 0) color = COLORS.danger;
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
      </View>
      
      <View style={styles.headerActions}>
        <TouchableOpacity 
          style={styles.addButton} 
          onPress={() => openGoalModal()}
          accessibilityLabel="Create new goal"
          accessibilityRole="button"
          accessibilityHint="Opens form to create a new goal"
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );

  // --- GOAL ITEM COMPONENT ---
  const GoalItem = ({ goal }) => {
    const isEditable = goal.isOwner;
    const isExpanded = expandedGoalId === goal.id;
    const isOverdue = goal.daysRemaining < 0 && goal.progress < 100;
    const hasMilestones = goal.milestones && goal.milestones.length > 0;

    return (
      <View style={[
        styles.goalItem, 
        isOverdue && styles.goalItemOverdue,
        goal.archived && styles.goalItemArchived,
      ]}>
        <TouchableOpacity 
          onPress={() => setExpandedGoalId(isExpanded ? null : goal.id)}
          activeOpacity={0.7}
          style={styles.goalCardTouchable}
        >
          <View style={styles.goalHeader}>
            <View style={styles.goalDetails}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                <Text style={styles.goalTitle}>{goal.title}</Text>
                <PriorityBadge priority={goal.priority} />
                {goal.enableNotifications && !goal.completed && !goal.archived && (
                  <TouchableOpacity 
                    style={styles.notificationToggle}
                    onPress={() => handleToggleNotifications(goal)}
                  >
                    <Ionicons 
                      name="notifications" 
                      size={16} 
                      color={COLORS.info} 
                    />
                  </TouchableOpacity>
                )}
              </View>
              <Text style={styles.goalDescription} numberOfLines={2}>{goal.description}</Text>
              
              <View style={styles.metaRow}>
                <View style={[styles.categoryBadge, { backgroundColor: CATEGORY_COLORS[goal.category] + '15' }]}>
                  <Ionicons 
                    name={CATEGORY_OPTIONS.find(c => c.value === goal.category)?.icon || "ellipsis-horizontal"} 
                    size={12} 
                    color={CATEGORY_COLORS[goal.category]} 
                  />
                  <Text style={[styles.categoryText, { color: CATEGORY_COLORS[goal.category] }]}>
                    {CATEGORY_OPTIONS.find(c => c.value === goal.category)?.label || "Other"}
                  </Text>
                </View>
                
                {goal.recurrence.type !== 'none' && (
                  <View style={[styles.recurrenceBadge, { backgroundColor: COLORS.recurring + '15' }]}>
                    <Ionicons name="repeat" size={12} color={COLORS.recurring} />
                    <Text style={[styles.recurrenceText, { color: COLORS.recurring }]}>
                      {goal.recurrence.interval > 1 ? `${goal.recurrence.interval} ` : ''}
                      {goal.recurrence.type}
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
                    <View key={idx} style={[styles.tag, { backgroundColor: COLORS.accentBlush + '30' }]}>
                      <Text style={[styles.tagText, { color: COLORS.accentBlush }]}>#{tag}</Text>
                    </View>
                  ))}
                </View>
              )}

              <Text style={styles.goalMeta}>
                Due: {createSafeDate(goal.dueDate).toLocaleDateString()}
                {goal.isOwner && <Text style={[styles.ownerBadge, { color: COLORS.accentWarm }]}> • Owned</Text>}
                {goal.isCollaborator && <Text style={[styles.collaboratorBadge, { color: COLORS.accentBlush }]}> • Collaborating</Text>}
              </Text>
            </View>
            
            <View style={styles.timeTrackingControls}>
              <ProgressCircle progress={goal.progress} size={60} />
            </View>
          </View>

          {/* ADDED: Click hint message */}
          <View style={styles.clickHintContainer}>
            <Ionicons name="chevron-down" size={14} color={COLORS.textSecondary} />
            <Text style={styles.clickHintText}>
              {isExpanded 
                ? "Tap to collapse milestones" 
                : hasMilestones 
                  ? `Tap to view ${goal.milestones.length} milestone${goal.milestones.length > 1 ? 's' : ''}`
                  : isEditable 
                    ? "Tap to add milestones"
                    : "Tap to view goal details"}
            </Text>
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
              <View style={styles.emptyMilestonesState}>
                <Ionicons name="flag-outline" size={32} color={COLORS.archived} />
                <Text style={styles.emptyMilestonesText}>
                  {isEditable 
                    ? "No milestones yet. Add milestones below to track progress."
                    : "No milestones added yet."}
                </Text>
              </View>
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
                      color={m.completed ? COLORS.success : isEditable ? COLORS.textSecondary : COLORS.archived}
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
                      <Ionicons name="trash-outline" size={18} color={COLORS.archived} />
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}

            {isEditable && (
              <KeyboardAvoidingView 
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
              >
                <View style={styles.milestoneInputContainer}>
                  <View style={{ flex: 1 }}>
                    <TextInput
                      style={[styles.input, { marginRight: 10, marginBottom: 8 }]}
                      placeholder="Add a new milestone"
                      placeholderTextColor={COLORS.archived}
                      value={newMilestoneTitle}
                      onChangeText={setNewMilestoneTitle}
                    />
                    <TouchableOpacity 
                      style={styles.datePickerButton} 
                      onPress={() => setShowMilestoneDatePicker(true)}
                    >
                      <Ionicons name="calendar-outline" size={16} color={COLORS.sage} />
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
                    style={[styles.milestoneAddButton, { backgroundColor: COLORS.sage }]}
                    onPress={() => {
                      handleAddMilestone(goal.id, newMilestoneTitle, newMilestoneDueDate);
                      setNewMilestoneTitle("");
                      setNewMilestoneDueDate(new Date());
                    }}
                  >
                    <Ionicons name="add" size={24} color="#fff" />
                  </TouchableOpacity>
                </View>
              </KeyboardAvoidingView>
            )}
          </View>
        )}

        {/* Actions */}
        <View style={styles.goalActions}>
          <TouchableOpacity
            onPress={() => openGoalModal(goal)}
            style={[styles.actionButton, !isEditable && styles.disabledAction]}
          >
            <Ionicons name="create-outline" size={22} color={isEditable ? COLORS.textSecondary : COLORS.archived} />
          </TouchableOpacity>

          {isEditable && (
            <TouchableOpacity onPress={() => openShareModal(goal)} style={styles.actionButton}>
              <Ionicons name="share-social-outline" size={22} color={COLORS.textSecondary} />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={() => handleDeleteGoal(goal)}
            style={[styles.actionButton, !isEditable && styles.disabledAction]}
          >
            <Ionicons name="trash-outline" size={22} color={isEditable ? COLORS.danger : COLORS.archived} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // --- TEMPLATES MODAL ---
  const TemplatesModal = () => (
    <Modal visible={showTemplatesModal} transparent animationType="fade">
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
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
                  <Ionicons name="add-circle" size={20} color={COLORS.sage} />
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
                  <Ionicons name="fitness" size={20} color={COLORS.sage} />
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
                  <Ionicons name="school" size={20} color={COLORS.sage} />
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
                  <Ionicons name="cash" size={20} color={COLORS.sage} />
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
      </KeyboardAvoidingView>
    </Modal>
  );

  return (
    <View style={styles.container}>
      <Header />
      
      {analyticsView === 'charts' ? (
        <ScrollView style={styles.goalsList}>
          {/* ADDED STATS TO PROGRESS OVERVIEW */}
          <View style={styles.chartContainer}>
            <Text style={styles.chartTitle}>Progress Overview</Text>
            <View style={styles.progressGrid}>
              <View style={styles.progressStat}>
                <Text style={styles.progressStatNumber}>{stats.total}</Text>
                <Text style={styles.progressStatLabel}>Total</Text>
              </View>
              <View style={styles.progressStat}>
                <Text style={[styles.progressStatNumber, { color: COLORS.success }]}>{stats.completed}</Text>
                <Text style={styles.progressStatLabel}>Completed</Text>
              </View>
              <View style={styles.progressStat}>
                <Text style={[styles.progressStatNumber, { color: COLORS.sage }]}>{stats.inProgress}</Text>
                <Text style={styles.progressStatLabel}>Active</Text>
              </View>
              <View style={styles.progressStat}>
                <Text style={[styles.progressStatNumber, { color: COLORS.danger }]}>{stats.overdue}</Text>
                <Text style={styles.progressStatLabel}>Overdue</Text>
              </View>
              <View style={styles.progressStat}>
                <Text style={[styles.progressStatNumber, { color: COLORS.archived }]}>{stats.archived}</Text>
                <Text style={styles.progressStatLabel}>Archived</Text>
              </View>
            </View>
          </View>
          
          <View style={styles.chartContainer}>
            <Text style={styles.chartTitle}>Performance Metrics</Text>
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
                <Text style={styles.progressStatLabel}>Completion Rate</Text>
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
                      color={CATEGORY_COLORS[category] || COLORS.textSecondary} 
                    />
                    <Text style={[styles.categoryStatName, { color: CATEGORY_COLORS[category] || COLORS.textPrimary }]}>
                      {CATEGORY_OPTIONS.find(c => c.value === category)?.label || category}
                    </Text>
                  </View>
                  <View style={styles.categoryStatBar}>
                    <View 
                      style={[
                        styles.categoryStatFill, 
                        { 
                          width: `${(data.completed / data.total) * 100}%`,
                          backgroundColor: CATEGORY_COLORS[category] || COLORS.sage
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
                placeholderTextColor={COLORS.archived}
              />
            </View>
            <TouchableOpacity 
              style={[styles.filterButton, showArchived && styles.filterButtonActive]}
              onPress={() => setShowArchived(!showArchived)}
            >
              <Ionicons name={showArchived ? "archive" : "archive-outline"} size={20} color={showArchived ? COLORS.sage : COLORS.textPrimary} />
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
                <Ionicons name="flag-outline" size={64} color={COLORS.archived} />
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
      {/* ==================== MODERN GOAL MODAL ==================== */}
      <Modal visible={isFormModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <View style={styles.modernModalOverlay}>
            {/* Blurred Background */}
            <View style={styles.modernModalBlur} />
            
            <View style={styles.modernModalContainer}>
              {/* Header with Progress */}
              <View style={styles.modernModalHeader}>
                <TouchableOpacity 
                  onPress={() => {
                    if (formStep > 1) {
                      animateToStep(formStep - 1);
                    } else {
                      setIsFormModalVisible(false);
                    }
                  }}
                  style={styles.modernBackButton}
                >
                  <Ionicons 
                    name={formStep === 1 ? "close" : "arrow-back"} 
                    size={24} 
                    color={COLORS.textPrimary} 
                  />
                </TouchableOpacity>
                
                <View style={styles.modernHeaderCenter}>
                  <Text style={styles.modernModalTitle}>
                    {isEditing ? "Edit Goal" : "Create Goal"}
                  </Text>
                  <Text style={styles.modernModalStepText}>
                    Step {formStep} of 4
                  </Text>
                </View>
                
                <View style={{ width: 40 }} />
              </View>
              
              {/* Progress Bar */}
              <View style={styles.modernProgressContainer}>
                <View style={styles.modernProgressBackground}>
                  <Animated.View 
                    style={[
                      styles.modernProgressFill,
                      { width: `${formProgress}%` }
                    ]}
                  />
                </View>
                <View style={styles.modernStepDots}>
                  {[1, 2, 3, 4].map((step) => (
                    <View 
                      key={step} 
                      style={[
                        styles.modernStepDot,
                        step <= formStep && styles.modernStepDotActive
                      ]}
                    />
                  ))}
                </View>
              </View>
              
              {/* Animated Content Container */}
              <Animated.View 
                style={[
                  styles.modernContentContainer,
                  {
                    opacity: fadeAnim,
                    transform: [{ translateX: slideAnim }]
                  }
                ]}
              >
                {/* STEP 1: Basic Info */}
                {formStep === 1 && (
                  <ScrollView style={styles.modernStepContent} showsVerticalScrollIndicator={false}>
                    <View style={styles.modernStepHeader}>
                      <View style={styles.modernIconCircle}>
                        <Ionicons name="bulb-outline" size={32} color={COLORS.accentWarm} />
                      </View>
                      <Text style={styles.modernStepTitle}>What's your goal?</Text>
                      <Text style={styles.modernStepSubtitle}>
                        Give your goal a clear and inspiring name
                      </Text>
                    </View>
                    
                    <View style={styles.modernInputGroup}>
                      <Text style={styles.modernLabel}>Goal Title *</Text>
                      <View style={styles.modernInputWrapper}>
                        <Ionicons name="flag-outline" size={20} color={COLORS.sage} style={styles.modernInputIcon} />
                        <TextInput 
                          style={styles.modernInput}
                          placeholder="e.g., Run a marathon, Learn Spanish..." 
                          value={goalTitle} 
                          onChangeText={setGoalTitle}
                          placeholderTextColor={COLORS.textSecondary + '80'}
                          autoFocus
                          maxLength={120}
                        />
                      </View>
                    </View>
                    
                    <View style={styles.modernInputGroup}>
                      <Text style={styles.modernLabel}>Description (optional)</Text>
                      <View style={[styles.modernInputWrapper, styles.modernTextArea]}>
                        <TextInput
                          style={[styles.modernInput, { height: 100, textAlignVertical: 'top' }]}
                          placeholder="Why is this goal important to you?"
                          value={goalDescription}
                          onChangeText={setGoalDescription}
                          multiline
                          placeholderTextColor={COLORS.textSecondary + '80'}
                          maxLength={500}
                        />
                      </View>
                    </View>
                    
                    <View style={styles.modernInputGroup}>
                      <Text style={styles.modernLabel}>Priority Level</Text>
                      <View style={styles.modernPriorityGrid}>
                        {PRIORITY_OPTIONS.map((priority) => (
                          <TouchableOpacity
                            key={priority.value}
                            style={[
                              styles.modernPriorityCard,
                              selectedPriority === priority.value && [
                                styles.modernPriorityCardActive,
                                { borderColor: priority.color, backgroundColor: priority.color + '15' }
                              ]
                            ]}
                            onPress={() => {
                              setSelectedPriority(priority.value);
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            }}
                          >
                            <View style={[
                              styles.modernPriorityIcon,
                              { backgroundColor: priority.color + '20' }
                            ]}>
                              <Ionicons 
                                name={
                                  priority.value === 'high' ? 'flame' :
                                  priority.value === 'medium' ? 'sunny' : 'leaf'
                                }
                                size={24} 
                                color={priority.color} 
                              />
                            </View>
                            <Text style={[
                              styles.modernPriorityText,
                              selectedPriority === priority.value && { 
                                color: priority.color,
                                fontWeight: '700'
                              }
                            ]}>
                              {priority.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  </ScrollView>
                )}
                
                {/* STEP 2: Category & Timeline */}
                {formStep === 2 && (
                  <ScrollView style={styles.modernStepContent} showsVerticalScrollIndicator={false}>
                    <View style={styles.modernStepHeader}>
                      <View style={styles.modernIconCircle}>
                        <Ionicons name="calendar-outline" size={32} color={COLORS.sage} />
                      </View>
                      <Text style={styles.modernStepTitle}>When & What?</Text>
                      <Text style={styles.modernStepSubtitle}>
                        Set your timeline and category
                      </Text>
                    </View>
                    
                    <View style={styles.modernInputGroup}>
                      <Text style={styles.modernLabel}>Due Date *</Text>
                      <TouchableOpacity 
                        style={styles.modernDateButton}
                        onPress={() => setShowDatePicker(true)}
                      >
                        <View style={styles.modernDateButtonContent}>
                          <View style={styles.modernDateIcon}>
                            <Ionicons name="calendar" size={24} color={COLORS.sage} />
                          </View>
                          <View style={styles.modernDateTextContainer}>
                            <Text style={styles.modernDateLabel}>Target Date</Text>
                            <Text style={styles.modernDateValue}>
                              {selectedDate.toLocaleDateString('en-US', { 
                                weekday: 'short',
                                month: 'short', 
                                day: 'numeric', 
                                year: 'numeric' 
                              })}
                            </Text>
                          </View>
                          <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
                        </View>
                      </TouchableOpacity>
                      {showDatePicker && (
                        <DateTimePicker 
                          value={selectedDate} 
                          mode="date" 
                          onChange={handleDateChange}
                          minimumDate={new Date()}
                          textColor={COLORS.textPrimary}
                          accentColor={COLORS.sage}
                          themeVariant="light"
                        />
                      )}
                    </View>
                    
                    <View style={styles.modernInputGroup}>
                      <Text style={styles.modernLabel}>Category</Text>
                      <View style={styles.modernCategoryGrid}>
                        {CATEGORY_OPTIONS.map((category) => (
                          <TouchableOpacity
                            key={category.value}
                            style={[
                              styles.modernCategoryCard,
                              selectedCategory === category.value && [
                                styles.modernCategoryCardActive,
                                { borderColor: category.color, backgroundColor: category.color + '10' }
                              ]
                            ]}
                            onPress={() => {
                              setSelectedCategory(category.value);
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            }}
                          >
                            <Ionicons 
                              name={category.icon} 
                              size={28} 
                              color={selectedCategory === category.value ? category.color : COLORS.textSecondary} 
                            />
                            <Text style={[
                              styles.modernCategoryText,
                              selectedCategory === category.value && { 
                                color: category.color,
                                fontWeight: '600'
                              }
                            ]}>
                              {category.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                    
                    <View style={styles.modernInputGroup}>
                      <Text style={styles.modernLabel}>Estimated Time (optional)</Text>
                      <View style={styles.modernInputWrapper}>
                        <Ionicons name="time-outline" size={20} color={COLORS.sage} style={styles.modernInputIcon} />
                        <TextInput
                          style={styles.modernInput}
                          placeholder="How many hours will this take?"
                          value={estimatedHours}
                          onChangeText={setEstimatedHours}
                          keyboardType="numeric"
                          placeholderTextColor={COLORS.textSecondary + '80'}
                        />
                        <Text style={styles.modernInputSuffix}>hours</Text>
                      </View>
                    </View>
                  </ScrollView>
                )}
                
                {/* STEP 3: Milestones & Tags */}
                {formStep === 3 && (
                  <ScrollView style={styles.modernStepContent} showsVerticalScrollIndicator={false}>
                    <View style={styles.modernStepHeader}>
                      <View style={styles.modernIconCircle}>
                        <Ionicons name="trail-sign-outline" size={32} color={COLORS.accentBlush} />
                      </View>
                      <Text style={styles.modernStepTitle}>Break it down</Text>
                      <Text style={styles.modernStepSubtitle}>
                        Add milestones and tags to track progress
                      </Text>
                    </View>
                    
                    {/* Milestones */}
                    <View style={styles.modernInputGroup}>
                      <Text style={styles.modernLabel}>Milestones (optional)</Text>
                      
                      {goalMilestones.length > 0 && (
                        <View style={styles.modernMilestonesList}>
                          {goalMilestones.map((milestone, index) => (
                            <View key={index} style={styles.modernMilestoneCard}>
                              <TouchableOpacity
                                style={styles.modernMilestoneCheck}
                                onPress={() => handleToggleMilestoneInForm(index)}
                              >
                                <Ionicons
                                  name={milestone.completed ? "checkmark-circle" : "ellipse-outline"}
                                  size={24}
                                  color={milestone.completed ? COLORS.success : COLORS.textSecondary}
                                />
                              </TouchableOpacity>
                              <View style={styles.modernMilestoneContent}>
                                <Text style={[
                                  styles.modernMilestoneTitle,
                                  milestone.completed && styles.modernMilestoneTitleCompleted
                                ]}>
                                  {milestone.title}
                                </Text>
                                {milestone.dueDate && (
                                  <Text style={styles.modernMilestoneDate}>
                                    <Ionicons name="calendar-outline" size={12} color={COLORS.textSecondary} />
                                    {' '}{createSafeDate(milestone.dueDate).toLocaleDateString()}
                                  </Text>
                                )}
                              </View>
                              <TouchableOpacity
                                onPress={() => handleRemoveMilestoneInForm(index)}
                                style={styles.modernMilestoneDelete}
                              >
                                <Ionicons name="close-circle" size={20} color={COLORS.danger} />
                              </TouchableOpacity>
                            </View>
                          ))}
                        </View>
                      )}
                      
                      {/* Add Milestone */}
                      <View style={styles.modernAddMilestoneContainer}>
                        <View style={styles.modernInputWrapper}>
                          <Ionicons name="add-circle-outline" size={20} color={COLORS.sage} style={styles.modernInputIcon} />
                          <TextInput
                            style={styles.modernInput}
                            placeholder="Add a milestone..."
                            value={newMilestoneTitle}
                            onChangeText={setNewMilestoneTitle}
                            placeholderTextColor={COLORS.textSecondary + '80'}
                          />
                        </View>
                        <TouchableOpacity 
                          style={styles.modernMilestoneDateButton}
                          onPress={() => setShowMilestoneDatePicker(true)}
                        >
                          <Ionicons name="calendar-outline" size={16} color={COLORS.sage} />
                        </TouchableOpacity>
                        <TouchableOpacity 
                          style={[
                            styles.modernAddMilestoneButton,
                            !newMilestoneTitle.trim() && styles.modernAddMilestoneButtonDisabled
                          ]}
                          onPress={handleAddMilestoneInForm}
                          disabled={!newMilestoneTitle.trim()}
                        >
                          <Ionicons name="add" size={20} color="#FFF" />
                        </TouchableOpacity>
                      </View>
                      {showMilestoneDatePicker && (
                        <DateTimePicker 
                          value={newMilestoneDueDate} 
                          mode="date" 
                          onChange={handleMilestoneDateChange}
                          minimumDate={new Date()}
                          maximumDate={selectedDate}
                          textColor={COLORS.textPrimary}
                          accentColor={COLORS.sage}
                          themeVariant="light"
                        />
                      )}
                    </View>
                    
                    {/* Tags */}
                    <View style={styles.modernInputGroup}>
                      <Text style={styles.modernLabel}>Tags (max 5)</Text>
                      
                      {tags.length > 0 && (
                        <View style={styles.modernTagsContainer}>
                          {tags.map((tag, idx) => (
                            <View key={idx} style={styles.modernTag}>
                              <Text style={styles.modernTagText}>#{tag}</Text>
                              <TouchableOpacity onPress={() => handleRemoveTag(tag)}>
                                <Ionicons name="close" size={16} color={COLORS.accentBlush} />
                              </TouchableOpacity>
                            </View>
                          ))}
                        </View>
                      )}
                      
                      <View style={styles.modernAddTagContainer}>
                        <View style={styles.modernInputWrapper}>
                          <Ionicons name="pricetag-outline" size={20} color={COLORS.sage} style={styles.modernInputIcon} />
                          <TextInput
                            style={styles.modernInput}
                            placeholder="Add a tag..."
                            value={tagInput}
                            onChangeText={setTagInput}
                            onSubmitEditing={handleAddTag}
                            placeholderTextColor={COLORS.textSecondary + '80'}
                          />
                        </View>
                        <TouchableOpacity 
                          style={[
                            styles.modernAddTagButton,
                            (tags.length >= 5 || !tagInput.trim()) && styles.modernAddTagButtonDisabled
                          ]}
                          onPress={handleAddTag}
                          disabled={tags.length >= 5 || !tagInput.trim()}
                        >
                          <Ionicons name="add" size={20} color="#FFF" />
                        </TouchableOpacity>
                      </View>
                      {tags.length >= 5 && (
                        <Text style={styles.modernHelperText}>Maximum tags reached</Text>
                      )}
                    </View>
                  </ScrollView>
                )}
                
                {/* STEP 4: Reminders & Advanced */}
                {formStep === 4 && (
                  <ScrollView style={styles.modernStepContent} showsVerticalScrollIndicator={false}>
                    <View style={styles.modernStepHeader}>
                      <View style={styles.modernIconCircle}>
                        <Ionicons name="notifications-outline" size={32} color={COLORS.sage} />
                      </View>
                      <Text style={styles.modernStepTitle}>Stay on track</Text>
                      <Text style={styles.modernStepSubtitle}>
                        Set up reminders and advanced options
                      </Text>
                    </View>
                    
                    {/* Notifications Toggle */}
                    <TouchableOpacity 
                      style={styles.modernFeatureCard}
                      onPress={() => {
                        const newValue = !enableNotifications;
                        setEnableNotifications(newValue);
                        if (newValue) {
                          const defaultTime = new Date(selectedDate.getTime() - DEFAULT_REMINDER_OFFSET);
                          const now = new Date();
                          if (defaultTime > now) {
                            setNotificationTime(defaultTime);
                            setTempNotificationTime(defaultTime);
                          }
                        }
                        setNotificationTimeMode('date');
                        setShowNotificationTimePicker(false);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                    >
                      <View style={styles.modernFeatureIcon}>
                        <Ionicons name="notifications" size={24} color={COLORS.sage} />
                      </View>
                      <View style={styles.modernFeatureContent}>
                        <Text style={styles.modernFeatureTitle}>Reminders</Text>
                        <Text style={styles.modernFeatureDescription}>
                          Get notified before your deadline
                        </Text>
                      </View>
                      <Switch
                        value={enableNotifications}
                        onValueChange={(value) => {
                          setEnableNotifications(value);
                          if (value) {
                            const defaultTime = new Date(selectedDate.getTime() - DEFAULT_REMINDER_OFFSET);
                            setNotificationTime(defaultTime);
                            setTempNotificationTime(defaultTime);
                          }
                          setNotificationTimeMode('date');
                          setShowNotificationTimePicker(false);
                        }}
                        trackColor={{ false: COLORS.border, true: COLORS.sage + '40' }}
                        thumbColor={enableNotifications ? COLORS.sage : COLORS.textSecondary}
                      />
                    </TouchableOpacity>
                    
                    {enableNotifications && (
                      <View style={styles.modernExpandedSection}>
                        {/* Reminder Date */}
                        <View style={styles.modernInputGroup}>
                          <Text style={styles.modernLabel}>Reminder Date</Text>
                          <TouchableOpacity 
                            style={styles.modernReminderTimeButton}
                            onPress={() => setShowNotificationDatePicker(true)}
                          >
                            <Ionicons name="calendar-outline" size={20} color={COLORS.sage} />
                            <View style={styles.modernReminderTimeContent}>
                              <Text style={styles.modernReminderTimeValue}>
                                {notificationTime.toLocaleDateString('en-US', { 
                                  weekday: 'short',
                                  month: 'short', 
                                  day: 'numeric',
                                  year: 'numeric'
                                })}
                              </Text>
                            </View>
                            <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
                          </TouchableOpacity>
                          {showNotificationDatePicker && (
                            <DateTimePicker 
                              value={notificationTime}
                              mode="date"
                              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                              onChange={(event, date) => {
                                if (Platform.OS === 'android') {
                                  setShowNotificationDatePicker(false);
                                }
                                if (event?.type === "set" && date) {
                                  const newDateTime = new Date(date);
                                  newDateTime.setHours(notificationTime.getHours());
                                  newDateTime.setMinutes(notificationTime.getMinutes());
                                  
                                  if (newDateTime >= selectedDate) {
                                    showMessage("Reminder date must be before the due date");
                                    return;
                                  }
                                  setNotificationTime(newDateTime);
                                }
                              }}
                              minimumDate={new Date()}
                              maximumDate={selectedDate}
                              textColor={COLORS.textPrimary}
                              accentColor={COLORS.sage}
                              themeVariant="light"
                            />
                          )}
                        </View>
                        
                        {/* Reminder Time */}
                        <View style={styles.modernInputGroup}>
                          <Text style={styles.modernLabel}>Reminder Time</Text>
                          <TouchableOpacity 
                            style={styles.modernReminderTimeButton}
                            onPress={() => setShowNotificationTimePicker(true)}
                          >
                            <Ionicons name="time-outline" size={20} color={COLORS.sage} />
                            <View style={styles.modernReminderTimeContent}>
                              <Text style={styles.modernReminderTimeValue}>
                                {notificationTime.toLocaleTimeString('en-US', { 
                                  hour: 'numeric', 
                                  minute: '2-digit',
                                  hour12: true 
                                })}
                              </Text>
                            </View>
                            <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
                          </TouchableOpacity>
                          {showNotificationTimePicker && (
                            <DateTimePicker 
                              value={notificationTime}
                              mode="time"
                              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                              onChange={(event, date) => {
                                if (Platform.OS === 'android') {
                                  setShowNotificationTimePicker(false);
                                }
                                if (event?.type === "set" && date) {
                                  const newDateTime = new Date(notificationTime);
                                  newDateTime.setHours(date.getHours());
                                  newDateTime.setMinutes(date.getMinutes());
                                  newDateTime.setSeconds(0);
                                  
                                  if (newDateTime >= selectedDate) {
                                    showMessage("Reminder time must be before the due date");
                                    return;
                                  }
                                  setNotificationTime(newDateTime);
                                }
                              }}
                              textColor={COLORS.textPrimary}
                              accentColor={COLORS.sage}
                              themeVariant="light"
                            />
                          )}
                        </View>
                        
                        {/* Custom Message */}
                        <View style={styles.modernInputGroup}>
                          <Text style={styles.modernLabel}>Custom Message (optional)</Text>
                          <View style={styles.modernInputWrapper}>
                            <TextInput
                              style={[styles.modernInput, { height: 60 }]}
                              placeholder="Custom reminder message..."
                              value={customNotificationMessage}
                              onChangeText={setCustomNotificationMessage}
                              multiline
                              placeholderTextColor={COLORS.textSecondary + '80'}
                            />
                          </View>
                        </View>
                      </View>
                    )}
                    
                    {/* Recurring Goal */}
                    <TouchableOpacity 
                      style={styles.modernFeatureCard}
                      onPress={() => {
                        setIsRecurring(!isRecurring);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                    >
                      <View style={styles.modernFeatureIcon}>
                        <Ionicons name="repeat" size={24} color={COLORS.recurring} />
                      </View>
                      <View style={styles.modernFeatureContent}>
                        <Text style={styles.modernFeatureTitle}>Recurring Goal</Text>
                        <Text style={styles.modernFeatureDescription}>
                          Repeat this goal automatically
                        </Text>
                      </View>
                      <Ionicons 
                        name={isRecurring ? "checkmark-circle" : "ellipse-outline"} 
                        size={28} 
                        color={isRecurring ? COLORS.recurring : COLORS.textSecondary} 
                      />
                    </TouchableOpacity>
                    
                    {isRecurring && (
                      <View style={styles.modernExpandedSection}>
                        <View style={styles.modernRecurrenceGrid}>
                          {RECURRENCE_OPTIONS.filter(opt => opt.value !== 'none').map((option) => (
                            <TouchableOpacity
                              key={option.value}
                              style={[
                                styles.modernRecurrenceCard,
                                recurrenceType === option.value && styles.modernRecurrenceCardActive
                              ]}
                              onPress={() => setRecurrenceType(option.value)}
                            >
                              <Text style={[
                                styles.modernRecurrenceText,
                                recurrenceType === option.value && styles.modernRecurrenceTextActive
                              ]}>
                                {option.label}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        
                        {recurrenceType !== 'none' && (
                          <View style={styles.modernIntervalContainer}>
                            <Text style={styles.modernIntervalLabel}>Repeat every</Text>
                            <View style={styles.modernIntervalInputWrapper}>
                              <TextInput
                                style={styles.modernIntervalInput}
                                value={recurrenceInterval.toString()}
                                onChangeText={(text) => {
                                  const num = parseInt(text) || 1;
                                  setRecurrenceInterval(num > 0 ? num : 1);
                                }}
                                keyboardType="numeric"
                              />
                              <Text style={styles.modernIntervalUnit}>
                                {recurrenceType === 'daily' ? 'day(s)' : 
                                 recurrenceType === 'weekly' ? 'week(s)' : 
                                 recurrenceType === 'monthly' ? 'month(s)' : 'year(s)'}
                              </Text>
                            </View>
                          </View>
                        )}
                      </View>
                    )}
                    
                    {/* Calendar Sync */}
                    <TouchableOpacity 
                      style={styles.modernFeatureCard}
                      onPress={() => {
                        setSyncToCalendar(!syncToCalendar);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                    >
                      <View style={styles.modernFeatureIcon}>
                        <Ionicons name="calendar" size={24} color={COLORS.info} />
                      </View>
                      <View style={styles.modernFeatureContent}>
                        <Text style={styles.modernFeatureTitle}>Calendar Sync</Text>
                        <Text style={styles.modernFeatureDescription}>
                          Add to device calendar
                        </Text>
                      </View>
                      <Switch
                        value={syncToCalendar}
                        onValueChange={setSyncToCalendar}
                        trackColor={{ false: COLORS.border, true: COLORS.info + '40' }}
                        thumbColor={syncToCalendar ? COLORS.info : COLORS.textSecondary}
                      />
                    </TouchableOpacity>
                  </ScrollView>
                )}
              </Animated.View>
              
              {/* Navigation Buttons */}
              <View style={styles.modernModalFooter}>
                {formStep < 4 ? (
                  <TouchableOpacity 
                    style={styles.modernNextButton}
                    onPress={() => {
                      if (formStep === 1 && !goalTitle.trim()) {
                        showMessage("Please enter a goal title");
                        return;
                      }
                      animateToStep(formStep + 1);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    }}
                  >
                    <Text style={styles.modernNextButtonText}>Continue</Text>
                    <Ionicons name="arrow-forward" size={20} color="#FFF" />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity 
                    style={styles.modernCreateButton}
                    onPress={handleSaveGoal}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#FFF" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={24} color="#FFF" />
                        <Text style={styles.modernCreateButtonText}>
                          {isEditing ? "Update Goal" : "Create Goal"}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Filters Modal */}
      <Modal visible={showFiltersModal} transparent animationType="slide">
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
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
                      <Ionicons name={option.icon} size={18} color={sortBy === option.value ? COLORS.sage : COLORS.textSecondary} />
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
                    <Ionicons name="apps" size={18} color={filterCategory === "all" ? COLORS.sage : COLORS.textSecondary} />
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
                      <Ionicons name={category.icon} size={18} color={filterCategory === category.value ? category.color : COLORS.textSecondary} />
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
        </KeyboardAvoidingView>
      </Modal>

      {/* Share Modal */}
      <Modal visible={shareModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
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
                    style={[styles.saveButton, { marginLeft: 8, paddingHorizontal: 12, marginTop: 0, backgroundColor: COLORS.accentBlush }]} 
                    onPress={handleAddShareEmail}
                    disabled={loading}
                  >
                    {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveButtonText}>Add</Text>}
                  </TouchableOpacity>
                </View>

                {shareEmailError ? <Text style={styles.errorText}>{shareEmailError}</Text> : null}

                <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 10 }}>
                  {shareCollaborators.map((collab) => (
                    <View key={collab.uid} style={[styles.emailPill, { backgroundColor: COLORS.accentBlush + '30' }]}>
                      <Text style={[styles.emailPillText, { color: COLORS.accentBlush }]}>{collab.displayName || collab.email}</Text>
                      <TouchableOpacity onPress={() => handleRemoveShareUid(collab.uid)} style={{ marginLeft: 6 }}>
                        <Ionicons name="close-circle" size={16} color={COLORS.accentBlush} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </ScrollView>

              <TouchableOpacity style={[styles.saveButton, { backgroundColor: COLORS.textPrimary }]} onPress={handleSaveSharing} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Share Goal</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
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
                <Ionicons name="document-text-outline" size={20} color={COLORS.sage} />
                <Text style={styles.filterOptionText}>JSON Format</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.filterOption} onPress={() => showMessage("CSV export coming soon!")}>
                <Ionicons name="document-outline" size={20} color={COLORS.textSecondary} />
                <Text style={styles.filterOptionText}>CSV Format (Coming Soon)</Text>
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity style={[styles.saveButton, { backgroundColor: COLORS.accentBlush }]} onPress={() => setShowExportModal(false)}>
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
    paddingTop: Platform.OS === 'ios' ? 50 : 30, 
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
    backgroundColor: COLORS.sage,
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
    borderColor: COLORS.shadowDark,
  },
  addButton: { 
    backgroundColor: COLORS.accentBlush, 
    borderRadius: 50, 
    padding: 12, 
    elevation: 4,
    shadowColor: COLORS.sage,
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
    borderColor: COLORS.shadowDark,
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
    borderColor: COLORS.shadowDark,
  },
  filterButtonActive: {
    backgroundColor: COLORS.sage + '15',
    borderColor: COLORS.sage,
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
    color: COLORS.archived, 
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
    borderColor: COLORS.shadowDark, 
    shadowColor: COLORS.nudeShadow, 
    shadowOpacity: 0.6, 
    shadowOffset: { width: 0, height: 4 }, 
    shadowRadius: 12, 
    elevation: 3 
  },
  goalItemOverdue: {
    borderColor: COLORS.danger + '40',
    backgroundColor: COLORS.danger + '05',
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
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: "600",
  },
  daysRemaining: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: "600",
    marginTop: 8,
  },
  overdueText: {
    color: COLORS.danger,
  },
  
  // New badge styles
  recurrenceBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  recurrenceText: {
    fontSize: 11,
    fontWeight: "600",
  },
  timeTrackingBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  timeTrackingText: {
    fontSize: 11,
    fontWeight: "600",
  },
  
  // Click hint styles
  clickHintContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.shadowDark,
    marginTop: 8,
  },
  clickHintText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginLeft: 6,
    fontStyle: 'italic',
  },
  goalCardTouchable: {
    paddingBottom: 4,
  },
  
  goalMeta: { 
    fontSize: 12, 
    color: COLORS.archived, 
    marginTop: 8, 
    fontWeight: "500" 
  },
  ownerBadge: { fontWeight: "700" },
  collaboratorBadge: { fontWeight: "700" },
  
  // Notification toggle
  notificationToggle: {
    marginLeft: 8,
    padding: 4,
  },
  
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
    borderColor: COLORS.sage,
  },
  timerButtonActive: {
    backgroundColor: COLORS.danger,
    borderColor: COLORS.danger,
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
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tagEdit: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tagText: {
    fontSize: 11,
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
    fontWeight: "700" 
  },
  
  // Milestones
  milestonesContainer: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: COLORS.shadowDark },
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
  emptyMilestonesState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    backgroundColor: COLORS.backgroundBase,
    borderRadius: 12,
    marginBottom: 12,
  },
  emptyMilestonesText: { 
    fontSize: 13, 
    color: COLORS.archived, 
    marginTop: 8,
    textAlign: 'center',
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
    color: COLORS.archived 
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
    borderTopColor: COLORS.shadowDark, 
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
    borderColor: COLORS.shadowDark, 
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
    borderColor: COLORS.shadowDark,
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
    borderColor: COLORS.shadowDark,
    backgroundColor: COLORS.backgroundBase,
    gap: 6,
  },
  categoryOptionSelected: {
    backgroundColor: COLORS.sage + '15',
    borderColor: COLORS.sage,
  },
  categoryOptionText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: "600",
  },
  categoryOptionTextSelected: {
    color: COLORS.sage,
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
    borderColor: COLORS.shadowDark,
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
    borderColor: COLORS.shadowDark, 
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
    color: COLORS.danger, 
    fontSize: 13, 
    marginBottom: 8, 
    textAlign: "center", 
    marginTop: 4 
  },
  
  // Email pill
  emailPill: { 
    flexDirection: "row", 
    alignItems: "center", 
    paddingHorizontal: 12, 
    paddingVertical: 8, 
    borderRadius: 20, 
    marginRight: 8, 
    marginBottom: 8 
  },
  emailPillText: { 
    fontWeight: "600",
    fontSize: 13,
  },
  
  // Notification badge
  notifBadge: { 
    backgroundColor: COLORS.danger, 
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
    borderColor: COLORS.shadowDark,
    backgroundColor: COLORS.backgroundBase,
    gap: 10,
  },
  filterOptionSelected: {
    backgroundColor: COLORS.sage + '15',
    borderColor: COLORS.sage,
  },
  filterOptionText: {
    fontSize: 15,
    color: COLORS.textSecondary,
    fontWeight: "600",
    flex: 1,
  },
  filterOptionTextSelected: {
    color: COLORS.sage,
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
    borderColor: COLORS.shadowDark,
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
    color: COLORS.sage,
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
    fontWeight: '600',
  },
  categoryStatBar: {
    height: 8,
    backgroundColor: COLORS.shadowDark,
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

  // Notification Section Styles
  notificationSection: {
    marginTop: 20,
    padding: 16,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.sage + "22",
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  helperText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
    marginBottom: 8,
  },
  notificationHint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    marginTop: 8,
    textAlign: 'center',
  },

/* ==================== MODERN MODAL STYLES ==================== */

modernModalOverlay: {
  flex: 1,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  justifyContent: 'flex-end',
},

modernModalBlur: {
  ...StyleSheet.absoluteFillObject,
  backgroundColor: 'rgba(0, 0, 0, 0.3)',
},

modernModalContainer: {
  backgroundColor: COLORS.card,
  borderTopLeftRadius: 20,
  borderTopRightRadius: 20,
  height: '92%',
  shadowColor: "#000",
  shadowOffset: { width: 0, height: -4 },
  shadowOpacity: 0.2,
  shadowRadius: 16,
  elevation: 8,
},

modernModalHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingHorizontal: 20,
  paddingTop: 24,
  paddingBottom: 12,
},

modernBackButton: {
  width: 40,
  height: 40,
  borderRadius: 12,
  backgroundColor: COLORS.backgroundBase,
  alignItems: 'center',
  justifyContent: 'center',
  borderWidth: 1,
  borderColor: COLORS.shadowDark,
},

modernHeaderCenter: {
  flex: 1,
  alignItems: 'center',
},

modernModalTitle: {
  fontSize: 22,
  fontWeight: '800',
  color: COLORS.textPrimary,
},

modernModalStepText: {
  fontSize: 12,
  color: COLORS.textSecondary,
  marginTop: 2,
  fontWeight: '600',
},

/* Progress Bar */
modernProgressContainer: {
  paddingHorizontal: 20,
  paddingBottom: 20,
},

modernProgressBackground: {
  height: 4,
  backgroundColor: COLORS.backgroundBase,
  borderRadius: 2,
  overflow: 'hidden',
  borderWidth: 1,
  borderColor: COLORS.shadowDark,
},

modernProgressFill: {
  height: '100%',
  backgroundColor: COLORS.sage,
  borderRadius: 2,
},

modernStepDots: {
  flexDirection: 'row',
  justifyContent: 'center',
  marginTop: 12,
  gap: 6,
},

modernStepDot: {
  width: 6,
  height: 6,
  borderRadius: 3,
  backgroundColor: COLORS.shadowDark,
},

modernStepDotActive: {
  backgroundColor: COLORS.sage,
  width: 20,
},

/* Content Container */
modernContentContainer: {
  flex: 1,
},

modernStepContent: {
  flex: 1,
  paddingHorizontal: 20,
},

/* Step Header */
modernStepHeader: {
  alignItems: 'center',
  marginBottom: 24,
  paddingTop: 8,
},

modernIconCircle: {
  width: 64,
  height: 64,
  borderRadius: 32,
  backgroundColor: COLORS.backgroundBase,
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: 12,
  borderWidth: 1,
  borderColor: COLORS.shadowDark,
},

modernStepTitle: {
  fontSize: 20,
  fontWeight: '800',
  color: COLORS.textPrimary,
  marginBottom: 6,
},

modernStepSubtitle: {
  fontSize: 14,
  color: COLORS.textSecondary,
  textAlign: 'center',
  lineHeight: 20,
  paddingHorizontal: 20,
},

/* Input Groups */
modernInputGroup: {
  marginBottom: 20,
},

modernLabel: {
  fontSize: 14,
  fontWeight: '700',
  color: COLORS.textPrimary,
  marginBottom: 8,
},

modernInputWrapper: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: COLORS.backgroundBase,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: COLORS.shadowDark,
  paddingHorizontal: 14,
  minHeight: 50,
},

modernInputIcon: {
  marginRight: 10,
},

modernInput: {
  flex: 1,
  fontSize: 15,
  color: COLORS.textPrimary,
  fontWeight: '500',
  paddingVertical: 12,
},

modernInputSuffix: {
  fontSize: 13,
  color: COLORS.textSecondary,
  fontWeight: '600',
  marginLeft: 8,
},

modernTextArea: {
  minHeight: 100,
  alignItems: 'flex-start',
  paddingVertical: 12,
},

modernHelperText: {
  fontSize: 12,
  color: COLORS.textSecondary,
  marginTop: 4,
},

/* Priority Cards */
modernPriorityGrid: {
  flexDirection: 'row',
  justifyContent: 'space-between',
},

modernPriorityCard: {
  width: '31%',
  backgroundColor: COLORS.backgroundBase,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: COLORS.shadowDark,
  padding: 12,
  alignItems: 'center',
  gap: 8,
},

modernPriorityCardActive: {
  borderWidth: 2,
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.08,
  shadowRadius: 4,
  elevation: 2,
},

modernPriorityIcon: {
  width: 40,
  height: 40,
  borderRadius: 20,
  alignItems: 'center',
  justifyContent: 'center',
},

modernPriorityText: {
  fontSize: 13,
  fontWeight: '600',
  color: COLORS.textPrimary,
  textAlign: 'center',
},

/* Date Button */
modernDateButton: {
  backgroundColor: COLORS.backgroundBase,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: COLORS.shadowDark,
  overflow: 'hidden',
},

modernDateButtonContent: {
  flexDirection: 'row',
  alignItems: 'center',
  padding: 14,
},

modernDateIcon: {
  width: 44,
  height: 44,
  borderRadius: 12,
  backgroundColor: COLORS.sage + '20',
  alignItems: 'center',
  justifyContent: 'center',
  marginRight: 12,
},

modernDateTextContainer: {
  flex: 1,
},

modernDateLabel: {
  fontSize: 11,
  color: COLORS.textSecondary,
  fontWeight: '600',
  marginBottom: 2,
},

modernDateValue: {
  fontSize: 15,
  fontWeight: '700',
  color: COLORS.textPrimary,
},

/* Category Grid */
modernCategoryGrid: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  justifyContent: 'space-between',
},

modernCategoryCard: {
  width: '30%',
  backgroundColor: COLORS.backgroundBase,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: COLORS.shadowDark,
  padding: 12,
  alignItems: 'center',
  gap: 6,
  aspectRatio: 1,
  justifyContent: 'center',
  marginBottom: 8,
},

modernCategoryCardActive: {
  borderWidth: 2,
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.08,
  shadowRadius: 4,
  elevation: 2,
},

modernCategoryText: {
  fontSize: 11,
  fontWeight: '600',
  color: COLORS.textPrimary,
  textAlign: 'center',
},

/* Milestones */
modernMilestonesList: {
  marginBottom: 12,
},

modernMilestoneCard: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: COLORS.backgroundBase,
  borderRadius: 12,
  padding: 12,
  borderWidth: 1,
  borderColor: COLORS.shadowDark,
  marginBottom: 8,
},

modernMilestoneCheck: {
  marginRight: 10,
},

modernMilestoneContent: {
  flex: 1,
},

modernMilestoneTitle: {
  fontSize: 14,
  fontWeight: '600',
  color: COLORS.textPrimary,
  marginBottom: 2,
},

modernMilestoneTitleCompleted: {
  textDecorationLine: 'line-through',
  color: COLORS.textSecondary,
},

modernMilestoneDate: {
  fontSize: 11,
  color: COLORS.textSecondary,
  fontWeight: '500',
},

modernMilestoneDelete: {
  padding: 4,
},

modernAddMilestoneContainer: {
  flexDirection: 'row',
  alignItems: 'center',
},

modernMilestoneDateButton: {
  width: 44,
  height: 44,
  borderRadius: 12,
  backgroundColor: COLORS.backgroundBase,
  alignItems: 'center',
  justifyContent: 'center',
  borderWidth: 1,
  borderColor: COLORS.shadowDark,
  marginLeft: 8,
},

modernAddMilestoneButton: {
  width: 44,
  height: 44,
  borderRadius: 12,
  backgroundColor: COLORS.sage,
  alignItems: 'center',
  justifyContent: 'center',
  shadowColor: COLORS.sage,
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.3,
  shadowRadius: 4,
  elevation: 3,
  marginLeft: 8,
},

modernAddMilestoneButtonDisabled: {
  backgroundColor: COLORS.shadowDark,
  opacity: 0.5,
  shadowOpacity: 0,
  elevation: 0,
},

/* Tags */
modernTagsContainer: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  marginBottom: 10,
},

modernTag: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: COLORS.accentBlush + '20',
  borderRadius: 12,
  paddingHorizontal: 12,
  paddingVertical: 6,
  gap: 6,
  borderWidth: 1,
  borderColor: COLORS.accentBlush + '40',
  marginRight: 8,
  marginBottom: 8,
},

modernTagText: {
  fontSize: 12,
  fontWeight: '600',
  color: COLORS.accentBlush,
},

modernAddTagContainer: {
  flexDirection: 'row',
  alignItems: 'center',
},

modernAddTagButton: {
  width: 44,
  height: 44,
  borderRadius: 12,
  backgroundColor: COLORS.accentBlush,
  alignItems: 'center',
  justifyContent: 'center',
  shadowColor: COLORS.accentBlush,
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.3,
  shadowRadius: 4,
  elevation: 3,
  marginLeft: 8,
},

modernAddTagButtonDisabled: {
  backgroundColor: COLORS.shadowDark,
  opacity: 0.5,
  shadowOpacity: 0,
  elevation: 0,
},

/* Feature Cards */
modernFeatureCard: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: COLORS.backgroundBase,
  borderRadius: 12,
  padding: 14,
  marginBottom: 10,
  borderWidth: 1,
  borderColor: COLORS.shadowDark,
},

modernFeatureIcon: {
  width: 44,
  height: 44,
  borderRadius: 12,
  backgroundColor: COLORS.card,
  alignItems: 'center',
  justifyContent: 'center',
  marginRight: 12,
  borderWidth: 1,
  borderColor: COLORS.shadowDark,
},

modernFeatureContent: {
  flex: 1,
},

modernFeatureTitle: {
  fontSize: 15,
  fontWeight: '700',
  color: COLORS.textPrimary,
  marginBottom: 2,
},

modernFeatureDescription: {
  fontSize: 12,
  color: COLORS.textSecondary,
  fontWeight: '500',
},

/* Expanded Sections */
modernExpandedSection: {
  backgroundColor: COLORS.backgroundBase,
  borderRadius: 12,
  padding: 12,
  marginTop: -4,
  marginBottom: 10,
  gap: 10,
  borderWidth: 1,
  borderColor: COLORS.shadowDark,
},

modernReminderTimeButton: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: COLORS.card,
  borderRadius: 12,
  padding: 12,
  borderWidth: 1,
  borderColor: COLORS.shadowDark,
},

modernReminderTimeContent: {
  flex: 1,
  marginLeft: 10,
},

modernReminderTimeLabel: {
  fontSize: 11,
  color: COLORS.textSecondary,
  fontWeight: '600',
  marginBottom: 2,
},

modernReminderTimeValue: {
  fontSize: 14,
  fontWeight: '700',
  color: COLORS.textPrimary,
},

/* Recurrence */
modernRecurrenceGrid: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  justifyContent: 'space-between',
},

modernRecurrenceCard: {
  width: '48%',
  backgroundColor: COLORS.card,
  borderRadius: 12,
  padding: 10,
  alignItems: 'center',
  borderWidth: 1,
  borderColor: COLORS.shadowDark,
  marginBottom: 8,
},

modernRecurrenceCardActive: {
  borderColor: COLORS.recurring,
  backgroundColor: COLORS.recurring + '15',
  borderWidth: 2,
},

modernRecurrenceText: {
  fontSize: 12,
  fontWeight: '600',
  color: COLORS.textSecondary,
},

modernRecurrenceTextActive: {
  color: COLORS.recurring,
  fontWeight: '700',
},

modernIntervalContainer: {
  backgroundColor: COLORS.card,
  borderRadius: 12,
  padding: 12,
  flexDirection: 'row',
  alignItems: 'center',
  borderWidth: 1,
  borderColor: COLORS.shadowDark,
},

modernIntervalLabel: {
  fontSize: 13,
  fontWeight: '600',
  color: COLORS.textPrimary,
  marginRight: 10,
},

modernIntervalInputWrapper: {
  flexDirection: 'row',
  alignItems: 'center',
  flex: 1,
},

modernIntervalInput: {
  backgroundColor: COLORS.backgroundBase,
  borderRadius: 8,
  padding: 8,
  fontSize: 15,
  fontWeight: '700',
  color: COLORS.textPrimary,
  textAlign: 'center',
  width: 60,
  marginRight: 8,
  borderWidth: 1,
  borderColor: COLORS.shadowDark,
},

modernIntervalUnit: {
  fontSize: 13,
  fontWeight: '600',
  color: COLORS.textSecondary,
},

/* Footer */
modernModalFooter: {
  padding: 20,
  paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  borderTopWidth: 1,
  borderTopColor: COLORS.shadowDark,
  backgroundColor: COLORS.card,
},

modernNextButton: {
  backgroundColor: COLORS.sage,
  borderRadius: 12,
  height: 52,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  shadowColor: COLORS.sage,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.3,
  shadowRadius: 8,
  elevation: 4,
},

modernNextButtonText: {
  fontSize: 16,
  fontWeight: '700',
  color: '#FFFFFF',
},

modernCreateButton: {
  backgroundColor: COLORS.textPrimary,
  borderRadius: 12,
  height: 52,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.3,
  shadowRadius: 8,
  elevation: 4,
},

modernCreateButtonText: {
  fontSize: 16,
  fontWeight: '700',
  color: '#FFFFFF',
},

// Border utility class
border: {
  borderWidth: 1,
  borderColor: COLORS.shadowDark,
},
});