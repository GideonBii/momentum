// screens/PlannerScreen.js - FIXED MODAL POSITIONING
// ✅ FIXED: Modal now properly positioned for both create and edit modes
// ✅ FIXED: Save button always visible
// ✅ FIXED: ScrollView height adjusted dynamically

import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { BlurView } from 'expo-blur';
import * as Haptics from "expo-haptics";
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { useApp } from "../context/AppContext";
import { supabase } from "../supabaseConfig";

// Import notifications
import {
  cancelTaskNotification,
  hasNotificationPermissions,
  registerAndSaveExpoPushToken,
  requestNotificationPermissions,
  scheduleTaskNotification
} from "../utils/notifications";

const { width, height } = Dimensions.get("window");

/* ================================================================================
   🎨 COLORS - Matching all screens
   ================================================================================ */

const COLORS = {
  backgroundBase: "#FAFAFA",
  card: "#FFFFFF",
  textPrimary: "#4A3228",
  textSecondary: "#A98467",
  accentBlush: "#D8A39D",
  accentWarm: "#E3B777",
  sage: "#5D8B7E",
  nudeShadow: "rgba(216,163,157,0.12)",
  danger: "#FF6347",
  success: "#5D8B7E",
  surfaceVariant: "#F8F2F0",
  textTertiary: "#B7A29E",
  cardBorder: "rgba(216,163,157,0.2)",
  gradientStart: "#FFF9F8",
  gradientEnd: "#FAF0ED",
  placeholder: "#C7B5B0",
  shared: "#9B59B6",
};

const CATEGORIES = {
  work: { label: "Work", icon: "briefcase-outline", color: COLORS.accentWarm, lightColor: "#FCF5EB" },
  personal: { label: "Personal", icon: "person-outline", color: COLORS.accentBlush, lightColor: "#FCF1EF" },
  other: { label: "Other", icon: "ellipsis-horizontal-outline", color: COLORS.sage, lightColor: "#EDF5F3" },
};

const PRIORITIES = {
  high: { label: "High", icon: "warning-outline", color: COLORS.accentBlush, lightColor: "#FFF0F0" },
  medium: { label: "Medium", icon: "remove", color: COLORS.accentWarm, lightColor: "#FFF9F0" },
  low: { label: "Low", icon: "arrow-down", color: COLORS.sage, lightColor: "#F1F8F1" },
};

const NOTIFICATION_PRESETS = [
  { label: "At due time", minutes: 0 },
  { label: "15 min before", minutes: -15 },
  { label: "30 min before", minutes: -30 },
  { label: "1 hour before", minutes: -60 },
  { label: "2 hours before", minutes: -120 },
  { label: "1 day before", minutes: -1440 },
  { label: "Custom", minutes: null },
];

/* ================================================================================
   📝 FORM REDUCER
   ================================================================================ */

const RECURRENCE_OPTIONS = [
  { key: 'none',    label: 'One-time',  icon: 'remove-circle-outline' },
  { key: 'daily',   label: 'Daily',     icon: 'sunny-outline' },
  { key: 'weekly',  label: 'Weekly',    icon: 'calendar-outline' },
  { key: 'monthly', label: 'Monthly',   icon: 'repeat-outline' },
];

const initialState = {
  id: null,
  title: "",
  description: "",
  dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
  dueTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
  category: "personal",
  priority: "medium",
  enableNotifications: true,
  notificationTime: new Date(Date.now() + 24 * 60 * 60 * 1000 - 30 * 60000),
  isRecurring: false,
  recurrenceInterval: 'none',
  isEditing: false,
};

function formReducer(state, action) {
  switch (action.type) {
    case 'SET_FIELD':
      return { ...state, [action.field]: action.value };
    
    case 'SET_DUE_DATE':
      const newDate = action.payload;
      const currentTime = state.dueTime;
      const combinedDateTime = new Date(
        newDate.getFullYear(),
        newDate.getMonth(),
        newDate.getDate(),
        currentTime.getHours(),
        currentTime.getMinutes()
      );
      return { 
        ...state, 
        dueDate: combinedDateTime,
        dueTime: combinedDateTime,
        notificationTime: new Date(combinedDateTime.getTime() - 30 * 60000)
      };
    
    case 'SET_DUE_TIME':
      const newTime = action.payload;
      const currentDate = state.dueDate;
      const combined = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        currentDate.getDate(),
        newTime.getHours(),
        newTime.getMinutes()
      );
      return { 
        ...state, 
        dueDate: combined,
        dueTime: combined,
        notificationTime: new Date(combined.getTime() - 30 * 60000)
      };
    
    case 'SET_NOTIFICATION_TIME':
      return { ...state, notificationTime: action.payload };
    
    case 'RESET':
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      return {
        ...initialState,
        dueDate: tomorrow,
        dueTime: tomorrow,
        notificationTime: new Date(tomorrow.getTime() - 30 * 60000),
      };
    
    case 'LOAD_TASK':
      const taskDueDate = action.payload.dueDate ? new Date(action.payload.dueDate) : 
                         action.payload.due_date ? new Date(action.payload.due_date) : new Date();
      return {
        ...state,
        ...action.payload,
        isEditing: true,
        id: action.payload.id,
        title: action.payload.title || "",
        description: action.payload.description || "",
        dueDate: taskDueDate,
        dueTime: taskDueDate,
        category: action.payload.category || "personal",
        priority: action.payload.priority || "medium",
        enableNotifications: action.payload.enable_notifications !== false,
        notificationTime: action.payload.notification_time 
          ? new Date(action.payload.notification_time)
          : new Date(taskDueDate.getTime() - 30 * 60000),
        isRecurring: action.payload.is_recurring || false,
        recurrenceInterval: action.payload.recurrence_interval || 'none',
      };
    
    default:
      return state;
  }
}

/* ================================================================================
   🎯 QUICK ADD BAR
   ================================================================================ */

