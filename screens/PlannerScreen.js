// PlannerScreen.js - Final Production Version with Calendar Integration (December 12, 2025)
// Updated with fixed notifications - Only system push notifications

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from "@react-native-community/datetimepicker";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import * as Notifications from 'expo-notifications';
import * as Calendar from 'expo-calendar'; // Calendar integration
import React, { useEffect, useMemo, useReducer, useRef, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  Modal,
  Platform,
  ScrollView,
  Switch,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Swipeable from "react-native-gesture-handler/Swipeable";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "firebase/firestore";

import { useApp } from "../context/AppContext";
import { db } from "../firebaseConfig";

// Import only push notification functions
import {
  scheduleTaskNotification,
  cancelTaskNotification,
  requestNotificationPermissions,
} from "../utils/notifications";

const { width } = Dimensions.get("window");

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/* THEME */
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
};

const CATEGORY_COLORS = {
  work: COLORS.accentWarm,
  personal: COLORS.accentBlush,
  other: COLORS.sage,
};

const PRIORITY_COLORS = {
  high: COLORS.accentBlush,
  medium: COLORS.accentWarm,
  low: COLORS.sage,
};

const triggerHaptic = async (style = "light") => {
  try {
    await Haptics.impactAsync(
      style === "heavy" ? Haptics.ImpactFeedbackStyle.Heavy :
      style === "medium" ? Haptics.ImpactFeedbackStyle.Medium :
      Haptics.ImpactFeedbackStyle.Light
    );
  } catch (e) {}
};

/* Natural Date Parser */
const weekdayMap = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

