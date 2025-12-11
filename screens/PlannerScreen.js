// PlannerScreen.js
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from "@react-native-community/datetimepicker";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import * as Notifications from 'expo-notifications';
import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";
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

const { width } = Dimensions.get("window");

// Enhanced Notification Handler Configuration
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

// CATEGORY UPDATE: Updated categories to Work, Personal, Other
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

// Small utility: play tap sound placeholder (no-op if not implemented)
const playTapSound = async () => {};
const triggerHaptic = async (style = "light") => {
  try {
    if (style === "heavy")
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    else if (style === "medium")
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch (e) {}
};

/* -----------------------
   Small Natural Date Parser (heuristic)
   ----------------------- */
const weekdayMap = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function parseNaturalDate(text) {
  if (!text || typeof text !== "string") return null;
  const t = text.toLowerCase();

  const now = new Date();

  // today
  if (/\btoday\b/.test(t)) {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
  }

  // tomorrow
  if (/\btomorrow\b/.test(t)) {
    const d = new Date(now);
    d.setDate(now.getDate() + 1);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), now.getHours(), now.getMinutes());
  }

  // in X hours / minutes
  let m = t.match(/\bin\s+(\d+)\s*hours?\b/);
  if (m) {
    const d = new Date(now);
    d.setHours(now.getHours() + parseInt(m[1], 10));
    return d;
  }
  m = t.match(/\bin\s+(\d+)\s*mins?\b/);
  if (m) {
    const d = new Date(now);
    d.setMinutes(now.getMinutes() + parseInt(m[1], 10));
    return d;
  }

  // next <weekday>
  m = t.match(/\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (m) {
    const target = weekdayMap[m[1]];
    const d = new Date(now);
    const day = d.getDay();
    let diff = (target + 7 - day) % 7;
    if (diff === 0) diff = 7; // next = not this week
    d.setDate(d.getDate() + diff);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), now.getHours(), now.getMinutes());
  }

  // time-only like "at 6pm" or "6:30 pm"
  m = t.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  if (m) {
    let hour = parseInt(m[1], 10);
    const minute = m[2] ? parseInt(m[2], 10) : 0;
    const ampm = (m[3] || "").toLowerCase();
    if (ampm === "pm" && hour < 12) hour += 12;
    if (ampm === "am" && hour === 12) hour = 0;
    const d = new Date(now);
    d.setHours(hour, minute, 0, 0);
    // if time already passed today, schedule tomorrow
    if (d.getTime() < now.getTime()) d.setDate(d.getDate() + 1);
    return d;
  }

  // fallback: no parse
  return null;
}

/* -----------------------
   useReducer for form state - UPDATED
   ----------------------- */
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
  notificationTime: new Date(new Date().setMinutes(new Date().getMinutes() - 30)),
  customNotificationMessage: "",
};

function formReducer(state, action) {
  switch (action.type) {
    case "SET":
      return { ...state, [action.key]: action.value };
    case "RESET":
      return { ...initialFormState };
    case "LOAD_ITEM":
      return {
        ...state,
        isEditing: true,
        currentPlannerItem: action.item,
        title: action.item.title || "",
        description: action.item.description || "",
        dueDate:
          action.item.dueDate instanceof Date
            ? action.item.dueDate
            : new Date(action.item.dueDate),
        dueTime:
          action.item.dueDate instanceof Date
            ? action.item.dueDate
            : new Date(action.item.dueDate),
        category: action.item.category || "personal",
        priority: action.item.priority || "medium",
        recurrence: action.item.recurrence || "none",
        enableNotifications: action.item.enableNotifications !== false,
        notificationTime: action.item.notificationTime 
          ? new Date(action.item.notificationTime)
          : new Date(new Date(action.item.dueDate).setMinutes(new Date(action.item.dueDate).getMinutes() - 30)),
        customNotificationMessage: action.item.customNotificationMessage || "",
      };
    default:
      return state;
  }
}

/* -----------------------
   Task Item component - UPDATED with better actions
   ----------------------- */
const TaskItem = React.memo(function TaskItemComp({
  item,
  handleToggleCompleted,
  handleToggleExpand,
  handleDeletePlannerItem,
  handleUpdateSubtask,
  handleReorder,
  isExpanded,
  isFirst,
  isLast,
  listLength,
  onLongPressSelect,
  selectionMode,
  selected,
  confirmDelete,
  openNotificationSettings,
  openPlannerModal, // NEW: Added edit handler
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
  }, [isExpanded, expandAnim]);

  const height = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [90, 210 + (item.subtasks ? item.subtasks.length * 36 : 0)],
  });

  const getPriorityColor = (p) => PRIORITY_COLORS[p] || "#ccc";
  const getCategoryColor = (c) => CATEGORY_COLORS[c] || "#ccc";

  const renderLeftActions = (progress, dragX) => {
    const scale = dragX.interpolate({
      inputRange: [0, 80],
      outputRange: [0, 1],
      extrapolate: "clamp",
    });
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
    const scale = dragX.interpolate({
      inputRange: [-80, 0],
      outputRange: [1, 0],
      extrapolate: "clamp",
    });
    return (
      <View style={styles.rightAction}>
        <Animated.View style={[styles.swipeAction, { backgroundColor: COLORS.danger, transform: [{ scale }] }]}>
          <Text style={styles.actionText}>Delete</Text>
          <Ionicons name="trash-outline" size={24} color="#fff" />
        </Animated.View>
      </View>
    );
  };

  const handleSwipeComplete = () => {
    triggerHaptic("heavy");
    handleToggleCompleted(item);
    swipeableRef.current?.close();
  };

  const handleSwipeDelete = () => {
    triggerHaptic("heavy");
    handleDeletePlannerItem(item.id);
    swipeableRef.current?.close();
  };

  return (
    <Swipeable
      ref={swipeableRef}
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
      onSwipeableLeftOpen={handleSwipeComplete}
      onSwipeableRightOpen={handleSwipeDelete}
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
              <Ionicons name={item.completed ? "checkbox" : "square-outline"} size={22} color={item.completed ? COLORS.textPrimary : "#999"} />
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
                {item.enableNotifications !== false && !item.completed && (
                  <Ionicons 
                    name={item.notificationId ? "notifications" : "notifications-outline"} 
                    size={14} 
                    color={item.notificationId ? COLORS.info : COLORS.textSecondary}
                    style={{ marginLeft: 8 }}
                  />
                )}
              </View>
            </View>

            {/* Selection indicator for batch mode */}
            {selectionMode && (
              <View style={{ paddingLeft: 8 }}>
                <Ionicons name={selected ? "checkmark-circle" : "ellipse-outline"} size={22} color={selected ? COLORS.accentBlush : "#999"} />
              </View>
            )}
          </View>

          {/* Collapsed card actions - UPDATED with Edit and Delete */}
          {!isExpanded && (
            <View style={styles.cardActions}>
              <TouchableOpacity onPress={() => handleReorder(item, "up")} disabled={isFirst} style={[styles.iconBtn, isFirst && { opacity: 0.3 }]}>
                <Ionicons name="arrow-up-outline" size={20} color="#666" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleReorder(item, "down")} disabled={isLast} style={[styles.iconBtn, isLast && { opacity: 0.3 }]}>
                <Ionicons name="arrow-down-outline" size={20} color="#666" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => openNotificationSettings(item)} style={[styles.iconBtn, { marginLeft: 6 }]}>
                <Ionicons name="notifications-outline" size={20} color={COLORS.info} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => openPlannerModal(item)} style={[styles.iconBtn, { marginLeft: 6 }]}>
                <Ionicons name="create-outline" size={20} color={COLORS.sage} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => confirmDelete(item)} style={[styles.iconBtn, { marginLeft: 6 }]}>
                <Ionicons name="trash-outline" size={20} color={COLORS.danger} />
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>

        {/* Expanded content */}
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
                if (v) {
                  handleUpdateSubtask(item.id, null, false, v);
                }
              }}
            />
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Swipeable>
  );
});