const QuickAddBar = ({ onAdd }) => {
  const [text, setText] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: isFocused ? 1.02 : 1,
      useNativeDriver: true,
      friction: 8,
    }).start();
  }, [isFocused]);

  const handleSubmit = () => {
    if (text.trim()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onAdd({
        title: text.trim(),
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      setText("");
    }
  };

  return (
    <Animated.View style={[styles.quickAddContainer, { transform: [{ scale: scaleAnim }] }]}>
      <BlurView intensity={90} tint="light" style={styles.quickAddBlur}>
        <View style={styles.quickAddInner}>
          <Ionicons name="checkbox-outline" size={24} color={COLORS.accentBlush} />
          
          <TextInput
            style={styles.quickAddInput}
            placeholder="Quick add task..."
            placeholderTextColor={COLORS.placeholder}
            value={text}
            onChangeText={setText}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onSubmitEditing={handleSubmit}
            returnKeyType="done"
          />
          
          {text.length > 0 && (
            <TouchableOpacity onPress={handleSubmit} style={styles.quickAddSubmit}>
              <LinearGradient
                colors={[COLORS.accentBlush, COLORS.accentWarm]}
                style={styles.quickAddSubmitGradient}
              >
                <Ionicons name="arrow-forward" size={20} color="white" />
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>
      </BlurView>
    </Animated.View>
  );
};

/* ================================================================================
   🎯 TASK CARD - With Edit and Delete buttons
   ================================================================================ */

const TaskCard = React.memo(({ 
  task, 
  onToggle, 
  onEdit, 
  onDelete, 
  onLongPress, 
  isSelected, 
  selectionMode,
  viewMode 
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const category = CATEGORIES[task.category] || CATEGORIES.other;
  const priority = PRIORITIES[task.priority] || PRIORITIES.medium;
  
  const dueDate = new Date(task.dueDate);
  const now = new Date();
  const daysUntil = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
  const isOverdue = daysUntil < 0 && !task.completed;
  const isToday = daysUntil === 0;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.98,
      useNativeDriver: true,
      speed: 50,
    }).start();
  };
  
  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
    }).start();
  };

  const getDueLabel = () => {
    if (task.completed) return "Completed";
    if (isOverdue) return `${Math.abs(daysUntil)}d overdue`;
    if (isToday) return "Today";
    if (daysUntil === 1) return "Tomorrow";
    return dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <Animated.View 
      style={[
        styles.taskCard,
        viewMode === 'grid' ? styles.taskCardGrid : styles.taskCardList,
        { transform: [{ scale: scaleAnim }] }
      ]}
    >
      <TouchableOpacity
        activeOpacity={0.7}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onLongPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          onLongPress(task.id);
        }}
        delayLongPress={500}
        style={styles.taskCardTouchable}
      >
        <BlurView intensity={90} tint="light" style={styles.taskCardBlur}>
          <View style={styles.taskCardInner}>
            <View style={[styles.taskAccent, { backgroundColor: category.color }]} />
            
            <View style={styles.taskContent}>
              <View style={styles.taskHeader}>
                <TouchableOpacity
                  onPress={() => onToggle(task)}
                  style={styles.checkbox}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons
                    name={task.completed ? "checkbox" : "square-outline"}
                    size={24}
                    color={task.completed ? COLORS.sage : COLORS.textTertiary}
                  />
                </TouchableOpacity>
                
                <View style={styles.taskInfo}>
                  <Text style={[styles.taskTitle, task.completed && styles.taskTitleCompleted]} numberOfLines={1}>
                    {task.title}
                  </Text>
                  
                  <View style={styles.taskMeta}>
                    <View style={[styles.badge, { backgroundColor: priority.lightColor }]}>
                      <Ionicons name={priority.icon} size={12} color={priority.color} />
                      <Text style={[styles.badgeText, { color: priority.color }]}>
                        {priority.label}
                      </Text>
                    </View>
                    
                    <View style={[styles.badge, { backgroundColor: category.lightColor }]}>
                      <Ionicons name={category.icon} size={12} color={category.color} />
                      <Text style={[styles.badgeText, { color: category.color }]}>
                        {category.label}
                      </Text>
                    </View>
                  </View>
                </View>

                {selectionMode ? (
                  <Ionicons
                    name={isSelected ? "checkmark-circle" : "ellipse-outline"}
                    size={24}
                    color={isSelected ? COLORS.sage : COLORS.textTertiary}
                  />
                ) : (
                  <View style={styles.taskActionButtons}>
                    <TouchableOpacity 
                      onPress={() => onEdit(task)} 
                      style={styles.taskActionButton}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons name="create-outline" size={18} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity 
                      onPress={() => onDelete(task)} 
                      style={[styles.taskActionButton, styles.deleteButton]}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons name="trash-outline" size={18} color={COLORS.danger} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              
              <View style={styles.taskFooter}>
                <View style={styles.dueBadge}>
                  <Ionicons 
                    name={isOverdue ? "alert-circle" : "calendar-outline"} 
                    size={14} 
                    color={isOverdue ? COLORS.danger : COLORS.textSecondary} 
                  />
                  <Text style={[styles.dueText, isOverdue && { color: COLORS.danger }]}>
                    {getDueLabel()}
                  </Text>
                </View>
                
                <View style={styles.timeBadge}>
                  <Ionicons name="time-outline" size={14} color={COLORS.textSecondary} />
                  <Text style={styles.timeText}>
                    {dueDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                
                {task.enable_notifications && !task.completed && (
                  <View style={styles.notifBadge}>
                    <Ionicons name="notifications" size={14} color={COLORS.sage} />
                  </View>
                )}
              </View>
              
              {task.description ? (
                <Text style={styles.taskDescription} numberOfLines={viewMode === 'grid' ? 2 : 1}>
                  {task.description}
                </Text>
              ) : null}
            </View>
          </View>
        </BlurView>
      </TouchableOpacity>
    </Animated.View>
  );
});

/* ================================================================================
   🏆 MAIN SCREEN
   ================================================================================ */