function parseNaturalDate(text) {
  if (!text || typeof text !== "string") return null;
  const t = text.toLowerCase();
  const now = new Date();

  if (/\btoday\b/.test(t)) return new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
  if (/\btomorrow\b/.test(t)) {
    const d = new Date(now); d.setDate(now.getDate() + 1); return d;
  }

  let m = t.match(/\bin\s+(\d+)\s*hours?\b/);
  if (m) { const d = new Date(now); d.setHours(now.getHours() + parseInt(m[1], 10)); return d; }
  m = t.match(/\bin\s+(\d+)\s*mins?\b/);
  if (m) { const d = new Date(now); d.setMinutes(now.getMinutes() + parseInt(m[1], 10)); return d; }

  m = t.match(/\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (m) {
    const target = weekdayMap[m[1]];
    const d = new Date(now);
    let diff = (target + 7 - d.getDay()) % 7 || 7;
    d.setDate(d.getDate() + diff);
    return d;
  }

  m = t.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  if (m) {
    let hour = parseInt(m[1], 10);
    const minute = m[2] ? parseInt(m[2], 10) : 0;
    const ampm = (m[3] || "").toLowerCase();
    if (ampm === "pm" && hour < 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;
    const d = new Date(now);
    d.setHours(hour, minute, 0, 0);
    if (d < now) d.setDate(d.getDate() + 1);
    return d;
  }

  return null;
}

/* Form Reducer - with syncToCalendar */
const initialFormState = {
  title: "",
  description: "",
  dueDate: new Date(),
  dueTime: new Date(),
  category: "personal",
  priority: "medium",
  recurrence: "none",
  isEditing: false,
  currentPlannerItem: null,
  enableNotifications: true,
  notificationTime: new Date(Date.now() - 30 * 60000),
  customNotificationMessage: "",
  syncToCalendar: false,
};

function formReducer(state, action) {
  switch (action.type) {
    case "SET":
      return { ...state, [action.key]: action.value };
    case "RESET":
      return {
        ...initialFormState,
        dueDate: new Date(),
        dueTime: new Date(),
        notificationTime: new Date(Date.now() - 30 * 60000),
      };
    case "LOAD_ITEM":
      const due = action.item.dueDate ? new Date(action.item.dueDate) : new Date();
      const notifTime = action.item.notificationTime
        ? new Date(action.item.notificationTime)
        : new Date(due.getTime() - 30 * 60000);
      return {
        ...state,
        isEditing: true,
        currentPlannerItem: action.item,
        title: action.item.title || "",
        description: action.item.description || "",
        dueDate: due,
        dueTime: due,
        category: action.item.category || "personal",
        priority: action.item.priority || "medium",
        recurrence: action.item.recurrence || "none",
        enableNotifications: action.item.enableNotifications !== false,
        notificationTime: notifTime,
        customNotificationMessage: action.item.customNotificationMessage || "",
        syncToCalendar: action.item.syncToCalendar || false,
      };
    default:
      return state;
  }
}

/* TaskItem Component - Minimal actions */
const TaskItem = React.memo(function TaskItem({
  item,
  handleToggleCompleted,
  handleToggleExpand,
  handleUpdateSubtask,
  isExpanded,
  onLongPressSelect,
  selectionMode,
  selected,
  confirmDelete,
  openPlannerModal,
}) {
  const swipeableRef = useRef(null);
  const expandAnim = useRef(new Animated.Value(isExpanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(expandAnim, {
      toValue: isExpanded ? 1 : 0,
      duration: 260,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [isExpanded]);

  const height = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [90, 210 + (item.subtasks?.length || 0) * 36],
  });

  const getPriorityColor = (p) => PRIORITY_COLORS[p] || "#ccc";
  const getCategoryColor = (c) => CATEGORY_COLORS[c] || "#ccc";

  const renderLeftActions = (progress, dragX) => {
    const scale = dragX.interpolate({ inputRange: [0, 80], outputRange: [0, 1], extrapolate: "clamp" });
    return (
      <View style={styles.leftAction}>
        <Animated.View style={[styles.swipeAction, { backgroundColor: COLORS.success, transform: [{ scale }] }]}>
          <Ionicons name="checkmark-circle-outline" size={24} color="#fff" />
          <Text style={styles.actionText}>Complete</Text>
        </Animated.View>
      </View>
    );
  };

  const renderRightActions = (progress, dragX) => {
    const scale = dragX.interpolate({ inputRange: [-80, 0], outputRange: [1, 0], extrapolate: "clamp" });
    return (
      <View style={styles.rightAction}>
        <Animated.View style={[styles.swipeAction, { backgroundColor: COLORS.danger, transform: [{ scale }] }]}>
          <Text style={styles.actionText}>Delete</Text>
          <Ionicons name="trash-outline" size={24} color="#fff" />
        </Animated.View>
      </View>
    );
  };

  const handleSwipeComplete = useCallback(() => {
    triggerHaptic("heavy");
    handleToggleCompleted(item);
    swipeableRef.current?.close();
  }, [item, handleToggleCompleted]);

  const handleSwipeDelete = useCallback(() => {
    triggerHaptic("heavy");
    confirmDelete(item);
    swipeableRef.current?.close();
  }, [item, confirmDelete]);

  return (
    <Swipeable
      ref={swipeableRef}
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
      onSwipeableLeftOpen={handleSwipeComplete}
      onSwipeableRightOpen={handleSwipeDelete}
      overshootLeft={false}
      overshootRight={false}
      containerStyle={{ marginBottom: 12 }}
    >
      <Animated.View style={[styles.taskCard, { height }]}>
        <TouchableOpacity
          onPress={() => handleToggleExpand(item.id)}
          activeOpacity={0.9}
          style={styles.taskCardPressable}
          onLongPress={() => onLongPressSelect(item.id)}
        >
          <View style={styles.taskRow}>
            <TouchableOpacity onPress={() => handleToggleCompleted(item)} style={styles.checkbox}>
              <Ionicons
                name={item.completed ? "checkbox" : "square-outline"}
                size={22}
                color={item.completed ? COLORS.textPrimary : "#999"}
              />
            </TouchableOpacity>

            <View style={styles.taskBody}>
              <View style={styles.titleRow}>
                <View style={[styles.categoryDot, { backgroundColor: getCategoryColor(item.category) }]} />
                <Text style={[styles.taskTitle, item.completed && styles.completed]} numberOfLines={1}>
                  {item.title}
                </Text>
              </View>

              <View style={styles.metaRow}>
                <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(item.priority) }]}>
                  <Text style={styles.priorityText}>{item.priority?.toUpperCase()}</Text>
                </View>
                <Text style={styles.metaText}>
                  {item.dueDate ? new Date(item.dueDate).toLocaleDateString() : "—"}
                </Text>
                {item.enableNotifications !== false && !item.completed && item.notificationId && (
                  <Ionicons name="notifications" size={14} color={COLORS.info} style={{ marginLeft: 8 }} />
                )}
              </View>
            </View>

            {selectionMode && (
              <View style={{ paddingLeft: 8 }}>
                <Ionicons
                  name={selected ? "checkmark-circle" : "ellipse-outline"}
                  size={22}
                  color={selected ? COLORS.accentBlush : "#999"}
                />
              </View>
            )}
          </View>

          {/* Only Edit and Delete */}
          {!isExpanded && (
            <View style={styles.cardActions}>
              <TouchableOpacity onPress={() => openPlannerModal(item)} style={styles.iconBtn}>
                <Ionicons name="create-outline" size={20} color={COLORS.sage} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => confirmDelete(item)} style={styles.iconBtn}>
                <Ionicons name="trash-outline" size={20} color={COLORS.danger} />
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>

        <Animated.View style={[styles.expandedContent, { opacity: expandAnim }]}>
          <Text style={styles.taskDescFull}>{item.description || "No description provided."}</Text>
          <Text style={styles.subtaskHeader}>Subtasks</Text>
          <ScrollView style={styles.subtaskList} nestedScrollEnabled>
            {(item.subtasks || []).map((sub, idx) => (
              <View key={idx} style={styles.subtaskRow}>
                <TouchableOpacity onPress={() => handleUpdateSubtask(item.id, idx, !sub.completed)} style={styles.subtaskCheckbox}>
                  <Ionicons name={sub.completed ? "checkbox-outline" : "square-outline"} size={18} color={sub.completed ? COLORS.sage : "#999"} />
                  <Text style={[styles.subtaskText, sub.completed && styles.subtaskCompleted]}>{sub.title}</Text>
                </TouchableOpacity>
              </View>
            ))}
            <TextInput
              placeholder="+ Add new subtask..."
              placeholderTextColor="#A98467"
              style={styles.subtaskInput}
              onSubmitEditing={(e) => {
                const v = e.nativeEvent.text?.trim();
                if (v) handleUpdateSubtask(item.id, null, false, v);
              }}
            />
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Swipeable>
  );
});

/* Animated Empty State */
const AnimatedEmptyState = React.memo(() => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  return (
    <Animated.View style={[styles.emptyContainer, { transform: [{ scale: pulseAnim }] }]}>
      <Ionicons name="clipboard-outline" size={48} color={COLORS.textSecondary} />
      <Text style={styles.empty}>Your planner is empty. Tap + to create a task!</Text>
    </Animated.View>
  );
});