/* -----------------------
   Animated Empty State
   ----------------------- */
const AnimatedEmptyState = () => {
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
  }, [pulseAnim]);

  return (
    <Animated.View style={[styles.emptyContainer, { transform: [{ scale: pulseAnim }] }]}>
      <Ionicons name="clipboard-outline" size={48} color={COLORS.textSecondary} />
      <Text style={styles.empty}>Looks like your planner is empty! Ready to create a task?</Text>
    </Animated.View>
  );
};

/* -----------------------
   Calendar Grid (same as before)
   ----------------------- */
const CalendarGrid = ({ tasks, onDateSelect, selectedDate }) => {
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  const taskDates = useMemo(() => {
    return new Set(tasks.map((t) => (t.dueDate instanceof Date ? t.dueDate.toDateString() : new Date(t.dueDate).toDateString())));
  }, [tasks]);

  const daysInMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  const totalDays = daysInMonth(viewDate);
  const startDay = firstDayOfMonth(viewDate);
  const gridDays = Array(startDay).fill(null).concat(Array.from({ length: totalDays }, (_, i) => i + 1));

  const changeMonth = (offset) => {
    const newDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + offset, 1);
    setViewDate(newDate);
    triggerHaptic("light");
  };

  const isToday = (day) => {
    const d = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    return d.toDateString() === today.toDateString();
  };

  const hasTask = (day) => {
    if (!day) return false;
    const d = new Date(viewDate.getFullYear(), viewDate.getMonth(), day).toDateString();
    return taskDates.has(d);
  };

  return (
    <View style={styles.calendarContainer}>
      <View style={styles.monthSelector}>
        <TouchableOpacity onPress={() => changeMonth(-1)}>
          <Ionicons name="chevron-back" size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.monthTitle}>{viewDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</Text>
        <TouchableOpacity onPress={() => changeMonth(1)}>
          <Ionicons name="chevron-forward" size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>
      </View>

      <View style={styles.dayNamesRow}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <Text key={day} style={styles.dayName}>
            {day}
          </Text>
        ))}
      </View>

      <View style={styles.dayGrid}>
        {gridDays.map((day, index) => {
          const date = day ? new Date(viewDate.getFullYear(), viewDate.getMonth(), day) : null;
          const isSelected = date && selectedDate && date.toDateString() === selectedDate.toDateString();
          return (
            <TouchableOpacity
              key={index}
              style={[styles.dayCell, isToday(day) && styles.dayCellToday, isSelected && styles.dayCellSelected]}
              onPress={() => day && onDateSelect(date)}
              disabled={!day}
            >
              <Text style={[styles.dayText, isSelected && styles.dayTextSelected, isToday(day) && { fontWeight: "700" }]}>{day || ""}</Text>
              {day && hasTask(day) && <View style={styles.taskDot} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

/* -----------------------
   Notification List Component - NEW
   ----------------------- */
const NotificationList = ({ visible, onClose, scheduledNotifications }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (visible) {
      loadNotifications();
    }
  }, [visible]);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      const formatted = scheduled.map((notification, index) => ({
        id: notification.identifier || `notification-${index}`,
        title: notification.content.title || 'Task Reminder',
        body: notification.content.body || '',
        date: notification.trigger.date ? new Date(notification.trigger.date) : null,
        taskId: notification.content.data?.taskId,
      })).sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));
      
      setNotifications(formatted);
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatNotificationTime = (date) => {
    if (!date) return 'No date';
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 0) return 'Past due';
    if (diffMins < 60) return `In ${diffMins} min`;
    if (diffHours < 24) return `In ${diffHours} hour${diffHours !== 1 ? 's' : ''}`;
    return `In ${diffDays} day${diffDays !== 1 ? 's' : ''}`;
  };

  const handleClearAll = async () => {
    Alert.alert(
      "Clear All Notifications",
      "Are you sure you want to clear all scheduled notifications?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear All",
          style: "destructive",
          onPress: async () => {
            await Notifications.cancelAllScheduledNotificationsAsync();
            loadNotifications();
            triggerHaptic("heavy");
          },
        },
      ]
    );
  };

  const handleCancelNotification = async (notificationId) => {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      loadNotifications();
      triggerHaptic("medium");
    } catch (error) {
      console.error('Error cancelling notification:', error);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.notificationModalOverlay}>
        <View style={styles.notificationModalContainer}>
          <View style={styles.notificationModalHeader}>
            <Text style={styles.notificationModalTitle}>Scheduled Notifications</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.notificationModalContent}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={COLORS.sage} />
                <Text style={styles.loadingText}>Loading notifications...</Text>
              </View>
            ) : notifications.length === 0 ? (
              <View style={styles.emptyNotificationsContainer}>
                <Ionicons name="notifications-off-outline" size={48} color={COLORS.textSecondary} />
                <Text style={styles.emptyNotificationsText}>No scheduled notifications</Text>
                <Text style={styles.emptyNotificationsSubtext}>
                  Notifications will appear here when tasks are due
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.notificationHeaderRow}>
                  <Text style={styles.notificationCount}>
                    {notifications.length} scheduled notification{notifications.length !== 1 ? 's' : ''}
                  </Text>
                  <TouchableOpacity onPress={handleClearAll} style={styles.clearAllButton}>
                    <Text style={styles.clearAllText}>Clear All</Text>
                  </TouchableOpacity>
                </View>
                
                <ScrollView style={styles.notificationList}>
                  {notifications.map((notification) => (
                    <View key={notification.id} style={styles.notificationItem}>
                      <View style={styles.notificationItemHeader}>
                        <Ionicons name="notifications" size={20} color={COLORS.info} />
                        <Text style={styles.notificationItemTitle} numberOfLines={1}>
                          {notification.title.replace('📅 Task Reminder: ', '')}
                        </Text>
                        <TouchableOpacity 
                          onPress={() => handleCancelNotification(notification.id)}
                          style={styles.cancelNotificationButton}
                        >
                          <Ionicons name="close-circle" size={18} color={COLORS.danger} />
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.notificationItemBody} numberOfLines={2}>
                        {notification.body}
                      </Text>
                      <View style={styles.notificationItemFooter}>
                        <Text style={styles.notificationItemTime}>
                          {formatNotificationTime(notification.date)}
                        </Text>
                        <Text style={styles.notificationItemDate}>
                          {notification.date?.toLocaleString() || 'No date'}
                        </Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              </>
            )}
          </View>

          <TouchableOpacity style={styles.notificationModalCloseButton} onPress={onClose}>
            <Text style={styles.notificationModalCloseText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

/* -----------------------
   Main Planner Screen - UPDATED
   ----------------------- */
export default function PlannerScreen() {
  const navigation = useNavigation();
  const { user } = useApp();

  // Data
  const [plannerItems, setPlannerItems] = useState([]);
  const [filteredPlannerItems, setFilteredPlannerItems] = useState([]);

  // UI state
  const [isFormModalVisible, setIsFormModalVisible] = useState(false);
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterDate, setFilterDate] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isExpandedId, setIsExpandedId] = useState(null);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  // Batch selection mode
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  // Date picker visibility
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showNotificationTimePicker, setShowNotificationTimePicker] = useState(false);

  // Delete Confirmation Modal states
  const [isConfirmModalVisible, setIsConfirmModalVisible] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);

  // Notification states
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const [notificationItem, setNotificationItem] = useState(null);
  const [showNotificationList, setShowNotificationList] = useState(false); // NEW
  const [scheduledNotifications, setScheduledNotifications] = useState([]); // NEW

  // Form reducer
  const [form, dispatch] = useReducer(formReducer, initialFormState);

  // categories/priorities
  const categories = [
    { key: "work", label: "Work" },
    { key: "personal", label: "Personal" },
    { key: "other", label: "Other" },
  ];
  const priorities = [
    { key: "high", label: "High" },
    { key: "medium", label: "Medium" },
    { key: "low", label: "Low" },
  ];

  // Notification time options
  const notificationTimes = [
    { label: "At due time", minutes: 0 },
    { label: "15 min before", minutes: -15 },
    { label: "30 min before", minutes: -30 },
    { label: "1 hour before", minutes: -60 },
    { label: "1 day before", minutes: -1440 },
    { label: "Custom", minutes: null },
  ];

  /* -----------------------
     Enhanced Notification Functions
     ----------------------- */
  // Request notification permissions
  useEffect(() => {
    async function requestPermissions() {
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') {
        const { status: newStatus } = await Notifications.requestPermissionsAsync();
        if (newStatus === 'granted') {
          console.log("Notification permissions granted");
        }
      }
    }
    requestPermissions();
    
    // Listen for notifications when app is in foreground
    const subscription = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received:', notification);
    });
    
    return () => subscription.remove();
  }, []);

  // Schedule notification for a single task