export default function PlannerScreen() {
  const { user } = useApp();
  
  // State
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [notificationPermission, setNotificationPermission] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [viewMode, setViewMode] = useState("list");
  
  // Form state
  const [formState, formDispatch] = useReducer(formReducer, initialState);
  
  // Picker states
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showNotifPicker, setShowNotifPicker] = useState(false);
  const [notifPickerMode, setNotifPickerMode] = useState('date');
  const [tempNotifDate, setTempNotifDate] = useState(new Date());

  // Animation
  const scrollY = useRef(new Animated.Value(0)).current;
  const flatListRef = useRef(null);
  const isMounted = useRef(true);

  // Filter tasks
  const filteredTasksList = useMemo(() => {
    let filtered = tasks
      .filter(t => showCompleted ? true : !t.completed)
      .filter(t => selectedCategory === "all" || t.category === selectedCategory)
      .filter(t => 
        !searchQuery || 
        t.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    
    filtered.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return new Date(a.dueDate) - new Date(b.dueDate);
    });
    
    return filtered;
  }, [tasks, selectedCategory, searchQuery, showCompleted]);

  const incompleteCount = useMemo(() => 
    tasks.filter(t => !t.completed).length, 
    [tasks]
  );
  
  const completedCount = useMemo(() => 
    tasks.filter(t => t.completed).length, 
    [tasks]
  );
  
  const overdueCount = useMemo(() => 
    tasks.filter(t => !t.completed && new Date(t.dueDate) < new Date()).length, 
    [tasks]
  );

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  /* ================================================================================
     🔔 NOTIFICATION SETUP
     ================================================================================ */

  useEffect(() => {
    const setupNotifications = async () => {
      if (!user) return;
      
      try {
        const hasPermission = await hasNotificationPermissions();
        if (isMounted.current) setNotificationPermission(hasPermission);
        
        if (!hasPermission) {
          const granted = await requestNotificationPermissions();
          if (isMounted.current) setNotificationPermission(granted);
          if (granted) {
            await registerAndSaveExpoPushToken(user.id);
          }
        } else {
          await registerAndSaveExpoPushToken(user.id);
        }
      } catch (error) {
        console.error('❌ Error setting up notifications:', error);
      }
    };
    
    setupNotifications();
  }, [user]);

  /* ================================================================================
     🔥 SUPABASE LISTENER
     ================================================================================ */

  useEffect(() => {
    if (!user) {
      if (isMounted.current) {
        setTasks([]);
        setLoading(false);
      }
      return;
    }

    const fetchTasks = async () => {
      const { data, error } = await supabase
        .from("planner")
        .select("*")
        .eq("user_id", user.id);

      if (!isMounted.current) return;
      
      if (error) {
        console.error("Planner fetch error:", error);
        setLoading(false);
        Alert.alert("Error", "Failed to load tasks. Please check your connection.");
        return;
      }

      const taskList = (data || []).map(row => ({
        ...row,
        dueDate: row.due_date ? new Date(row.due_date) : new Date(),
        notificationTime: row.notification_time ? new Date(row.notification_time) : null,
      }));

      setTasks(taskList);
      setLoading(false);
    };

    fetchTasks();

    const channel = supabase.channel(`planner-${user.id}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "planner",
        filter: `user_id=eq.${user.id}`
      }, () => {
        if (isMounted.current) fetchTasks();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  /* ================================================================================
     🎯 NOTIFICATION SCHEDULING
     ================================================================================ */

  const scheduleNotification = useCallback(async (task) => {
    try {
      if (!task.enableNotifications || task.completed || !task.dueDate) {
        return;
      }
      
      const dueDate = new Date(task.dueDate);
      if (dueDate < new Date()) {
        console.log('⏭️ Task due date is in the past');
        return;
      }
      
      const notificationTime = task.notificationTime || new Date(dueDate.getTime() - 30 * 60000);
      
      if (notificationTime < new Date()) {
        console.log('⏭️ Notification time is in the past');
        return;
      }

      const notificationId = await scheduleTaskNotification({ 
        ...task, 
        notificationTime,
        title: task.title,
        body: `Task "${task.title}" is due soon!`,
        data: {
          taskId: task.id,
          screen: 'Planner',
          type: 'task_reminder'
        }
      });
      
      if (notificationId) {
        const timeString = notificationTime.toLocaleTimeString([], { 
          hour: '2-digit', 
          minute: '2-digit' 
        });
        const dateString = notificationTime.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        });
        
        Alert.alert(
          '🔔 Reminder Set',
          `You'll be notified on ${dateString} at ${timeString}`
        );
      }
    } catch (error) {
      console.error('❌ Error scheduling notification:', error);
      Alert.alert("Error", "Failed to schedule reminder. Please try again.");
    }
  }, []);

  /* ================================================================================
     🎯 TASK OPERATIONS
     ================================================================================ */

  const saveTask = useCallback(async (dueDateTime) => {
    if (!isMounted.current) return;
    setLoading(true);
    
    try {
      if (formState.isEditing && formState.id) {
        // Update existing task
        const { error } = await supabase.from("planner").update({
          title: formState.title.trim(),
          description: formState.description.trim(),
          due_date: dueDateTime.toISOString(),
          category: formState.category,
          priority: formState.priority,
          enable_notifications: formState.enableNotifications,
          notification_time: formState.enableNotifications ? (formState.notificationTime?.toISOString() || null) : null,
          is_recurring: formState.isRecurring,
          recurrence_interval: formState.isRecurring ? formState.recurrenceInterval : null,
          updated_at: new Date().toISOString(),
        }).eq("id", formState.id);
        
        if (error) throw error;
        
        if (formState.enableNotifications) {
          await scheduleNotification({ 
            ...formState, 
            id: formState.id,
            dueDate: dueDateTime,
            notificationTime: formState.notificationTime 
          });
        } else {
          await cancelTaskNotification(formState.id);
        }
      } else {
        // Create new task
        const { data: newTask, error } = await supabase.from("planner").insert({
          title: formState.title.trim(),
          description: formState.description.trim(),
          due_date: dueDateTime.toISOString(),
          user_id: user.id,
          completed: false,
          category: formState.category,
          priority: formState.priority,
          enable_notifications: formState.enableNotifications,
          notification_time: formState.enableNotifications ? (formState.notificationTime?.toISOString() || null) : null,
          is_recurring: formState.isRecurring,
          recurrence_interval: formState.isRecurring ? formState.recurrenceInterval : null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).select().single();
        
        if (error) throw error;
        
        if (formState.enableNotifications && newTask) {
          await scheduleNotification({ 
            ...formState, 
            id: newTask.id,
            dueDate: dueDateTime,
            notificationTime: formState.notificationTime 
          });
        }
      }
      
      setIsFormVisible(false);
      formDispatch({ type: 'RESET' });
    } catch (error) {
      console.error("Save task error:", error);
      Alert.alert("Error", "Failed to save task. Please try again.");
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [formState, user, scheduleNotification]);

  const handleSaveTask = useCallback(async () => {
    if (!formState.title.trim()) {
      Alert.alert("Error", "Please enter a task title");
      return;
    }
    if (!user) return;

    const dueDateTime = new Date(
      formState.dueDate.getFullYear(),
      formState.dueDate.getMonth(),
      formState.dueDate.getDate(),
      formState.dueTime.getHours(),
      formState.dueTime.getMinutes()
    );

    if (dueDateTime < new Date() && !formState.isEditing) {
      Alert.alert(
        "Past Due Date",
        "This task's due date is in the past. No reminder will be sent. Continue?",
        [
          { text: "Go Back", style: "cancel" },
          { text: "Save Anyway", onPress: () => saveTask(dueDateTime) }
        ]
      );
      return;
    }

    saveTask(dueDateTime);
  }, [formState, user, saveTask]);

  const handleToggleComplete = useCallback(async (task) => {
    try {
      const isCompleting = !task.completed;
      
      const { error } = await supabase.from("planner").update({
        completed: isCompleting,
        enable_notifications: isCompleting ? false : task.enable_notifications,
        updated_at: new Date().toISOString(),
      }).eq("id", task.id);
      
      if (error) throw error;
      
      if (isCompleting) {
        await cancelTaskNotification(task.id);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error("Toggle complete error:", error);
      Alert.alert("Error", "Could not update task. Please check your connection and try again.");
    }
  }, []);

  const handleDeleteTask = useCallback(async (task) => {
    Alert.alert("Delete Task", `Delete "${task.title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await cancelTaskNotification(task.id);
            const { error } = await supabase.from("planner").delete().eq("id", task.id);
            if (error) throw error;
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (error) {
            console.error("Delete task error:", error);
            Alert.alert("Error", "Failed to delete task. Please try again.");
          }
        },
      },
    ]);
  }, []);

  const handleEditTask = useCallback((task) => {
    formDispatch({ type: 'LOAD_TASK', payload: task });
    setIsFormVisible(true);
  }, []);

  const handleQuickAdd = useCallback(async ({ title, dueDate }) => {
    if (!user) return;
    
    try {
      const { error } = await supabase.from("planner").insert({
        title,
        description: "",
        due_date: dueDate.toISOString(),
        user_id: user.id,
        completed: false,
        category: "personal",
        priority: "medium",
        enable_notifications: true,
        notification_time: new Date(dueDate.getTime() - 30 * 60000).toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      
      if (error) throw error;
      
      Alert.alert("✨ Success", "Task created! You can edit it to add details.");
    } catch (error) {
      console.error("Quick add error:", error);
      Alert.alert("Error", "Failed to create task");
    }
  }, [user]);

  const handleLongPressSelect = useCallback((id) => {
    if (!selectionMode) {
      setSelectionMode(true);
      setSelectedIds([id]);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } else {
      setSelectedIds(prev => 
        prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      );
    }
  }, [selectionMode]);

  const handleBatchComplete = useCallback(async () => {
    if (selectedIds.length === 0) return;
    
    try {
      const results = await Promise.allSettled(
        selectedIds.map(id =>
          supabase.from("planner").update({
            completed: true,
            enable_notifications: false,
            updated_at: new Date().toISOString(),
          }).eq("id", id)
        )
      );
      
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      await Promise.allSettled(selectedIds.map(id => cancelTaskNotification(id)));
      
      setSelectionMode(false);
      setSelectedIds([]);
      
      if (failed === 0) {
        Alert.alert("✅ Success", `Completed ${succeeded} tasks`);
      } else {
        Alert.alert("⚠️ Partial Success", `Completed ${succeeded} tasks, ${failed} failed`);
      }
    } catch (error) {
      console.error("Batch complete error:", error);
      Alert.alert("Error", "Could not complete tasks. Please try again.");
    }
  }, [selectedIds]);

  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.length === 0) return;
    
    Alert.alert("Delete Tasks", `Delete ${selectedIds.length} tasks?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await Promise.allSettled(selectedIds.map(id => cancelTaskNotification(id)));
            
            const results = await Promise.allSettled(
              selectedIds.map(id => supabase.from("planner").delete().eq("id", id))
            );
            
            const succeeded = results.filter(r => r.status === 'fulfilled').length;
            const failed = results.filter(r => r.status === 'rejected').length;
            
            setSelectionMode(false);
            setSelectedIds([]);
            
            if (failed === 0) {
              Alert.alert("🗑️ Deleted", `Deleted ${succeeded} tasks`);
            } else {
              Alert.alert("⚠️ Partial Success", `Deleted ${succeeded} tasks, ${failed} failed`);
            }
          } catch (error) {
            console.error("Batch delete error:", error);
            Alert.alert("Error", "Failed to delete tasks. Please try again.");
          }
        },
      },
    ]);
  }, [selectedIds]);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  /* ================================================================================
     📅 DATE/TIME PICKER HANDLERS
     ================================================================================ */

  const handleCustomNotificationPress = useCallback(() => {
    setTempNotifDate(formState.notificationTime || new Date());
    setNotifPickerMode('date');
    setShowNotifPicker(true);
  }, [formState.notificationTime]);

  const handleNotifPickerChange = useCallback((event, selectedDate) => {
    if (Platform.OS === 'android') {
      if (event.type === 'dismissed' || !selectedDate) {
        setShowNotifPicker(false);
        return;
      }
    }

    if (notifPickerMode === 'date') {
      setTempNotifDate(selectedDate || tempNotifDate);
      setNotifPickerMode('time');
    } else {
      const finalDate = selectedDate || tempNotifDate;
      const currentDate = tempNotifDate;
      
      const combinedDateTime = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        currentDate.getDate(),
        finalDate.getHours(),
        finalDate.getMinutes()
      );
      
      formDispatch({ type: 'SET_NOTIFICATION_TIME', payload: combinedDateTime });
      setShowNotifPicker(false);
      setNotifPickerMode('date');
      
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [notifPickerMode, tempNotifDate]);

  // FlatList render item
  const renderTaskItem = useCallback(({ item }) => (
    <TaskCard
      task={item}
      onToggle={handleToggleComplete}
      onEdit={handleEditTask}
      onDelete={handleDeleteTask}
      onLongPress={handleLongPressSelect}
      isSelected={selectedIds.includes(item.id)}
      selectionMode={selectionMode}
      viewMode={viewMode}
    />
  ), [handleToggleComplete, handleEditTask, handleDeleteTask, handleLongPressSelect, selectedIds, selectionMode, viewMode]);

  /* ================================================================================
     🎨 RENDER
     ================================================================================ */

  const headerHeight = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [Platform.OS === 'ios' ? 120 : 100, 80],
    extrapolate: 'clamp',
  });

  const headerTitleSize = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [28, 22],
    extrapolate: 'clamp',
  });

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.backgroundBase} />
      
      {/* Animated Header */}
      <Animated.View style={[styles.header, { height: headerHeight }]}>
        <LinearGradient
          colors={[COLORS.gradientStart, COLORS.gradientEnd]}
          style={StyleSheet.absoluteFill}
        />
        
        <View style={styles.headerContent}>
          <View style={styles.headerTop}>
            <View>
              <Animated.Text style={[styles.headerTitle, { fontSize: headerTitleSize }]}>
                Planner
              </Animated.Text>
              <Text style={styles.headerSubtitle}>
                {incompleteCount} active • {overdueCount} overdue
              </Text>
            </View>
            
            <View style={styles.headerRight}>
              <View style={styles.viewModeToggle}>
                <TouchableOpacity
                  style={[styles.viewModeButton, viewMode === 'list' && styles.viewModeButtonActive]}
                  onPress={() => setViewMode('list')}
                >
                  <Ionicons 
                    name="list" 
                    size={20} 
                    color={viewMode === 'list' ? COLORS.accentBlush : COLORS.textTertiary} 
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.viewModeButton, viewMode === 'grid' && styles.viewModeButtonActive]}
                  onPress={() => setViewMode('grid')}
                >
                  <Ionicons 
                    name="grid" 
                    size={20} 
                    color={viewMode === 'grid' ? COLORS.accentBlush : COLORS.textTertiary} 
                  />
                </TouchableOpacity>
              </View>
              
              {selectionMode ? (
                <View style={styles.selectionActions}>
                  <TouchableOpacity onPress={handleBatchComplete} style={styles.selectionButton}>
                    <Ionicons name="checkmark-done" size={22} color={COLORS.success} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleBatchDelete} style={styles.selectionButton}>
                    <Ionicons name="trash" size={22} color={COLORS.danger} />
                  </TouchableOpacity>
                  <TouchableOpacity 
                    onPress={() => { setSelectionMode(false); setSelectedIds([]); }} 
                    style={styles.selectionButton}
                  >
                    <Ionicons name="close" size={22} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity 
                  style={styles.addButton}
                  onPress={() => { formDispatch({ type: 'RESET' }); setIsFormVisible(true); }}
                >
                  <LinearGradient
                    colors={[COLORS.accentBlush, COLORS.accentWarm]}
                    style={styles.addButtonGradient}
                  >
                    <Ionicons name="add" size={24} color="white" />
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Search Bar */}
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={18} color={COLORS.textTertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search tasks..."
              placeholderTextColor={COLORS.placeholder}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery ? (
              <TouchableOpacity onPress={clearSearch}>
                <Ionicons name="close-circle" size={18} color={COLORS.textTertiary} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </Animated.View>
      
      {/* Category Filters & Completed Toggle */}
      <View style={styles.filterBar}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroll}
          contentContainerStyle={styles.categoryContainer}
        >
          <TouchableOpacity
            style={[styles.categoryChip, selectedCategory === 'all' && styles.categoryChipActive]}
            onPress={() => {
              setSelectedCategory('all');
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <Text style={[styles.categoryText, selectedCategory === 'all' && styles.categoryTextActive]}>
              All
            </Text>
          </TouchableOpacity>
          
          {Object.entries(CATEGORIES).map(([key, cat]) => (
            <TouchableOpacity
              key={key}
              style={[
                styles.categoryChip,
                { backgroundColor: selectedCategory === key ? cat.color : COLORS.card },
                selectedCategory === key && styles.categoryChipActive,
              ]}
              onPress={() => {
                setSelectedCategory(key);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <Ionicons 
                name={cat.icon} 
                size={16} 
                color={selectedCategory === key ? 'white' : cat.color} 
              />
              <Text style={[
                styles.categoryText,
                { color: selectedCategory === key ? 'white' : cat.color }
              ]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        
        <TouchableOpacity
          style={styles.completedToggle}
          onPress={() => setShowCompleted(!showCompleted)}
        >
          <Ionicons 
            name={showCompleted ? "eye-outline" : "eye-off-outline"} 
            size={20} 
            color={showCompleted ? COLORS.sage : COLORS.textSecondary} 
          />
          <Text style={[styles.completedToggleText, showCompleted && { color: COLORS.sage }]}>
            {showCompleted ? "All" : "Active"}
          </Text>
          <Text style={styles.completedCount}>({completedCount})</Text>
        </TouchableOpacity>
      </View>
      
      {/* Task List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.accentBlush} />
          <Text style={styles.loadingText}>Loading tasks...</Text>
        </View>
      ) : filteredTasksList.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="checkbox-outline" size={64} color={COLORS.textTertiary} />
          <Text style={styles.emptyTitle}>
            {searchQuery ? "No tasks found" : "No tasks yet"}
          </Text>
          <Text style={styles.emptyText}>
            {searchQuery 
              ? "Try a different search term" 
              : showCompleted 
                ? "No completed tasks"
                : "Create your first task to get started"}
          </Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={() => { formDispatch({ type: 'RESET' }); setIsFormVisible(true); }}
          >
            <LinearGradient
              colors={[COLORS.accentBlush, COLORS.accentWarm]}
              style={styles.emptyButtonGradient}
            >
              <Ionicons name="add" size={20} color="white" />
              <Text style={styles.emptyButtonText}>Create Task</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={filteredTasksList}
          renderItem={renderTaskItem}
          keyExtractor={(item) => item.id}
          numColumns={viewMode === 'grid' ? 2 : 1}
          key={viewMode}
          contentContainerStyle={styles.taskListContent}
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: false }
          )}
          scrollEventThrottle={16}
          ListFooterComponent={<View style={{ height: 100 }} />}
        />
      )}
      
      {/* Quick Add Bar */}
      {!selectionMode && !loading && filteredTasksList.length > 0 && (
        <QuickAddBar onAdd={handleQuickAdd} />
      )}
      
      {/* ================================================================================
         📝 TASK FORM MODAL - FIXED POSITIONING
         ================================================================================ */}
      
      <Modal
        visible={isFormVisible}
        animationType="slide"
        transparent
        onRequestClose={() => { setIsFormVisible(false); formDispatch({ type: 'RESET' }); }}
      >
        <View style={styles.formModalOverlay}>
          <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.formModalKeyboard}
          >
            <View style={styles.formModalContainer}>

              {/* ── Drag handle ── */}
              <View style={styles.formModalDragHandle} />

              {/* ── Header ── */}
              <LinearGradient
                colors={['#C97B6E', COLORS.accentBlush, COLORS.accentWarm]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.formModalHeaderGradient}
              >
                <View style={styles.formModalHeader}>
                  <View>
                    <Text style={styles.formModalTitle}>
                      {formState.isEditing ? 'Edit Task' : 'New Task'}
                    </Text>
                    <Text style={styles.formModalSubtitle}>
                      {formState.isEditing ? 'Update your task details' : 'What do you want to accomplish?'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => { setIsFormVisible(false); formDispatch({ type: 'RESET' }); }}
                    style={styles.formModalClose}
                  >
                    <Ionicons name="close" size={20} color="white" />
                  </TouchableOpacity>
                </View>
              </LinearGradient>

              {/* ── Scrollable form body ── */}
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.formModalScroll}
                keyboardShouldPersistTaps="handled"
              >

                {/* TITLE */}
                <View style={styles.formSection}>
                  <View style={styles.formLabelRow}>
                    <Text style={styles.formLabel}>Title <Text style={styles.requiredStar}>*</Text></Text>
                    <Text style={styles.formCounter}>{formState.title.length}/200</Text>
                  </View>
                  <View style={styles.formInputContainer}>
                    <Ionicons name="create-outline" size={20} color={COLORS.accentBlush} />
                    <TextInput
                      style={styles.formInput}
                      placeholder="What needs to be done?"
                      placeholderTextColor={COLORS.placeholder}
                      value={formState.title}
                      onChangeText={(text) => formDispatch({ type: 'SET_FIELD', field: 'title', value: text })}
                      maxLength={200}
                      autoFocus={!formState.isEditing}
                    />
                  </View>
                </View>

                {/* DESCRIPTION */}
                <View style={styles.formSection}>
                  <View style={styles.formLabelRow}>
                    <Text style={styles.formLabel}>Notes</Text>
                    <Text style={styles.formCounter}>{formState.description.length}/1000</Text>
                  </View>
                  <View style={[styles.formInputContainer, styles.formTextArea]}>
                    <Ionicons name="document-text-outline" size={20} color={COLORS.accentBlush} />
                    <TextInput
                      style={[styles.formInput, { minHeight: 72 }]}
                      placeholder="Add context or details..."
                      placeholderTextColor={COLORS.placeholder}
                      value={formState.description}
                      onChangeText={(text) => formDispatch({ type: 'SET_FIELD', field: 'description', value: text })}
                      multiline
                      maxLength={1000}
                    />
                  </View>
                </View>

                {/* DUE DATE & TIME */}
                <View style={styles.formSection}>
                  <Text style={styles.formLabel}>Due Date & Time</Text>
                  <View style={styles.formDateTimeRow}>
                    <TouchableOpacity
                      style={styles.formDateTimeButton}
                      onPress={() => { setShowDatePicker(true); setShowTimePicker(false); }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="calendar-outline" size={20} color={COLORS.accentBlush} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.formDateTimeLabel}>Date</Text>
                        <Text style={styles.formDateTimeValue}>
                          {formState.dueDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </Text>
                      </View>
                      <Ionicons name="chevron-down" size={14} color={COLORS.accentBlush} />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.formDateTimeButton, { borderColor: COLORS.accentWarm + '50' }]}
                      onPress={() => { setShowTimePicker(true); setShowDatePicker(false); }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="time-outline" size={20} color={COLORS.accentWarm} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.formDateTimeLabel, { color: COLORS.accentWarm }]}>Time</Text>
                        <Text style={styles.formDateTimeValue}>
                          {formState.dueTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                      <Ionicons name="chevron-down" size={14} color={COLORS.accentWarm} />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* DATE PICKER */}
                {showDatePicker && (
                  <DateTimePicker
                    value={formState.dueDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    minimumDate={new Date()}
                    onChange={(event, date) => {
                      setShowDatePicker(false);
                      if (date) {
                        formDispatch({ type: 'SET_DUE_DATE', payload: date });
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }
                    }}
                  />
                )}

                {/* TIME PICKER */}
                {showTimePicker && (
                  <DateTimePicker
                    value={formState.dueTime}
                    mode="time"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(event, time) => {
                      setShowTimePicker(false);
                      if (time) {
                        formDispatch({ type: 'SET_DUE_TIME', payload: time });
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }
                    }}
                  />
                )}

                {/* CATEGORY & PRIORITY */}
                <View style={styles.formRow}>
                  <View style={[styles.formSection, { flex: 1, marginRight: 8, marginBottom: 0 }]}>
                    <Text style={styles.formLabel}>Category</Text>
                    <View style={styles.formChipGroup}>
                      {Object.entries(CATEGORIES).map(([key, cat]) => {
                        const active = formState.category === key;
                        return (
                          <TouchableOpacity
                            key={key}
                            style={[
                              styles.formChip,
                              { backgroundColor: cat.lightColor },
                              active && { backgroundColor: cat.color, borderWidth: 0 },
                            ]}
                            onPress={() => {
                              formDispatch({ type: 'SET_FIELD', field: 'category', value: key });
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            }}
                          >
                            <Ionicons name={cat.icon} size={15} color={active ? 'white' : cat.color} />
                            <Text style={[styles.formChipText, { color: active ? 'white' : cat.color }]}>
                              {cat.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  <View style={[styles.formSection, { flex: 1, marginLeft: 8, marginBottom: 0 }]}>
                    <Text style={styles.formLabel}>Priority</Text>
                    <View style={styles.formChipGroup}>
                      {Object.entries(PRIORITIES).map(([key, pri]) => {
                        const active = formState.priority === key;
                        return (
                          <TouchableOpacity
                            key={key}
                            style={[
                              styles.formChip,
                              { backgroundColor: pri.lightColor },
                              active && { backgroundColor: pri.color, borderWidth: 0 },
                            ]}
                            onPress={() => {
                              formDispatch({ type: 'SET_FIELD', field: 'priority', value: key });
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            }}
                          >
                            <Ionicons name={pri.icon} size={15} color={active ? 'white' : pri.color} />
                            <Text style={[styles.formChipText, { color: active ? 'white' : pri.color }]}>
                              {pri.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                </View>

                {/* RECURRENCE */}
                <View style={styles.formSection}>
                  <Text style={styles.formLabel}>Repeat</Text>
                  <View style={styles.formRecurrenceGrid}>
                    {RECURRENCE_OPTIONS.map((opt) => {
                      const active = formState.recurrenceInterval === opt.key;
                      return (
                        <TouchableOpacity
                          key={opt.key}
                          style={[
                            styles.formRecurrenceCard,
                            active && styles.formRecurrenceCardActive,
                          ]}
                          onPress={() => {
                            formDispatch({ type: 'SET_FIELD', field: 'recurrenceInterval', value: opt.key });
                            formDispatch({ type: 'SET_FIELD', field: 'isRecurring', value: opt.key !== 'none' });
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          }}
                        >
                          <Ionicons
                            name={opt.icon}
                            size={18}
                            color={active ? COLORS.accentWarm : COLORS.textSecondary}
                          />
                          <Text style={[styles.formRecurrenceText, active && styles.formRecurrenceTextActive]}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                {/* NOTIFICATIONS */}
                <View style={styles.formSection}>
                  <View style={styles.formSwitchRow}>
                    <View style={styles.formSwitchLabel}>
                      <Ionicons name="notifications-outline" size={20} color={COLORS.sage} />
                      <Text style={[styles.formLabel, { marginBottom: 0, marginLeft: 8 }]}>Reminder</Text>
                    </View>
                    <Switch
                      value={formState.enableNotifications}
                      onValueChange={(value) => {
                        formDispatch({ type: 'SET_FIELD', field: 'enableNotifications', value });
                        if (value && !formState.notificationTime) {
                          formDispatch({
                            type: 'SET_NOTIFICATION_TIME',
                            payload: new Date(formState.dueDate.getTime() - 30 * 60000),
                          });
                        }
                      }}
                      trackColor={{ false: '#E0E0E0', true: COLORS.sage + '80' }}
                      thumbColor={formState.enableNotifications ? COLORS.sage : '#f4f3f4'}
                    />
                  </View>

                  {formState.enableNotifications && (
                    <>
                      <Text style={[styles.formLabel, { marginTop: 16, marginBottom: 8 }]}>Remind me</Text>
                      <View style={styles.formNotifPresets}>
                        {NOTIFICATION_PRESETS.map((preset) => {
                          const dueTime = formState.dueDate.getTime();
                          const isActive = preset.minutes === null
                            ? formState.notificationTime &&
                              !NOTIFICATION_PRESETS
                                .filter(p => p.minutes !== null)
                                .some(p => dueTime + p.minutes * 60000 === formState.notificationTime?.getTime())
                            : formState.notificationTime?.getTime() === dueTime + preset.minutes * 60000;
                          return (
                            <TouchableOpacity
                              key={preset.label}
                              style={[styles.formNotifPreset, isActive && styles.formNotifPresetActive]}
                              onPress={() => {
                                if (preset.minutes === null) {
                                  handleCustomNotificationPress();
                                } else {
                                  formDispatch({
                                    type: 'SET_NOTIFICATION_TIME',
                                    payload: new Date(dueTime + preset.minutes * 60000),
                                  });
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                }
                              }}
                            >
                              <Text style={[styles.formNotifPresetText, isActive && styles.formNotifPresetTextActive]}>
                                {preset.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      {/* Custom notification picker */}
                      {showNotifPicker && (
                        <DateTimePicker
                          value={tempNotifDate}
                          mode={notifPickerMode}
                          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                          minimumDate={new Date()}
                          maximumDate={formState.dueDate}
                          onChange={handleNotifPickerChange}
                        />
                      )}

                      {/* Selected notification time display */}
                      {formState.notificationTime && (
                        <View style={styles.formNotifTimeDisplay}>
                          <Ionicons name="alarm-outline" size={16} color={COLORS.sage} />
                          <Text style={styles.formNotifTimeText}>
                            {formState.notificationTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {' at '}
                            {formState.notificationTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                          <TouchableOpacity onPress={handleCustomNotificationPress} style={{ padding: 4 }}>
                            <Ionicons name="create-outline" size={16} color={COLORS.sage} />
                          </TouchableOpacity>
                        </View>
                      )}
                    </>
                  )}
                </View>

                <View style={{ height: 12 }} />
              </ScrollView>

              {/* ── Save button ── */}
              <TouchableOpacity
                style={styles.formSaveButton}
                onPress={handleSaveTask}
                disabled={loading}
              >
                <LinearGradient
                  colors={formState.title.trim().length > 0
                    ? ['#C97B6E', COLORS.accentBlush, COLORS.accentWarm]
                    : [COLORS.textTertiary, COLORS.textTertiary]}
                  style={styles.formSaveGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {loading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <>
                      <Ionicons
                        name={formState.isEditing ? 'checkmark-done' : 'checkbox-outline'}
                        size={20}
                        color="white"
                      />
                      <Text style={styles.formSaveText}>
                        {formState.isEditing ? 'Save Changes' : 'Create Task'}
                      </Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>

            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* ================================================================================
   🎨 STYLES
   ================================================================================ */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.backgroundBase,
  },
  
  // Header
  header: {
    backgroundColor: COLORS.card,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 8,
    overflow: 'hidden',
  },
  headerContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 50 : 18,
    paddingBottom: 16,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontWeight: '900',
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
    fontWeight: '500',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  
  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    borderWidth: 0,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  
  // View Mode Toggle
  viewModeToggle: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 20,
    padding: 4,
  },
  viewModeButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  viewModeButtonActive: {
    backgroundColor: COLORS.card,
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 2,
  },
  
  // Add Button
  addButton: {
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: COLORS.accentBlush,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  addButtonGradient: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // Selection
  selectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.card,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 2,
  },
  
  // Filter Bar
  filterBar: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryScroll: {
    flex: 1,
    marginRight: 12,
  },
  categoryContainer: {
    paddingRight: 20,
    gap: 12,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    gap: 6,
  },
  categoryChipActive: {
    borderWidth: 0,
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '600',
  },
  categoryTextActive: {
    color: 'white',
  },
  completedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    gap: 6,
  },
  completedToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  completedCount: {
    fontSize: 12,
    color: COLORS.textTertiary,
    fontWeight: '600',
  },
  
  // Task Card
  taskCard: {
    marginBottom: 12,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 4,
  },
  taskCardList: {
    width: '100%',
  },
  taskCardGrid: {
    width: (width - 52) / 2,
  },
  taskCardBlur: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  taskCardTouchable: {
    flex: 1,
  },
  taskCardInner: {
    flexDirection: 'row',
  },
  taskAccent: {
    width: 6,
    height: '100%',
  },
  taskContent: {
    flex: 1,
    padding: 16,
  },
  taskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    marginRight: 12,
  },
  taskInfo: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 6,
  },
  taskTitleCompleted: {
    textDecorationLine: 'line-through',
    color: COLORS.textTertiary,
  },
  taskMeta: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  taskActionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 8,
  },
  taskActionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButton: {
    backgroundColor: COLORS.danger + '15',
  },
  taskFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 12,
  },
  dueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dueText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  notifBadge: {
    backgroundColor: COLORS.sage + '20',
    padding: 4,
    borderRadius: 12,
  },
  taskDescription: {
    fontSize: 13,
    color: COLORS.textTertiary,
    marginTop: 8,
  },
  
  // Quick Add
  quickAddContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    zIndex: 100,
  },
  quickAddBlur: {
    borderRadius: 30,
    overflow: 'hidden',
  },
  quickAddInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: Platform.OS === 'ios' ? 16 : 12,
    backgroundColor: COLORS.card,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  quickAddInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  quickAddSubmit: {
    marginLeft: 8,
    borderRadius: 20,
    overflow: 'hidden',
  },
  quickAddSubmitGradient: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // Task List
  taskListContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  
  // Loading
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  
  // Empty State
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    color: COLORS.textTertiary,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 40,
  },
  emptyButton: {
    borderRadius: 30,
    overflow: 'hidden',
    shadowColor: COLORS.accentBlush,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  emptyButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    gap: 8,
  },
  emptyButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  
  // ── MODAL ────────────────────────────────────────────────────────────────────
  formModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  formModalKeyboard: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  formModalContainer: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: height * 0.90,
    flexDirection: 'column',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 20,
  },
  formModalDragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.cardBorder,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 0,
  },
  formModalHeaderGradient: {
    borderRadius: 0,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  formModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  formModalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: 'white',
    letterSpacing: -0.4,
  },
  formModalSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.78)',
    marginTop: 3,
    fontWeight: '500',
  },
  formModalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.20)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  formModalScroll: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },

  // ── FORM ELEMENTS (matching GoalsScreen pattern) ──────────────────────────
  formSection: {
    marginBottom: 22,
  },
  formRow: {
    flexDirection: 'row',
    marginBottom: 22,
  },
  formLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  requiredStar: {
    color: COLORS.danger,
  },
  formCounter: {
    fontSize: 11,
    color: COLORS.textTertiary,
    fontWeight: '500',
  },
  formInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    gap: 10,
  },
  formTextArea: {
    alignItems: 'flex-start',
  },
  formInput: {
    flex: 1,
    fontSize: 15,
    color: COLORS.textPrimary,
    lineHeight: 22,
  },

  // Date / Time
  formDateTimeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  formDateTimeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
    gap: 10,
    borderWidth: 1.5,
    borderColor: COLORS.accentBlush + '50',
  },
  formDateTimeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.accentBlush,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  formDateTimeValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },

  // Category / Priority chips
  formChipGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  formChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  formChipText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Recurrence  (matching GoalsScreen formRecurrenceGrid/Card)
  formRecurrenceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  formRecurrenceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceVariant,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    gap: 8,
    minWidth: (width - 64) / 2,
  },
  formRecurrenceCardActive: {
    backgroundColor: COLORS.accentWarm + '18',
    borderColor: COLORS.accentWarm,
  },
  formRecurrenceText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  formRecurrenceTextActive: {
    color: COLORS.accentWarm,
    fontWeight: '700',
  },

  // Notifications
  formSwitchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  formSwitchLabel: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  formNotifPresets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  formNotifPreset: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceVariant,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  formNotifPresetActive: {
    backgroundColor: COLORS.sage,
    borderWidth: 0,
  },
  formNotifPresetText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  formNotifPresetTextActive: {
    color: 'white',
  },
  formNotifTimeDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.sage + '15',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    gap: 8,
  },
  formNotifTimeText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.sage,
    fontWeight: '600',
  },

  // Save button
  formSaveButton: {
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: Platform.OS === 'ios' ? 36 : 20,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: COLORS.accentBlush,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  formSaveGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  formSaveText: {
    color: 'white',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
});