/* Calendar Grid */
const CalendarGrid = React.memo(({ tasks, onDateSelect, selectedDate }) => {
  const today = useMemo(() => new Date(), []);
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  const taskDates = useMemo(() => {
    const set = new Set();
    tasks.forEach(t => {
      const d = t.dueDate instanceof Date ? t.dueDate : new Date(t.dueDate);
      if (d && !isNaN(d)) set.add(d.toDateString());
    });
    return set;
  }, [tasks]);

  const daysInMonth = useMemo(() => new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate(), [viewDate]);
  const firstDay = useMemo(() => new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay(), [viewDate]);
  const gridDays = useMemo(() => Array(firstDay).fill(null).concat(Array.from({ length: daysInMonth }, (_, i) => i + 1)), [firstDay, daysInMonth]);

  const changeMonth = useCallback((offset) => {
    setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
    triggerHaptic("light");
  }, []);

  const isToday = useCallback((day) => {
    if (!day) return false;
    const d = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    return d.toDateString() === today.toDateString();
  }, [viewDate, today]);

  const hasTask = useCallback((day) => {
    if (!day) return false;
    const d = new Date(viewDate.getFullYear(), viewDate.getMonth(), day).toDateString();
    return taskDates.has(d);
  }, [viewDate, taskDates]);

  return (
    <View style={styles.calendarContainer}>
      <View style={styles.monthSelector}>
        <TouchableOpacity onPress={() => changeMonth(-1)}>
          <Ionicons name="chevron-back" size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.monthTitle}>{viewDate.toLocaleString("en-US", { month: "long", year: "numeric" })}</Text>
        <TouchableOpacity onPress={() => changeMonth(1)}>
          <Ionicons name="chevron-forward" size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>
      </View>

      <View style={styles.dayNamesRow}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
          <Text key={day} style={styles.dayName}>{day}</Text>
        ))}
      </View>

      <View style={styles.dayGrid}>
        {gridDays.map((day, i) => {
          const date = day ? new Date(viewDate.getFullYear(), viewDate.getMonth(), day) : null;
          const isSelected = date && selectedDate && date.toDateString() === selectedDate.toDateString();
          return (
            <TouchableOpacity
              key={i}
              disabled={!day}
              style={[styles.dayCell, isToday(day) && styles.dayCellToday, isSelected && styles.dayCellSelected]}
              onPress={() => day && onDateSelect(date)}
            >
              <Text style={[styles.dayText, isSelected && styles.dayTextSelected, isToday(day) && { fontWeight: "700" }]}>{day || ""}</Text>
              {day && hasTask(day) && <View style={styles.taskDot} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
});

/* Calendar Sync Helpers */
const requestCalendarPermissions = async () => {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert("Permission Required", "Calendar access is needed to sync tasks.");
    return false;
  }
  return true;
};

const addTaskToDeviceCalendar = async (task, showMessage) => {
  if (!(await requestCalendarPermissions())) return;

  try {
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const defaultCalendar = calendars.find(c => c.allowsModifications) || calendars[0];
    if (!defaultCalendar) {
      showMessage("No modifiable calendar found");
      return;
    }

    const startDate = new Date(task.dueDate);
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1 hour event

    const eventDetails = {
      title: task.title,
      startDate,
      endDate,
      notes: task.description || '',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      alarms: [{ relativeOffset: -30 }], // 30 min reminder
    };

    let eventId = task.calendarEventId;
    if (eventId) {
      await Calendar.updateEventAsync(eventId, eventDetails);
    } else {
      eventId = await Calendar.createEventAsync(defaultCalendar.id, eventDetails);
      await updateDoc(doc(db, "planner", task.id), { calendarEventId: eventId });
    }

    showMessage("Synced to device calendar");
  } catch (error) {
    console.error("Calendar sync error:", error);
    showMessage("Calendar sync failed");
  }
};

const removeTaskFromDeviceCalendar = async (taskId, calendarEventId) => {
  if (calendarEventId) {
    try {
      await Calendar.deleteEventAsync(calendarEventId);
    } catch (e) {
      console.error("Failed to remove calendar event:", e);
    }
  }
};

/* Main PlannerScreen */
export default function PlannerScreen() {
  const navigation = useNavigation();
  const { user } = useApp();

  const [plannerItems, setPlannerItems] = useState([]);
  const [filteredPlannerItems, setFilteredPlannerItems] = useState([]);
  const [isFormModalVisible, setIsFormModalVisible] = useState(false);
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterDate, setFilterDate] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isExpandedId, setIsExpandedId] = useState(null);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showNotificationTimePicker, setShowNotificationTimePicker] = useState(false);
  const [isConfirmModalVisible, setIsConfirmModalVisible] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalMessage, setModalMessage] = useState("");

  const [form, dispatch] = useReducer(formReducer, initialFormState);
  const isMounted = useRef(true);
  const parsedDateRef = useRef(null);

  useEffect(() => () => { isMounted.current = false; }, []);

  const showMessage = useCallback((msg) => {
    setModalMessage(msg);
    setShowModal(true);
    setTimeout(() => setShowModal(false), 1800);
  }, []);

  const categories = [{ key: "work", label: "Work" }, { key: "personal", label: "Personal" }, { key: "other", label: "Other" }];
  const priorities = [{ key: "high", label: "High" }, { key: "medium", label: "Medium" }, { key: "low", label: "Low" }];
  const notificationTimes = [
    { label: "At due time", minutes: 0 },
    { label: "15 min before", minutes: -15 },
    { label: "30 min before", minutes: -30 },
    { label: "1 hour before", minutes: -60 },
    { label: "1 day before", minutes: -1440 },
    { label: "Custom", minutes: null },
  ];

  /* Notification Setup */
  useEffect(() => {
    const setup = async () => {
      await requestNotificationPermissions();
    };
    setup();
  }, []);

  /* Safe Notification Scheduling - No Duplicates */
  const scheduleTaskNotificationSafe = async (task) => {
    if (!task.enableNotifications || task.completed || !task.dueDate) return;

    const dueTime = new Date(task.dueDate);
    let notificationTime = task.notificationTime ? new Date(task.notificationTime) : new Date(dueTime.getTime() - 30 * 60000);

    if (notificationTime <= new Date()) return;

    if (task.notificationId) {
      await cancelTaskNotification(task.id);
    }

    try {
      const notificationId = await scheduleTaskNotification(task);
      if (notificationId && isMounted.current) {
        await updateDoc(doc(db, "planner", task.id), { notificationId, notificationTime });
      }
    } catch (error) {
      console.error("Notification scheduling error:", error);
    }
  };

  /* Firestore Listener */
  useEffect(() => {
    if (!user) {
      setPlannerItems([]);
      return;
    }

    const q = query(collection(db, "planner"), where("userId", "==", user.uid));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map(d => {
        const data = d.data();
        const dueDate = data.dueDate?.toDate?.() || new Date();
        const notificationTime = data.notificationTime?.toDate?.();
        return {
          id: d.id,
          ...data,
          dueDate,
          notificationTime,
          enableNotifications: data.enableNotifications !== false,
          syncToCalendar: data.syncToCalendar || false,
          calendarEventId: data.calendarEventId,
        };
      });

      items.sort((a, b) => {
        const orderA = a.order ?? 999;
        const orderB = b.order ?? 999;
        if (orderA !== orderB) return orderA - orderB;
        return (a.dueDate?.getTime() || 0) - (b.dueDate?.getTime() || 0);
      });

      setPlannerItems(items);
      AsyncStorage.setItem(`planner_cache_${user.uid}`, JSON.stringify(items));
    }, (err) => console.error("Firestore error:", err));

    return unsub;
  }, [user]);

  /* Schedule notifications safely */
  useEffect(() => {
    const scheduleAll = async () => {
      for (const task of plannerItems) {
        if (task.enableNotifications && !task.completed && task.dueDate && new Date(task.dueDate) > new Date()) {
          await scheduleTaskNotificationSafe(task);
        }
      }
    };
    if (user) scheduleAll();
  }, [plannerItems, user]);

  /* Filtering & Search */
  useEffect(() => {
    let filtered = [...plannerItems];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(item =>
        item.title?.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q)
      );
    }

    if (filterCategory !== "all") filtered = filtered.filter(item => item.category === filterCategory);
    if (filterDate) {
      filtered = filtered.filter(item => {
        const d = new Date(item.dueDate);
        return d.getFullYear() === filterDate.getFullYear() &&
               d.getMonth() === filterDate.getMonth() &&
               d.getDate() === filterDate.getDate();
      });
    }

    setFilteredPlannerItems(filtered);
    setIsExpandedId(null);
  }, [plannerItems, searchQuery, filterCategory, filterDate]);

  /* Natural Date Parsing */
  useEffect(() => {
    const combined = form.title + " " + form.description;
    if (combined === parsedDateRef.current || form.isEditing) return;
    parsedDateRef.current = combined;

    const parsed = parseNaturalDate(combined);
    if (parsed) {
      dispatch({ type: "SET", key: "dueDate", value: parsed });
      dispatch({ type: "SET", key: "dueTime", value: parsed });
      const notif = new Date(parsed.getTime() - 30 * 60000);
      dispatch({ type: "SET", key: "notificationTime", value: notif });
    }
  }, [form.title, form.description, form.isEditing]);

  const openPlannerModal = useCallback((item = null) => {
    triggerHaptic("light");
    setSelectionMode(false);
    setSelectedIds([]);
    if (item) dispatch({ type: "LOAD_ITEM", item });
    else dispatch({ type: "RESET" });
    setIsFormModalVisible(true);
  }, []);

  const handleSavePlannerItem = async () => {
    if (!form.title.trim()) { showMessage("Please enter a task title."); return; }
    if (!user) { showMessage("Please log in to save tasks."); return; }

    setLoading(true);
    triggerHaptic("heavy");

    try {
      const combined = new Date(
        form.dueDate.getFullYear(),
        form.dueDate.getMonth(),
        form.dueDate.getDate(),
        form.dueTime.getHours(),
        form.dueTime.getMinutes()
      );

      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        dueDate: combined,
        userId: user.uid,
        completed: form.currentPlannerItem?.completed || false,
        category: form.category,
        priority: form.priority,
        recurrence: form.recurrence,
        subtasks: form.currentPlannerItem?.subtasks || [],
        enableNotifications: form.enableNotifications,
        notificationTime: form.enableNotifications ? form.notificationTime : null,
        customNotificationMessage: form.customNotificationMessage.trim(),
        syncToCalendar: form.syncToCalendar,
      };

      let savedTask;
      if (form.isEditing && form.currentPlannerItem) {
        await updateDoc(doc(db, "planner", form.currentPlannerItem.id), payload);
        showMessage("Task updated");
        savedTask = { id: form.currentPlannerItem.id, ...payload, dueDate: combined };
        await scheduleTaskNotificationSafe(savedTask);
        if (form.syncToCalendar) await addTaskToDeviceCalendar(savedTask, showMessage);
      } else {
        const maxOrder = plannerItems.reduce((max, item) => Math.max(max, item.order || 0), 0) + 1;
        const docRef = await addDoc(collection(db, "planner"), {
          ...payload,
          order: maxOrder,
          createdAt: serverTimestamp(),
          notificationId: null,
        });
        showMessage("Task added");
        savedTask = { id: docRef.id, ...payload, dueDate: combined };
        setTimeout(() => scheduleTaskNotificationSafe(savedTask), 500);
        if (form.syncToCalendar) setTimeout(() => addTaskToDeviceCalendar(savedTask, showMessage), 1000);
      }

      setIsFormModalVisible(false);
    } catch (err) {
      console.error("Save error:", err);
      showMessage("Save failed");
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = useCallback((item) => {
    triggerHaptic("medium");
    setItemToDelete(item);
    setIsConfirmModalVisible(true);
  }, []);

  const handleDeletePlannerItem = async () => {
    if (!itemToDelete?.id) return;
    triggerHaptic("heavy");
    try {
      await cancelTaskNotification(itemToDelete.id);
      await removeTaskFromDeviceCalendar(itemToDelete.id, itemToDelete.calendarEventId);
      await deleteDoc(doc(db, "planner", itemToDelete.id));
      showMessage("Task deleted");
      
      setIsConfirmModalVisible(false);
      setItemToDelete(null);
    } catch (err) {
      console.error("Delete error:", err);
      showMessage("Delete failed");
    }
  };

  const handleToggleCompleted = async (item) => {
    try {
      await updateDoc(doc(db, "planner", item.id), { completed: !item.completed });
      if (!item.completed) {
        await cancelTaskNotification(item.id);
        if (item.calendarEventId) await removeTaskFromDeviceCalendar(item.id, item.calendarEventId);
      } else {
        if (item.enableNotifications) await scheduleTaskNotificationSafe(item);
        if (item.syncToCalendar) await addTaskToDeviceCalendar(item, showMessage);
      }
    } catch (err) {
      console.error("Toggle error:", err);
    }
  };

  const handleUpdateSubtask = async (taskId, subtaskIndex, completed, newTitle) => {
    const item = plannerItems.find(i => i.id === taskId);
    if (!item) return;

    let newSubtasks = [...(item.subtasks || [])];
    if (newTitle) newSubtasks.push({ title: newTitle, completed: false });
    else if (subtaskIndex !== null) newSubtasks[subtaskIndex].completed = completed;

    try {
      await updateDoc(doc(db, "planner", taskId), { subtasks: newSubtasks });
    } catch (e) {
      showMessage("Subtask update failed");
    }
  };

  const handleToggleExpand = (id) => setIsExpandedId(prev => prev === id ? null : id);

  const onLongPressSelect = (id) => {
    if (!selectionMode) {
      setSelectionMode(true);
      setSelectedIds([id]);
      triggerHaptic("medium");
    } else {
      setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    }
  };

  const batchComplete = async () => {
    if (selectedIds.length === 0) return;
    setLoading(true);
    try {
      await Promise.all(selectedIds.map(id => updateDoc(doc(db, "planner", id), { completed: true })));
      await Promise.all(selectedIds.map(id => cancelTaskNotification(id)));
      showMessage("Tasks completed");
      setSelectionMode(false);
      setSelectedIds([]);
    } catch (e) {
      showMessage("Batch complete failed");
    } finally {
      setLoading(false);
    }
  };

  const batchDelete = async () => {
    if (selectedIds.length === 0) return;
    Alert.alert(`Delete ${selectedIds.length} tasks?`, "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        setLoading(true);
        try {
          await Promise.all(selectedIds.map(id => cancelTaskNotification(id)));
          await Promise.all(selectedIds.map(id => deleteDoc(doc(db, "planner", id))));
          showMessage("Tasks deleted");
          setSelectionMode(false);
          setSelectedIds([]);
        } catch (e) {
          showMessage("Batch delete failed");
        } finally {
          setLoading(false);
        }
      }},
    ]);
  };

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Planner</Text>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {selectionMode ? (
            <>
              <TouchableOpacity onPress={() => { setSelectionMode(false); setSelectedIds([]); }} style={{ marginRight: 16 }}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={batchComplete} style={styles.headerAdd}>
                <Ionicons name="checkmark-done-outline" size={20} color={COLORS.accentBlush} />
                <Text style={styles.headerAddText}>Complete</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={batchDelete} style={[styles.headerAdd, { marginLeft: 12 }]}>
                <Ionicons name="trash-outline" size={20} color={COLORS.danger} />
                <Text style={styles.headerAddText}>Delete</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={[styles.headerAdd, { marginLeft: 16 }]} onPress={() => openPlannerModal()}>
              <Ionicons name="add" size={28} color={COLORS.accentBlush} />
              <Text style={styles.headerAddText}>Add Task</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color="#999" style={{ marginRight: 8 }} />
        <TextInput
          placeholder="Search tasks..."
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles.searchInput}
        />
      </View>

      {/* Filters */}
      <View style={styles.filters}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterButtons}>
          <TouchableOpacity onPress={() => { setFilterCategory("all"); setFilterDate(null); }} style={[styles.filterBtn, filterCategory === "all" && !filterDate && styles.filterBtnActive]}>
            <Text style={[styles.filterBtnText, filterCategory === "all" && !filterDate && styles.filterBtnTextActive]}>All</Text>
          </TouchableOpacity>
          {categories.map(c => (
            <TouchableOpacity key={c.key} onPress={() => { setFilterCategory(c.key); setFilterDate(null); }} style={[styles.filterBtn, filterCategory === c.key && styles.filterBtnActive]}>
              <View style={[styles.smallDot, { backgroundColor: CATEGORY_COLORS[c.key] }]} />
              <Text style={[styles.filterBtnText, filterCategory === c.key && styles.filterBtnTextActive]}>{c.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={() => { setCalendarVisible(p => !p); setFilterCategory("all"); }} style={[styles.filterBtn, calendarVisible && styles.filterBtnActive]}>
            <Ionicons name="calendar-outline" size={14} color={calendarVisible ? "#fff" : COLORS.textPrimary} />
            <Text style={[styles.filterBtnText, calendarVisible && styles.filterBtnTextActive, { marginLeft: 6 }]}>
              {calendarVisible ? "Close Calendar" : (filterDate ? filterDate.toLocaleDateString() : "By Date")}
            </Text>
            {filterDate && !calendarVisible && (
              <TouchableOpacity onPress={() => setFilterDate(null)} style={{ marginLeft: 8 }}>
                <Ionicons name="close-circle" size={14} color="#fff" />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Calendar */}
      {calendarVisible && (
        <View style={{ marginHorizontal: 20, marginBottom: 12 }}>
          <CalendarGrid tasks={plannerItems} onDateSelect={date => { setFilterDate(date); setCalendarVisible(false); triggerHaptic("light"); }} selectedDate={filterDate} />
        </View>
      )}

      {/* Task List */}
      <ScrollView contentContainerStyle={styles.listContainer}>
        {filteredPlannerItems.length === 0 ? (
          <AnimatedEmptyState />
        ) : (
          filteredPlannerItems.map((item, index) => (
            <TaskItem
              key={item.id}
              item={item}
              handleToggleCompleted={handleToggleCompleted}
              handleToggleExpand={handleToggleExpand}
              handleUpdateSubtask={handleUpdateSubtask}
              isExpanded={item.id === isExpandedId}
              onLongPressSelect={onLongPressSelect}
              selectionMode={selectionMode}
              selected={selectedIds.includes(item.id)}
              confirmDelete={confirmDelete}
              openPlannerModal={openPlannerModal}
            />
          ))
        )}
      </ScrollView>

      {/* Form Modal */}
      <Modal visible={isFormModalVisible} transparent animationType="slide" onRequestClose={() => setIsFormModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{form.isEditing ? "Edit Task" : "New Task"}</Text>
              <TouchableOpacity onPress={() => setIsFormModalVisible(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>Title</Text>
              <TextInput value={form.title} onChangeText={t => dispatch({ type: "SET", key: "title", value: t })} style={styles.input} placeholder="Task title" />

              <Text style={styles.inputLabel}>Description</Text>
              <TextInput value={form.description} onChangeText={t => dispatch({ type: "SET", key: "description", value: t })} style={[styles.input, { height: 90 }]} placeholder="Details (optional)" multiline />

              <Text style={styles.inputLabel}>Priority</Text>
              <View style={styles.categoryRow}>
                {priorities.map(p => (
                  <TouchableOpacity key={p.key} style={[styles.catBtn, form.priority === p.key && { backgroundColor: PRIORITY_COLORS[p.key] }]} onPress={() => dispatch({ type: "SET", key: "priority", value: p.key })}>
                    <Text style={[styles.catText, form.priority === p.key && { color: "#fff" }]}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Due Date & Time</Text>
              <View style={styles.dateTimeRow}>
                <TouchableOpacity onPress={() => setShowDatePicker(true)} style={[styles.input, styles.dateTimeButton]}>
                  <Ionicons name="calendar-outline" size={18} color={COLORS.sage} />
                  <Text style={styles.dateTimeText}>{form.dueDate.toLocaleDateString()}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowTimePicker(true)} style={[styles.input, styles.dateTimeButton]}>
                  <Ionicons name="time-outline" size={18} color={COLORS.sage} />
                  <Text style={styles.dateTimeText}>{form.dueTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
                </TouchableOpacity>
              </View>

              {showDatePicker && (
                <DateTimePicker value={form.dueDate} mode="date" onChange={(e, d) => { setShowDatePicker(false); if (d) dispatch({ type: "SET", key: "dueDate", value: d }); }} />
              )}
              {showTimePicker && (
                <DateTimePicker value={form.dueTime} mode="time" onChange={(e, d) => { setShowTimePicker(false); if (d) dispatch({ type: "SET", key: "dueTime", value: d }); }} />
              )}

              <Text style={styles.inputLabel}>Category</Text>
              <View style={styles.categoryRow}>
                {categories.map(c => (
                  <TouchableOpacity key={c.key} style={[styles.catBtn, form.category === c.key && { backgroundColor: CATEGORY_COLORS[c.key] }]} onPress={() => dispatch({ type: "SET", key: "category", value: c.key })}>
                    <Text style={[styles.catText, form.category === c.key && { color: "#fff" }]}>{c.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Recurrence</Text>
              <View style={styles.categoryRow}>
                {["none", "daily", "weekly", "monthly"].map(r => (
                  <TouchableOpacity key={r} style={[styles.catBtnSmall, form.recurrence === r && { backgroundColor: COLORS.accentBlush }]} onPress={() => dispatch({ type: "SET", key: "recurrence", value: r })}>
                    <Text style={[styles.catTextSmall, form.recurrence === r && { color: "#fff" }]}>{r.charAt(0).toUpperCase() + r.slice(1)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Notifications */}
              <View style={styles.notificationSection}>
                <View style={styles.notificationHeader}>
                  <Ionicons name="notifications-outline" size={18} color={COLORS.sage} />
                  <Text style={[styles.inputLabel, { marginLeft: 8 }]}>Notifications</Text>
                  <Switch
                    value={form.enableNotifications}
                    onValueChange={v => dispatch({ type: "SET", key: "enableNotifications", value: v })}
                    trackColor={{ false: "#ccc", true: COLORS.sage }}
                  />
                </View>

                {form.enableNotifications && (
                  <>
                    <Text style={[styles.inputLabel, { marginTop: 12 }]}>Remind me</Text>
                    <View style={styles.notificationTimeGrid}>
                      {notificationTimes.map(opt => {
                        const active = opt.minutes === null || 
                          form.notificationTime.getTime() === new Date(form.dueDate.getTime() + opt.minutes * 60000).getTime();
                        return (
                          <TouchableOpacity
                            key={opt.label}
                            style={[styles.notificationTimeBtn, active && styles.notificationTimeBtnActive]}
                            onPress={() => {
                              if (opt.minutes === null) {
                                setShowNotificationTimePicker(true);
                              } else {
                                dispatch({ type: "SET", key: "notificationTime", value: new Date(form.dueDate.getTime() + opt.minutes * 60000) });
                              }
                            }}
                          >
                            <Text style={[styles.notificationTimeText, active && styles.notificationTimeTextActive]}>{opt.label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {showNotificationTimePicker && (
                      <DateTimePicker
                        value={form.notificationTime}
                        mode="datetime"
                        onChange={(e, d) => {
                          setShowNotificationTimePicker(false);
                          if (d) dispatch({ type: "SET", key: "notificationTime", value: d });
                        }}
                      />
                    )}

                    <Text style={[styles.inputLabel, { marginTop: 12 }]}>Custom Message (optional)</Text>
                    <TextInput
                      value={form.customNotificationMessage}
                      onChangeText={t => dispatch({ type: "SET", key: "customNotificationMessage", value: t })}
                      style={[styles.input, { height: 60 }]}
                      placeholder="Custom message..."
                      multiline
                    />

                    <Text style={styles.notificationHint}>
                      Notified at: {form.notificationTime.toLocaleString()}
                    </Text>
                  </>
                )}
              </View>

              {/* Calendar Sync */}
              <View style={styles.notificationSection}>
                <View style={styles.notificationHeader}>
                  <Ionicons name="calendar-outline" size={18} color={COLORS.sage} />
                  <Text style={[styles.inputLabel, { marginLeft: 8 }]}>Sync to Device Calendar</Text>
                  <Switch
                    value={form.syncToCalendar}
                    onValueChange={v => dispatch({ type: "SET", key: "syncToCalendar", value: v })}
                    trackColor={{ false: "#ccc", true: COLORS.sage }}
                  />
                </View>
                {form.syncToCalendar && (
                  <Text style={styles.notificationHint}>
                    Task will appear in your phone's calendar (syncs with Google/Apple)
                  </Text>
                )}
              </View>
            </ScrollView>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSavePlannerItem} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>{form.isEditing ? "Update" : "Save"} Task</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Delete Confirmation */}
      <Modal visible={isConfirmModalVisible} transparent animationType="fade">
        <View style={styles.confirmModalOverlay}>
          <View style={styles.confirmModalContainer}>
            <Ionicons name="warning" size={48} color={COLORS.danger} />
            <Text style={styles.confirmModalTitle}>Delete Task?</Text>
            <Text style={styles.confirmModalText}>
              Permanently delete <Text style={{ fontWeight: "bold" }}>{itemToDelete?.title || "this task"}</Text>?
            </Text>
            <View style={styles.confirmModalButtons}>
              <TouchableOpacity style={[styles.confirmButton, styles.cancelConfirmButton]} onPress={() => { setIsConfirmModalVisible(false); setItemToDelete(null); }}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.confirmButton, styles.deleteConfirmButton]} onPress={handleDeletePlannerItem}>
                <Text style={styles.confirmButtonText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Transient Message */}
      <Modal visible={showModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.messageBox}>
            <Text style={{ color: COLORS.textPrimary, fontWeight: "600" }}>{modalMessage}</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* Styles */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.backgroundBase },
  header: { paddingTop: Platform.OS === 'ios' ? 50 : 18, paddingHorizontal: 20, paddingBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: COLORS.backgroundBase },
  headerTitle: { fontSize: 24, fontWeight: "900", color: COLORS.textPrimary },
  headerAdd: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.card, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 24, shadowColor: COLORS.nudeShadow, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.7, shadowRadius: 14, elevation: 6 },
  headerAddText: { color: COLORS.accentBlush, fontWeight: "700", marginLeft: 8 },
  headerIconBtn: { padding: 10, borderRadius: 20, backgroundColor: COLORS.card, shadowColor: COLORS.nudeShadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 3 },

  searchRow: { marginHorizontal: 20, marginBottom: 12, backgroundColor: COLORS.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, flexDirection: "row", alignItems: "center", shadowColor: COLORS.nudeShadow, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.6, shadowRadius: 12, elevation: 4 },
  searchInput: { flex: 1, fontSize: 15, color: COLORS.textPrimary },

  filters: { paddingHorizontal: 20, marginBottom: 8 },
  filterButtons: { flexDirection: "row", alignItems: "center" },
  filterBtn: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.card, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, marginRight: 10, borderWidth: 1, borderColor: "#eee" },
  filterBtnActive: { backgroundColor: COLORS.accentBlush, borderColor: COLORS.accentBlush },
  filterBtnText: { marginLeft: 6, color: COLORS.textPrimary, fontWeight: "600", fontSize: 13 },
  filterBtnTextActive: { color: "#fff" },
  smallDot: { width: 8, height: 8, borderRadius: 4 },

  listContainer: { paddingHorizontal: 20, paddingBottom: 40 },
  emptyContainer: { justifyContent: "center", alignItems: "center", padding: 30, marginTop: 60 },
  empty: { textAlign: "center", color: COLORS.textSecondary, marginTop: 15, fontSize: 16, fontWeight: "500" },

  taskCard: { backgroundColor: COLORS.card, borderRadius: 14, overflow: "hidden", shadowColor: COLORS.nudeShadow, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.6, shadowRadius: 14, elevation: 4, borderWidth: 0.5, borderColor: "#eee" },
  taskCardPressable: { padding: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  taskRow: { flexDirection: "row", alignItems: "flex-start", flex: 1 },
  checkbox: { paddingRight: 10, paddingTop: 2 },
  taskBody: { flex: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  categoryDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  taskTitle: { fontSize: 16, fontWeight: "700", color: COLORS.textPrimary, flexShrink: 1 },
  completed: { textDecorationLine: "line-through", color: "#999" },
  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginRight: 8 },
  priorityText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  metaText: { color: "#777", fontSize: 12 },
  cardActions: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", paddingHorizontal: 16, marginTop: 8 },
  iconBtn: { padding: 8, marginLeft: 12 },

  expandedContent: { paddingHorizontal: 16, paddingBottom: 16, borderTopWidth: 1, borderTopColor: "#eee" },
  taskDescFull: { color: COLORS.textPrimary, fontSize: 14, marginVertical: 8 },
  subtaskHeader: { fontSize: 13, fontWeight: "700", color: COLORS.textSecondary, marginBottom: 6 },
  subtaskList: { maxHeight: 150 },
  subtaskRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  subtaskCheckbox: { flexDirection: "row", alignItems: "center" },
  subtaskText: { marginLeft: 8, fontSize: 14, color: COLORS.textPrimary },
  subtaskCompleted: { textDecorationLine: "line-through", color: "#999" },
  subtaskInput: { marginTop: 10, paddingVertical: 8, fontSize: 14, color: COLORS.textPrimary, borderBottomWidth: 1, borderBottomColor: COLORS.accentBlush + "55" },

  leftAction: { justifyContent: "center", alignItems: "flex-end", paddingLeft: 20 },
  rightAction: { justifyContent: "center", alignItems: "flex-end", paddingRight: 20 },
  swipeAction: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 20, borderRadius: 14 },
  actionText: { color: "white", fontWeight: "700", fontSize: 16, marginLeft: 8 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center" },
  modalCard: { width: "92%", maxHeight: "90%", backgroundColor: COLORS.layer, borderRadius: 16, padding: 20, shadowColor: COLORS.nudeShadow, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.7, shadowRadius: 20, elevation: 10 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: COLORS.textPrimary },

  inputLabel: { fontSize: 13, fontWeight: "700", color: COLORS.textSecondary, marginTop: 16, marginBottom: 6 },
  input: { backgroundColor: COLORS.card, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: "#eee", marginBottom: 8, color: COLORS.textPrimary },
  dateTimeRow: { flexDirection: "row", justifyContent: "space-between" },
  dateTimeButton: { flex: 1, marginHorizontal: 6, flexDirection: "row", alignItems: "center", justifyContent: "center" },
  dateTimeText: { marginLeft: 8, fontSize: 15, fontWeight: "700", color: COLORS.textPrimary },

  categoryRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 8 },
  catBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, backgroundColor: COLORS.card, marginRight: 10, marginBottom: 8, borderWidth: 1, borderColor: "#eee" },
  catText: { color: COLORS.textPrimary, fontWeight: "700" },
  catBtnSmall: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: COLORS.card, marginRight: 8, marginTop: 5, borderWidth: 1, borderColor: "#eee" },
  catTextSmall: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 13 },

  saveBtn: { marginTop: 20, backgroundColor: COLORS.accentBlush, paddingVertical: 16, borderRadius: 12, alignItems: "center" },
  saveBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },

  messageBox: { backgroundColor: COLORS.card, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12, shadowColor: COLORS.nudeShadow, shadowOpacity: 0.8, shadowRadius: 12, elevation: 8 },

  notificationSection: { marginTop: 20, padding: 16, backgroundColor: COLORS.card, borderRadius: 12, borderWidth: 1, borderColor: COLORS.sage + "22" },
  notificationHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  notificationTimeGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 },
  notificationTimeBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: COLORS.backgroundBase, marginRight: 8, marginBottom: 8, borderWidth: 1, borderColor: '#eee' },
  notificationTimeBtnActive: { backgroundColor: COLORS.sage, borderColor: COLORS.sage },
  notificationTimeText: { color: COLORS.textPrimary, fontSize: 12, fontWeight: '600' },
  notificationTimeTextActive: { color: '#fff' },
  notificationHint: { fontSize: 12, color: COLORS.textSecondary, fontStyle: 'italic', marginTop: 8, textAlign: 'center' },

  // Calendar and Confirmation Modal styles
  calendarContainer: { backgroundColor: COLORS.card, borderRadius: 14, padding: 12, shadowColor: COLORS.nudeShadow, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.6, shadowRadius: 12, elevation: 4 },
  monthSelector: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  monthTitle: { fontSize: 16, fontWeight: "700", color: COLORS.textPrimary },
  dayNamesRow: { flexDirection: "row", justifyContent: "space-between", paddingBottom: 5, borderBottomWidth: 1, borderBottomColor: "#eee" },
  dayName: { width: (width - 40 - 24) / 7, textAlign: "center", color: COLORS.textSecondary, fontWeight: "600", fontSize: 12 },
  dayGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 5 },
  dayCell: { width: (width - 40 - 24) / 7, height: 40, justifyContent: "center", alignItems: "center", marginVertical: 1, borderRadius: 8, position: "relative" },
  dayCellToday: { borderWidth: 1, borderColor: COLORS.accentWarm },
  dayCellSelected: { backgroundColor: COLORS.accentBlush },
  dayText: { color: COLORS.textPrimary, fontSize: 14 },
  dayTextSelected: { color: "#fff" },
  taskDot: { position: "absolute", bottom: 5, width: 5, height: 5, borderRadius: 2.5, backgroundColor: COLORS.sage },

  confirmModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  confirmModalContainer: { width: '85%', backgroundColor: COLORS.card, borderRadius: 18, padding: 25, alignItems: 'center', shadowColor: COLORS.nudeShadow, shadowOpacity: 1, shadowOffset: { width: 0, height: 12 }, shadowRadius: 20, elevation: 10 },
  confirmModalTitle: { fontSize: 20, fontWeight: "700", color: COLORS.textPrimary, marginVertical: 12 },
  confirmModalText: { fontSize: 15, textAlign: 'center', color: COLORS.textSecondary, marginBottom: 25, lineHeight: 22 },
  confirmModalButtons: { flexDirection: 'row', width: '100%' },
  confirmButton: { flex: 1, padding: 14, borderRadius: 12, alignItems: 'center', marginHorizontal: 8 },
  deleteConfirmButton: { backgroundColor: COLORS.danger },
  cancelConfirmButton: { backgroundColor: COLORS.textSecondary },
  confirmButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  cancelButtonText: { color: COLORS.card, fontWeight: '700', fontSize: 16 },
});