const scheduleTaskNotification = async (task) => {
  if (!task.enableNotifications || task.completed || !task.dueDate) {
    return;
  }

  // CRITICAL: Verify task exists in database first
  if (!task.id) {
    console.error("Cannot schedule notification: task has no ID");
    return;
  }

  try {
    let notificationTime = new Date(task.dueDate);
    if (task.notificationTime) {
      notificationTime = new Date(task.notificationTime);
    } else {
      notificationTime.setMinutes(notificationTime.getMinutes() - 30);
    }

    if (notificationTime <= new Date()) {
      return;
    }

    if (task.notificationId) {
      await Notifications.cancelScheduledNotificationAsync(task.notificationId);
    }

    const notificationId = `task_${task.id}_${Date.now()}`;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `📅 Task Reminder: ${task.title}`,
        body: task.customNotificationMessage || `"${task.title}" is due soon!`,
        data: { 
          taskId: task.id, 
          type: 'task_reminder',
          screen: 'Planner'
        },
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: {
        date: notificationTime,
      },
    });

    // Only update if component is still mounted and doc exists
    if (isMountedRef.current) {
      try {
        await updateDoc(doc(db, "planner", task.id), { 
          notificationId,
          notificationTime: notificationTime 
        });
      } catch (updateError) {
        console.error("Failed to update notificationId:", updateError);
      }
    }

    console.log(`Scheduled notification for task: ${task.title} at ${notificationTime}`);
  } catch (error) {
    console.error("Error scheduling notification:", error);
    // Don't throw - let the app continue even if notification fails
  }
};

  // Cancel notification for a task
  const cancelTaskNotification = async (taskId) => {
    try {
      const task = plannerItems.find(t => t.id === taskId);
      if (task?.notificationId) {
        await Notifications.cancelScheduledNotificationAsync(task.notificationId);
        await updateDoc(doc(db, "planner", taskId), { 
          notificationId: null,
          notificationTime: null 
        });
      }
    } catch (error) {
      console.error("Error canceling notification:", error);
    }
  };

  // Clear all task notifications
  const clearAllTaskNotifications = async () => {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      
      // Clear notification IDs from all tasks
      const updatePromises = plannerItems.map(item => 
        updateDoc(doc(db, "planner", item.id), { 
          notificationId: null,
          notificationTime: null 
        })
      );
      await Promise.all(updatePromises);
      
      showMessage("Cleared all notifications");
    } catch (error) {
      console.error("Error clearing all notifications:", error);
      showMessage("Failed to clear notifications");
    }
  };

  // Load scheduled notifications
  const loadScheduledNotifications = async () => {
    try {
      const notifications = await Notifications.getAllScheduledNotificationsAsync();
      setScheduledNotifications(notifications);
      return notifications;
    } catch (error) {
      console.error("Error loading notifications:", error);
      return [];
    }
  };

  // Open notification settings for a specific task
  const openNotificationSettings = (item) => {
    triggerHaptic("light");
    setNotificationItem(item);
    setShowNotificationSettings(true);
  };

  // Save notification settings
  const saveNotificationSettings = async () => {
    if (!notificationItem) return;
    
    try {
      await updateDoc(doc(db, "planner", notificationItem.id), {
        enableNotifications: notificationItem.enableNotifications,
        notificationTime: notificationItem.notificationTime,
        customNotificationMessage: notificationItem.customNotificationMessage,
      });

      // Reschedule notification if enabled
      if (notificationItem.enableNotifications) {
        await scheduleTaskNotification(notificationItem);
      } else {
        await cancelTaskNotification(notificationItem.id);
      }

      showMessage("Notification settings updated");
      setShowNotificationSettings(false);
      setNotificationItem(null);
    } catch (error) {
      console.error("Error saving notification settings:", error);
      showMessage("Failed to update notification settings");
    }
  };

  /* -----------------------
     Firestore listener
     ----------------------- */
  useEffect(() => {
    if (!user) {
      setPlannerItems([]);
      return;
    }
    const plannerCollectionRef = collection(db, "planner");
    const q = query(plannerCollectionRef, where("userId", "==", user.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => {
          const data = d.data();
          let dueDate = data.dueDate;
          if (dueDate && typeof dueDate.toDate === "function") {
            dueDate = dueDate.toDate();
          } else if (!dueDate) {
            dueDate = new Date();
          }

          let notificationTime = data.notificationTime;
          if (notificationTime && typeof notificationTime.toDate === "function") {
            notificationTime = notificationTime.toDate();
          }

          return { 
            id: d.id, 
            ...data, 
            dueDate,
            notificationTime,
            enableNotifications: data.enableNotifications !== false,
          };
        });

        // sort by order then date
        items.sort((a, b) => {
          const orderA = a.order ?? 999;
          const orderB = b.order ?? 999;
          if (orderA !== orderB) return orderA - orderB;
          return (a.dueDate?.getTime() || 0) - (b.dueDate?.getTime() || 0);
        });

        setPlannerItems(items);

        // Update Cache
        AsyncStorage.setItem(`planner_cache_${user.uid}`, JSON.stringify(items));
        
        // Schedule notifications for all tasks
        scheduleAllTaskNotifications(items);
      },
      (err) => {
        console.error("planner onSnapshot error", err);
      }
    );

    return () => unsub();
  }, [user]);

  // Schedule notifications for all upcoming tasks
  const scheduleAllTaskNotifications = async (tasks = plannerItems) => {
    try {
      // Filter only upcoming, enabled tasks
      const upcomingTasks = tasks.filter(t => 
        t.enableNotifications !== false && 
        !t.completed && 
        t.dueDate && 
        new Date(t.dueDate) > new Date()
      );

      for (const task of upcomingTasks) {
        await scheduleTaskNotification(task);
      }

      console.log(`Scheduled ${upcomingTasks.length} task notifications`);
    } catch (error) {
      console.error("Error scheduling all notifications:", error);
    }
  };

  /* -----------------------
     Filtering and search
     ----------------------- */
  useEffect(() => {
    let filtered = plannerItems.slice();

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (it) =>
          (it.title || "").toLowerCase().includes(q) ||
          (it.description || "").toLowerCase().includes(q)
      );
    }

    if (filterCategory !== "all") {
      filtered = filtered.filter((it) => it.category === filterCategory);
    }

    if (filterDate) {
      filtered = filtered.filter((it) => {
        const d = it.dueDate instanceof Date ? it.dueDate : new Date(it.dueDate);
        return d.getDate() === filterDate.getDate() && d.getMonth() === filterDate.getMonth() && d.getFullYear() === filterDate.getFullYear();
      });
    }

    setFilteredPlannerItems(filtered);
    setIsExpandedId(null); // collapse items when filters change
  }, [plannerItems, searchQuery, filterCategory, filterDate]);

  /* -----------------------
     Form helpers
     ----------------------- */
  const openPlannerModal = (item = null) => {
    triggerHaptic("light");
    setSelectionMode(false);
    setSelectedIds([]);
    if (item) {
      dispatch({ type: "LOAD_ITEM", item });
    } else {
      dispatch({ type: "RESET" });
    }
    setShowDatePicker(false);
    setShowTimePicker(false);
    setShowNotificationTimePicker(false);
    setIsFormModalVisible(true);
  };

  // auto-parse date suggestions from title/description
 const parsedDateRef = useRef(null);

useEffect(() => {
  const combined = form.title + " " + form.description;
  
  // Only parse if text actually changed
  if (combined === parsedDateRef.current) return;
  parsedDateRef.current = combined;
  
  const parsed = parseNaturalDate(combined);
  if (parsed && !form.isEditing) { // Don't override when editing
    dispatch({ type: "SET", key: "dueDate", value: parsed });
    dispatch({ type: "SET", key: "dueTime", value: parsed });
    const notificationTime = new Date(parsed.getTime() - 30 * 60000);
    dispatch({ type: "SET", key: "notificationTime", value: notificationTime });
  }
}, [form.title, form.description, form.isEditing]);

  /* -----------------------
     Save (create or update)
     ----------------------- */
  const handleSavePlannerItem = async () => {
    if (!form.title.trim()) {
      showMessage("Please enter a task title.");
      return;
    }
    if (!user) {
      showMessage("Please log in to save tasks.");
      return;
    }

    setLoading(true);
    triggerHaptic("heavy");

    try {
      // combine date + time into one Date object
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
        completed: form.currentPlannerItem ? !!form.currentPlannerItem.completed : false,
        category: form.category,
        priority: form.priority,
        recurrence: form.recurrence,
        subtasks: form.currentPlannerItem?.subtasks || [],
        // Notification settings
        enableNotifications: form.enableNotifications,
        notificationTime: form.enableNotifications ? form.notificationTime : null,
        customNotificationMessage: form.customNotificationMessage.trim(),
      };

      if (form.isEditing && form.currentPlannerItem) {
        await updateDoc(doc(db, "planner", form.currentPlannerItem.id), payload);
        showMessage("Task updated");
        
        // Reschedule notification if enabled
        if (form.enableNotifications) {
          const updatedTask = { id: form.currentPlannerItem.id, ...payload };
          await scheduleTaskNotification(updatedTask);
        } else {
          await cancelTaskNotification(form.currentPlannerItem.id);
        }
      } else {
        const maxOrder = plannerItems.reduce((max, item) => Math.max(max, item.order || 0), 0) + 1;
        const docRef = await addDoc(collection(db, "planner"), { 
  ...payload, 
  order: maxOrder, 
  createdAt: serverTimestamp(),
  notificationId: null, // Add placeholder
});

// Wait for doc to be created, then schedule
if (form.enableNotifications) {
  const newTask = { 
    id: docRef.id, 
    ...payload,
    dueDate: combined 
  };
  // Schedule notification separately
  try {
    await scheduleTaskNotification(newTask);
  } catch (error) {
    console.error("Notification scheduling failed:", error);
  }
}
showMessage("Task added");
        
        // Schedule notification if enabled
        if (form.enableNotifications) {
          const newTask = { id: docRef.id, ...payload };
          await scheduleTaskNotification(newTask);
        }
      }

      setIsFormModalVisible(false);
    } catch (err) {
      console.error("save planner error", err);
      showMessage("Save failed — try again");
    } finally {
      setLoading(false);
    }
  };

  /* -----------------------
     Delete (CONFIRMATION FLOW)
     ----------------------- */
  // Function to open confirmation modal
  const confirmDelete = (item) => {
    triggerHaptic("medium");
    setItemToDelete(item);
    setIsConfirmModalVisible(true);
  };

  // Function to handle the actual deletion (used by both swipe and confirmation modal)
  const handleDeletePlannerItem = async (id = null) => {
  let itemId = id;
  if (!itemId && itemToDelete) {
    itemId = itemToDelete.id;
  }
  
  if (!itemId) {
    console.error("Cannot delete: no item ID provided");
    return;
  }

  triggerHaptic("heavy");
  try {
    await cancelTaskNotification(itemId);
    await deleteDoc(doc(db, "planner", itemId));
    showMessage("Deleted");
    
    if (itemToDelete && itemToDelete.id === itemId) {
      setIsConfirmModalVisible(false);
      setItemToDelete(null);
    }
  } catch (err) {
    console.error("delete error", err);
    showMessage("Delete failed");
  }
};

  /* -----------------------
     Toggle Completed
     ----------------------- */
  const handleToggleCompleted = async (item) => {
    playTapSound();
    try {
      await updateDoc(doc(db, "planner", item.id), { completed: !item.completed });
      
      // Cancel notification if task is completed
      if (!item.completed) {
        // If marking complete, cancel notification
        await cancelTaskNotification(item.id);
      } else {
        // If marking incomplete, reschedule notification if enabled
        if (item.enableNotifications) {
          await scheduleTaskNotification(item);
        }
      }
    } catch (err) {
      console.error("toggle complete err", err);
    }
  };

  /* -----------------------
     Subtask update: add or toggle
     ----------------------- */
  const handleUpdateSubtask = async (taskId, subtaskIndex, completed, newSubtaskTitle) => {
    playTapSound();
    const item = plannerItems.find((i) => i.id === taskId);
    if (!item) return;

    let newSubtasks = item.subtasks ? [...item.subtasks] : [];

    if (newSubtaskTitle) {
      newSubtasks.push({ title: newSubtaskTitle, completed: false });
    } else if (subtaskIndex !== null && typeof subtaskIndex !== "undefined") {
      newSubtasks = newSubtasks.map((s, idx) => (idx === subtaskIndex ? { ...s, completed } : s));
    }

    try {
      await updateDoc(doc(db, "planner", taskId), { subtasks: newSubtasks });
    } catch (e) {
      console.error("Subtask update failed", e);
      showMessage("Subtask update failed");
    }
  };

  /* -----------------------
     Reorder: swap orders and update Firestore
     ----------------------- */
  const handleReorder = async (item, direction) => {
    triggerHaptic("light");
    const index = plannerItems.findIndex((i) => i.id === item.id);
    if (index === -1) return;

    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= plannerItems.length) return;

    const targetItem = plannerItems[targetIndex];
    if (!targetItem) return;

    // optimistic UI update: swap in local state immediately
    const newItems = [...plannerItems];
    const temp = newItems[index];
    newItems[index] = newItems[targetIndex];
    newItems[targetIndex] = temp;
    setPlannerItems(newItems);

    try {
      const itemOrder = item.order ?? 0;
      const targetOrder = targetItem.order ?? 0;

      await updateDoc(doc(db, "planner", item.id), { order: targetOrder });
      await updateDoc(doc(db, "planner", targetItem.id), { order: itemOrder });
    } catch (err) {
      console.error("Reorder failed:", err);
      showMessage("Reordering failed.");
      // revert local swap if fail
      setPlannerItems((prev) => {
        const restore = [...prev];
        const idx = restore.findIndex((i) => i.id === item.id);
        const tIdx = restore.findIndex((i) => i.id === targetItem.id);
        if (idx !== -1 && tIdx !== -1) {
          const tmp = restore[idx];
          restore[idx] = restore[tIdx];
          restore[tIdx] = tmp;
        }
        return restore;
      });
    }
  };

  /* -----------------------
     Calendar date selection
     ----------------------- */
  const handleCalendarDateSelect = (date) => {
    triggerHaptic("light");
    setFilterCategory("all");
    setFilterDate(date);
    setCalendarVisible(false);
  };

  /* -----------------------
     Batch actions (multi-select)
     ----------------------- */
  const onLongPressSelect = (id) => {
    // toggle selection mode activation
    if (!selectionMode) {
      setSelectionMode(true);
      setSelectedIds([id]);
      triggerHaptic("medium");
    } else {
      // toggle id in selectedIds
      setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
      triggerHaptic("light");
    }
  };

  const toggleSelectId = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const batchComplete = async () => {
    if (selectedIds.length === 0) return;
    setLoading(true);
    try {
      await Promise.all(selectedIds.map((id) => updateDoc(doc(db, "planner", id), { completed: true })));
      
      // Cancel notifications for all completed tasks
      await Promise.all(selectedIds.map((id) => cancelTaskNotification(id)));
      
      showMessage("Marked completed");
      setSelectionMode(false);
      setSelectedIds([]);
    } catch (e) {
      console.error("Batch complete failed", e);
      showMessage("Batch complete failed");
    } finally {
      setLoading(false);
    }
  };

  const batchDelete = async () => {
    if (selectedIds.length === 0) return;
    Alert.alert("Delete tasks", `Delete ${selectedIds.length} tasks?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setLoading(true);
          try {
            // Cancel notifications first
            await Promise.all(selectedIds.map((id) => cancelTaskNotification(id)));
            
            // Then delete from database
            await Promise.all(selectedIds.map((id) => deleteDoc(doc(db, "planner", id))));
            showMessage("Deleted");
            setSelectionMode(false);
            setSelectedIds([]);
          } catch (e) {
            console.error("Batch delete failed", e);
            showMessage("Batch delete failed");
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  /* -----------------------
     Toggle expand at parent level
     ----------------------- */
  const handleToggleExpand = (id) => {
    setIsExpandedId((prev) => (prev === id ? null : id));
  };

  /* -----------------------
     Small transient message UI
     ----------------------- */
  const [showModal, setShowModal] = useState(false);
  const [modalMessage, setModalMessage] = useState("");
  const showMessage = (msg) => {
    setModalMessage(msg);
    setShowModal(true);
    setTimeout(() => setShowModal(false), 1600);
  };

  /* -----------------------
     Notification Management - UPDATED
     ----------------------- */
  const handleNotificationButtonPress = async () => {
    triggerHaptic("light");
    await loadScheduledNotifications();
    setShowNotificationList(true);
  };

  /* -----------------------
     Render - UPDATED
     ----------------------- */
  return (
    <View style={styles.screen}>
      {/* Header with Updated Notification Button */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Planner</Text>

        <View style={{ flexDirection: "row", alignItems: "center" }}>
          {selectionMode && (
            <>
              <TouchableOpacity onPress={() => { setSelectionMode(false); setSelectedIds([]); }} style={{ marginRight: 10 }}>
                <Ionicons name="close" size={20} color="#666" />
              </TouchableOpacity>
              <TouchableOpacity onPress={batchComplete} style={[styles.headerAdd, { marginRight: 10 }]}>
                <Ionicons name="checkmark-done-outline" size={18} color={COLORS.accentBlush} />
                <Text style={styles.headerAddText}>Complete</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={batchDelete} style={styles.headerAdd}>
                <Ionicons name="trash-outline" size={18} color={COLORS.accentBlush} />
                <Text style={styles.headerAddText}>Delete</Text>
              </TouchableOpacity>
            </>
          )}

          {!selectionMode && (
            <>
              <TouchableOpacity 
                style={[styles.headerIconBtn, { marginRight: 10 }]} 
                onPress={handleNotificationButtonPress}
              >
                <Ionicons name="notifications-outline" size={20} color={COLORS.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerAdd} onPress={() => openPlannerModal()} activeOpacity={0.85}>
                <Ionicons name="add" size={20} color={COLORS.accentBlush} />
                <Text style={styles.headerAddText}>Add</Text>
              </TouchableOpacity>
            </>
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

          {categories.map((c) => (
            <TouchableOpacity key={c.key} onPress={() => { setFilterCategory(c.key); setFilterDate(null); }} style={[styles.filterBtn, filterCategory === c.key && styles.filterBtnActive, { borderColor: CATEGORY_COLORS[c.key] + "44" }]}>
              <View style={[styles.smallDot, { backgroundColor: CATEGORY_COLORS[c.key] }]} />
              <Text style={[styles.filterBtnText, filterCategory === c.key && styles.filterBtnTextActive]}>{c.label}</Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity onPress={() => { setCalendarVisible((p) => !p); setFilterCategory("all"); }} style={[styles.filterBtn, calendarVisible && styles.filterBtnActive]}>
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
        <View style={{ marginHorizontal: 20 }}>
          <CalendarGrid tasks={plannerItems} onDateSelect={handleCalendarDateSelect} selectedDate={filterDate} />
        </View>
      )}

      {/* List */}
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
              handleDeletePlannerItem={handleDeletePlannerItem}
              handleUpdateSubtask={handleUpdateSubtask}
              handleReorder={handleReorder}
              isExpanded={item.id === isExpandedId}
              isFirst={index === 0}
              isLast={index === filteredPlannerItems.length - 1}
              listLength={filteredPlannerItems.length}
              onLongPressSelect={onLongPressSelect}
              selectionMode={selectionMode}
              selected={selectedIds.includes(item.id)}
              confirmDelete={confirmDelete}
              openNotificationSettings={openNotificationSettings}
              openPlannerModal={openPlannerModal} // NEW: Pass edit handler
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
                <Ionicons name="close" size={20} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: Dimensions.get("window").height * 0.72 }} showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>Title</Text>
              <TextInput value={form.title} onChangeText={(t) => dispatch({ type: "SET", key: "title", value: t })} style={styles.input} placeholder="Task title" />

              <Text style={styles.inputLabel}>Description</Text>
              <TextInput value={form.description} onChangeText={(t) => dispatch({ type: "SET", key: "description", value: t })} style={[styles.input, { height: 90, alignItems: "flex-start" }]} placeholder="Details (optional)" multiline />

              <Text style={styles.inputLabel}>Priority</Text>
              <View style={styles.categoryRow}>
                {priorities.map((p) => {
                  const active = p.key === form.priority;
                  return (
                    <TouchableOpacity key={p.key} style={[styles.catBtn, active && { backgroundColor: PRIORITY_COLORS[p.key] }]} onPress={() => dispatch({ type: "SET", key: "priority", value: p.key })}>
                      <Text style={[styles.catText, active && { color: "#fff" }]}>{p.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.inputLabel}>Due Date & Time</Text>
              <View style={styles.dateTimeRow}>
                <TouchableOpacity onPress={() => setShowDatePicker(true)} style={[styles.input, styles.dateTimeButton, { borderColor: COLORS.sage + "88" }]}>
                  <Ionicons name="calendar-outline" size={18} color={COLORS.sage} />
                  <Text style={[styles.dateTimeText, { color: COLORS.textPrimary, fontWeight: "700" }]}>{form.dueDate.toLocaleDateString()}</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => setShowTimePicker(true)} style={[styles.input, styles.dateTimeButton, { borderColor: COLORS.sage + "88" }]}>
                  <Ionicons name="time-outline" size={18} color={COLORS.sage} />
                  <Text style={[styles.dateTimeText, { color: COLORS.textPrimary, fontWeight: "700" }]}>{form.dueTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Text>
                </TouchableOpacity>
              </View>

              {showDatePicker && (
                <DateTimePicker value={form.dueDate} mode="date" display={Platform.OS === "ios" ? "inline" : "spinner"} onChange={(e, d) => { setShowDatePicker(false); if (e.type === "set" && d) dispatch({ type: "SET", key: "dueDate", value: d }); }} />
              )}

              {showTimePicker && (
                <DateTimePicker value={form.dueTime} mode="time" display={Platform.OS === "ios" ? "inline" : "spinner"} onChange={(e, d) => { setShowTimePicker(false); if (e.type === "set" && d) dispatch({ type: "SET", key: "dueTime", value: d }); }} />
              )}

              <Text style={styles.inputLabel}>Category</Text>
              <View style={styles.categoryRow}>
                {categories.map((c) => {
                  const active = c.key === form.category;
                  return (
                    <TouchableOpacity key={c.key} style={[styles.catBtn, active && { backgroundColor: CATEGORY_COLORS[c.key] }]} onPress={() => dispatch({ type: "SET", key: "category", value: c.key })}>
                      <Text style={[styles.catText, active && { color: "#fff" }]}>{c.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.inputLabel}>Recurrence</Text>
              <View style={styles.categoryRow}>
                {["none", "daily", "weekly", "monthly"].map((r) => {
                  const active = r === form.recurrence;
                  return (
                    <TouchableOpacity key={r} style={[styles.catBtnSmall, active && { backgroundColor: COLORS.accentBlush }]} onPress={() => dispatch({ type: "SET", key: "recurrence", value: r })}>
                      <Text style={[styles.catTextSmall, active && { color: "#fff" }]}>{r.charAt(0).toUpperCase() + r.slice(1)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Notification Settings in Form */}
              <View style={styles.notificationSection}>
                <View style={styles.notificationHeader}>
                  <Ionicons name="notifications-outline" size={18} color={COLORS.sage} />
                  <Text style={[styles.inputLabel, { marginLeft: 8 }]}>Notifications</Text>
                  <Switch
                    value={form.enableNotifications}
                    onValueChange={(value) => dispatch({ type: "SET", key: "enableNotifications", value })}
                    trackColor={{ false: "#ccc", true: COLORS.sage }}
                    thumbColor={form.enableNotifications ? "#fff" : "#fff"}
                    style={{ marginLeft: 'auto' }}
                  />
                </View>

                {form.enableNotifications && (
                  <>
                    <Text style={[styles.inputLabel, { marginTop: 12 }]}>Remind me</Text>
                    <View style={styles.notificationTimeGrid}>
                      {notificationTimes.map((timeOption) => {
                        const isActive = form.notificationTime && 
                          (timeOption.minutes === null || 
                           form.notificationTime.getTime() === 
                           new Date(form.dueDate.getTime() + timeOption.minutes * 60000).getTime());
                        
                        return (
                          <TouchableOpacity
                            key={timeOption.label}
                            style={[
                              styles.notificationTimeBtn,
                              isActive && styles.notificationTimeBtnActive
                            ]}
                            onPress={() => {
                              if (timeOption.minutes === null) {
                                setShowNotificationTimePicker(true);
                              } else {
                                const newTime = new Date(form.dueDate.getTime() + timeOption.minutes * 60000);
                                dispatch({ type: "SET", key: "notificationTime", value: newTime });
                              }
                            }}
                          >
                            <Text style={[
                              styles.notificationTimeText,
                              isActive && styles.notificationTimeTextActive
                            ]}>
                              {timeOption.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    {showNotificationTimePicker && (
                      <View style={styles.customTimePicker}>
                        <Text style={[styles.inputLabel, { marginBottom: 8 }]}>Custom Reminder Time</Text>
                        <DateTimePicker
                          value={form.notificationTime}
                          mode="datetime"
                          display={Platform.OS === "ios" ? "inline" : "spinner"}
                          onChange={(e, d) => {
                            if (e.type === "set" && d) {
                              dispatch({ type: "SET", key: "notificationTime", value: d });
                            }
                            setShowNotificationTimePicker(false);
                          }}
                        />
                      </View>
                    )}

                    <Text style={[styles.inputLabel, { marginTop: 12 }]}>Custom Message (optional)</Text>
                    <TextInput
                      value={form.customNotificationMessage}
                      onChangeText={(t) => dispatch({ type: "SET", key: "customNotificationMessage", value: t })}
                      style={[styles.input, { height: 60 }]}
                      placeholder="Custom notification message..."
                      multiline
                    />

                    <Text style={styles.notificationHint}>
                      You'll be notified at: {form.notificationTime.toLocaleString()}
                    </Text>
                  </>
                )}
              </View>
            </ScrollView>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSavePlannerItem} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>{form.isEditing ? "Update Task" : "Save Task"}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Notification List Modal - NEW */}
      <NotificationList
        visible={showNotificationList}
        onClose={() => setShowNotificationList(false)}
        scheduledNotifications={scheduledNotifications}
      />

      {/* Notification Settings Modal for Individual Tasks */}
      <Modal visible={showNotificationSettings} transparent animationType="fade" onRequestClose={() => setShowNotificationSettings(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Notification Settings</Text>
              <TouchableOpacity onPress={() => setShowNotificationSettings(false)}>
                <Ionicons name="close" size={20} color="#666" />
              </TouchableOpacity>
            </View>

            {notificationItem && (
              <>
                <View style={styles.notificationItemPreview}>
                  <Text style={styles.notificationItemTitle}>{notificationItem.title}</Text>
                  <Text style={styles.notificationItemDate}>
                    Due: {new Date(notificationItem.dueDate).toLocaleString()}
                  </Text>
                </View>

                <View style={styles.notificationSettingRow}>
                  <Text style={styles.settingLabel}>Enable Notifications</Text>
                  <Switch
                    value={notificationItem.enableNotifications !== false}
                    onValueChange={(value) => setNotificationItem({...notificationItem, enableNotifications: value})}
                    trackColor={{ false: "#ccc", true: COLORS.sage }}
                    thumbColor={notificationItem.enableNotifications !== false ? "#fff" : "#fff"}
                  />
                </View>

                {notificationItem.enableNotifications !== false && (
                  <>
                    <Text style={styles.inputLabel}>Reminder Time</Text>
                    <TouchableOpacity 
                      style={[styles.input, styles.dateTimeButton]}
                      onPress={() => {
                        // In a production app, you would open a proper time picker here
                        showMessage("Time picker would open here");
                      }}
                    >
                      <Ionicons name="time-outline" size={18} color={COLORS.sage} />
                      <Text style={styles.dateTimeText}>
                        {notificationItem.notificationTime 
                          ? new Date(notificationItem.notificationTime).toLocaleString()
                          : "Set reminder time"}
                      </Text>
                    </TouchableOpacity>

                    <Text style={styles.inputLabel}>Custom Message</Text>
                    <TextInput
                      value={notificationItem.customNotificationMessage || ""}
                      onChangeText={(text) => setNotificationItem({...notificationItem, customNotificationMessage: text})}
                      style={[styles.input, { height: 60 }]}
                      placeholder="Custom notification message..."
                      multiline
                    />
                  </>
                )}

                <TouchableOpacity style={styles.saveBtn} onPress={saveNotificationSettings}>
                  <Text style={styles.saveBtnText}>Save Settings</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.saveBtn, { backgroundColor: COLORS.danger, marginTop: 10 }]}
                  onPress={async () => {
                    await cancelTaskNotification(notificationItem.id);
                    showMessage("Notification cancelled");
                    setShowNotificationSettings(false);
                  }}
                >
                  <Text style={styles.saveBtnText}>Cancel Notification</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={isConfirmModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsConfirmModalVisible(false)}
      >
        <View style={styles.confirmModalOverlay}>
          <View style={styles.confirmModalContainer}>
            <View style={styles.confirmIconContainer}>
                <Ionicons name="warning" size={48} color={COLORS.danger} />
            </View>
            <Text style={styles.confirmModalTitle}>Delete Task?</Text>
            <Text style={styles.confirmModalText}>
              Are you sure you want to permanently delete the task titled:
              <Text style={{ fontWeight: 'bold' }}> {itemToDelete?.title || 'this task'} </Text>?
            </Text>
            <View style={styles.confirmModalButtons}>
              <TouchableOpacity
                style={[styles.confirmButton, styles.cancelConfirmButton]}
                onPress={() => { setIsConfirmModalVisible(false); setItemToDelete(null); }}
                activeOpacity={0.8}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmButton, styles.deleteConfirmButton]}
                onPress={handleDeletePlannerItem}
                activeOpacity={0.8}
              >
                <Text style={styles.confirmButtonText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* small transient message modal */}
      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.messageBox}>
            <Text style={{ color: COLORS.textPrimary }}>{modalMessage}</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* Styles - UPDATED */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.backgroundBase },
  header: {
    paddingTop: Platform.OS === 'ios' ? 50 : 18,
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.backgroundBase,
  },
  headerTitle: { fontSize: 24, fontWeight: "900", color: COLORS.textPrimary },
  headerAdd: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 22,
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.7,
    shadowRadius: 14,
    elevation: 6,
    borderWidth: 0.5,
    borderColor: COLORS.accentBlush + "22",
  },
  headerAddText: { color: COLORS.accentBlush, fontWeight: "700", marginLeft: 8 },
  headerIconBtn: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 3,
  },

  searchRow: {
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 0.5,
    borderColor: "#eee",
  },
  searchInput: { flex: 1, fontSize: 15, color: COLORS.textPrimary },

  filters: { paddingHorizontal: 20, marginBottom: 8 },
  filterButtons: { flexDirection: "row", alignItems: "center" },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#eee",
  },
  filterBtnActive: { backgroundColor: COLORS.accentBlush, borderColor: COLORS.accentBlush },
  filterBtnText: { marginLeft: 6, color: COLORS.textPrimary, fontWeight: "600", fontSize: 13 },
  filterBtnTextActive: { color: "#fff" },
  smallDot: { width: 8, height: 8, borderRadius: 4 },

  listContainer: { paddingHorizontal: 20, paddingBottom: 40, paddingTop: 8 },
  emptyContainer: {
    justifyContent: "center",
    alignItems: "center",
    padding: 30,
    marginTop: 40,
    opacity: 0.7,
  },
  empty: { textAlign: "center", color: COLORS.textSecondary, marginTop: 15, fontSize: 16, fontWeight: "500" },

  taskCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    marginBottom: 0,
    overflow: "hidden",
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 14,
    elevation: 4,
    borderWidth: 0.5,
    borderColor: "#eee",
  },
  taskCardPressable: {
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    width: "100%",
  },
  leftAction: {
    justifyContent: "center",
    alignItems: "flex-end",
    flexDirection: "row",
    paddingLeft: 20,
    marginBottom: 12,
  },
  rightAction: {
    justifyContent: "center",
    alignItems: "flex-end",
    flexDirection: "row",
    paddingRight: 20,
    marginBottom: 12,
  },
  swipeAction: {
    flex: 1,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginRight: 12,
    marginLeft: 12,
  },
  actionText: {
    color: "white",
    fontWeight: "700",
    fontSize: 16,
    padding: 10,
  },

  taskRow: { flexDirection: "row", alignItems: "flex-start", flex: 1 },
  checkbox: { paddingRight: 10, paddingTop: 2 },
  taskBody: { flex: 1 },

  titleRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  categoryDot: { width: 10, height: 10, borderRadius: 6, marginRight: 8 },
  taskTitle: { fontSize: 16, fontWeight: "700", color: COLORS.textPrimary, flexShrink: 1 },
  completed: { textDecorationLine: "line-through", color: "#999", fontWeight: "600" },

  metaRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginRight: 8 },
  priorityText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  metaText: { color: "#777", fontSize: 12 },

  cardActions: { 
    marginLeft: 10, 
    justifyContent: "space-between", 
    height: 60, 
    paddingTop: 5, 
    paddingBottom: 5,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBtn: { padding: 6 },

  expandedContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: "#eee",
    width: "100%",
    position: "absolute",
    top: 90,
    left: 0,
    right: 0,
  },
  taskDescFull: {
    color: COLORS.textPrimary,
    fontSize: 14,
    marginBottom: 12,
    marginTop: 8,
  },
  subtaskHeader: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  subtaskList: { maxHeight: 150, paddingLeft: 5 },
  subtaskRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  subtaskCheckbox: { flexDirection: "row", alignItems: "center" },
  subtaskText: { marginLeft: 8, fontSize: 14, color: COLORS.textPrimary },
  subtaskCompleted: { textDecorationLine: "line-through", color: "#999" },
  subtaskInput: {
    marginTop: 5,
    paddingVertical: 5,
    fontSize: 14,
    color: COLORS.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.accentBlush + "55",
  },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.38)", justifyContent: "center", alignItems: "center" },
  modalCard: {
    width: "92%",
    maxHeight: "90%",
    backgroundColor: COLORS.layer,
    borderRadius: 14,
    padding: 16,
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.7,
    shadowRadius: 20,
    elevation: 10,
    borderWidth: 0.5,
    borderColor: "#eee",
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: COLORS.textPrimary },

  inputLabel: { fontSize: 13, fontWeight: "700", color: COLORS.textSecondary, marginTop: 8, marginBottom: 6 },
  input: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#eee",
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 3,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    color: COLORS.textPrimary,
  },

  dateTimeRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  dateTimeButton: { flex: 1, marginHorizontal: 4, justifyContent: "center", paddingVertical: 14 },
  dateTimeText: { marginLeft: 8, fontSize: 15 },

  categoryRow: { flexDirection: "row", marginBottom: 8, flexWrap: "wrap" },
  catBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: COLORS.card,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#eee",
  },
  catText: { color: COLORS.textPrimary, fontWeight: "700" },
  catBtnSmall: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: COLORS.card,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#eee",
    marginTop: 5,
  },
  catTextSmall: { color: COLORS.textPrimary, fontWeight: "700", fontSize: 13 },

  saveBtn: {
    marginTop: 12,
    backgroundColor: COLORS.accentBlush,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  saveBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },

  messageBox: {
    backgroundColor: COLORS.card,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    elevation: 6,
  },

  calendarContainer: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 0.5,
    borderColor: "#eee",
  },
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

  // Confirmation Modal Styles
  confirmModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  confirmModalContainer: {
    width: '85%',
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 25,
    alignItems: 'center',
    shadowColor: COLORS.nudeShadow,
    shadowOpacity: 1,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 20,
    elevation: 10,
  },
  confirmIconContainer: {
    marginBottom: 15,
  },
  confirmModalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.textPrimary,
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  confirmModalText: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 25,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
  confirmModalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  confirmButton: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginHorizontal: 5,
    shadowColor: COLORS.nudeShadow,
    shadowOpacity: 0.8,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 4,
  },
  deleteConfirmButton: {
    backgroundColor: COLORS.danger,
  },
  cancelConfirmButton: {
    backgroundColor: COLORS.textSecondary,
  },
  confirmButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  cancelButtonText: {
    color: COLORS.card,
    fontWeight: '700',
    fontSize: 16,
  },

  // Notification Styles
  notificationSection: {
    marginTop: 16,
    padding: 12,
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
  notificationTimeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  notificationTimeBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: COLORS.backgroundBase,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#eee',
  },
  notificationTimeBtnActive: {
    backgroundColor: COLORS.sage,
    borderColor: COLORS.sage,
  },
  notificationTimeText: {
    color: COLORS.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  notificationTimeTextActive: {
    color: '#fff',
  },
  notificationHint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
    marginTop: 8,
    textAlign: 'center',
  },
  customTimePicker: {
    marginTop: 12,
    marginBottom: 16,
  },
  notificationItemPreview: {
    backgroundColor: COLORS.backgroundBase,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  notificationItemTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  notificationItemDate: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  notificationSettingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 8,
  },
  settingLabel: {
    fontSize: 16,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },

  // NEW: Notification List Modal Styles
  notificationModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  notificationModalContainer: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  notificationModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  notificationModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  notificationModalContent: {
    flex: 1,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 12,
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  emptyNotificationsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyNotificationsText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  emptyNotificationsSubtext: {
    marginTop: 6,
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  notificationHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  notificationCount: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  clearAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: COLORS.danger + '15',
    borderRadius: 8,
  },
  clearAllText: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: '600',
  },
  notificationList: {
    flex: 1,
  },
  notificationItem: {
    backgroundColor: COLORS.backgroundBase,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#eee',
  },
  notificationItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  notificationItemTitle: {
    flex: 1,
    marginLeft: 10,
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  cancelNotificationButton: {
    padding: 4,
  },
  notificationItemBody: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 8,
    lineHeight: 18,
  },
  notificationItemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  notificationItemTime: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.info,
  },
  notificationItemDate: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  notificationModalCloseButton: {
    marginTop: 20,
    paddingVertical: 14,
    backgroundColor: COLORS.accentBlush,
    borderRadius: 12,
    alignItems: 'center',
  },
  notificationModalCloseText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});