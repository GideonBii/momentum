// screens/GoalsScreen.js
// 🎯 UPDATED REDESIGN - February 14, 2026
// ✅ Added notificationSent flag for cloud function integration
// ✅ Added proper notification scheduling/cleanup
// ✅ Fixed all imports and dependencies
// ✅ Removed duplicate stats bar (now only in analytics)
// ✅ Added "Tap to add milestone" hint

import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useNavigation } from "@react-navigation/native";
import { BlurView } from 'expo-blur';
import * as Haptics from "expo-haptics";
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { Circle, Svg } from "react-native-svg";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where
} from "firebase/firestore";

import { useApp } from "../context/AppContext";
import { db } from "../firebaseConfig";

// Import notifications
import {
  cancelGoalNotifications,
  hasNotificationPermissions,
  NOTIFICATION_TYPES,
  requestNotificationPermissions,
  scheduleGoalNotifications,
  sendNotification
} from "../utils/notifications";

const { width, height } = Dimensions.get("window");

/* ================================================================================
   🎨 COLORS - Matching Planner screen exactly
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
  shadowDark: "rgba(0,0,0,0.06)",
  danger: "#FF6347",
  success: "#5D8B7E",
  info: "#2196F3",
  warning: "#FFA726",
  surfaceVariant: "#F8F2F0",
  textTertiary: "#B7A29E",
  cardBorder: "rgba(216,163,157,0.2)",
  gradientStart: "#FFF9F8",
  gradientEnd: "#FAF0ED",
  overlay: "rgba(74,50,40,0.4)",
  archived: "#95A5A6",
  recurring: "#1ABC9C",
};

const CATEGORY_CONFIG = {
  personal: { 
    label: "Personal", 
    icon: "person-outline", 
    color: COLORS.accentBlush,
    lightColor: "#FCF1EF",
    gradient: ["#F1DDDA", "#D8A39D"],
  },
  work: { 
    label: "Work", 
    icon: "briefcase-outline", 
    color: COLORS.accentWarm,
    lightColor: "#FCF5EB",
    gradient: ["#F5E6D3", "#E3B777"],
  },
  health: { 
    label: "Health", 
    icon: "fitness-outline", 
    color: COLORS.sage,
    lightColor: "#EDF5F3",
    gradient: ["#E2EFEC", "#5D8B7E"],
  },
  learning: { 
    label: "Learning", 
    icon: "school-outline", 
    color: "#9B59B6",
    lightColor: "#F3E8F5",
    gradient: ["#E9D4F0", "#9B59B6"],
  },
  finance: { 
    label: "Finance", 
    icon: "cash-outline", 
    color: "#3498DB",
    lightColor: "#E8F0F9",
    gradient: ["#D6EAF8", "#3498DB"],
  },
  other: { 
    label: "Other", 
    icon: "ellipsis-horizontal-outline", 
    color: COLORS.textTertiary,
    lightColor: "#F5F5F5",
    gradient: ["#F0F0F0", "#95A5A6"],
  },
};

const PRIORITY_CONFIG = {
  high: {
    label: "High",
    icon: "alert-triangle",
    color: COLORS.accentBlush,
    lightColor: "#FFF0F0",
    gradient: ["#FFE4E1", "#FFB6C1"],
  },
  medium: {
    label: "Medium",
    icon: "remove",
    color: COLORS.accentWarm,
    lightColor: "#FFF9F0",
    gradient: ["#FFF4E5", "#FFE0B2"],
  },
  low: {
    label: "Low",
    icon: "arrow-down",
    color: COLORS.sage,
    lightColor: "#F1F8F1",
    gradient: ["#E8F5E9", "#C8E6C9"],
  },
};

const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'Once', icon: 'today-outline' },
  { value: 'daily', label: 'Daily', icon: 'sunny-outline' },
  { value: 'weekly', label: 'Weekly', icon: 'calendar-outline' },
  { value: 'monthly', label: 'Monthly', icon: 'calendar-number-outline' },
  { value: 'yearly', label: 'Yearly', icon: 'calendar-outline' },
];

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
   📝 FORM REDUCER - Clean and efficient
   ================================================================================ */

const initialState = {
  id: null,
  title: "",
  description: "",
  dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
  dueTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  category: "personal",
  priority: "medium",
  recurrence: { type: 'none', interval: 1 },
  enableNotifications: true,
  notificationTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 - 30 * 60000),
  customNotificationMessage: "",
  milestones: [],
  tags: [],
  isEditing: false,
  sharedWith: [],
};

function goalsReducer(state, action) {
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
    
    case 'ADD_MILESTONE':
      return {
        ...state,
        milestones: [
          ...state.milestones,
          {
            id: `temp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            title: action.payload.title,
            dueDate: action.payload.dueDate,
            completed: false,
            createdAt: new Date(),
          }
        ]
      };
    
    case 'TOGGLE_MILESTONE':
      return {
        ...state,
        milestones: state.milestones.map((m, idx) =>
          idx === action.index ? { ...m, completed: !m.completed } : m
        )
      };
    
    case 'REMOVE_MILESTONE':
      return {
        ...state,
        milestones: state.milestones.filter((_, idx) => idx !== action.index)
      };
    
    case 'ADD_TAG':
      if (state.tags.includes(action.payload)) return state;
      if (state.tags.length >= 5) return state;
      return {
        ...state,
        tags: [...state.tags, action.payload]
      };
    
    case 'REMOVE_TAG':
      return {
        ...state,
        tags: state.tags.filter(t => t !== action.payload)
      };
    
    case 'RESET':
      const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      return {
        ...initialState,
        dueDate: nextWeek,
        dueTime: nextWeek,
        notificationTime: new Date(nextWeek.getTime() - 30 * 60000),
      };
    
    case 'LOAD_GOAL':
      const goalDueDate = action.payload.dueDate ? new Date(action.payload.dueDate) : new Date();
      return {
        ...state,
        ...action.payload,
        isEditing: true,
        id: action.payload.id,
        title: action.payload.title || "",
        description: action.payload.description || "",
        dueDate: goalDueDate,
        dueTime: goalDueDate,
        category: action.payload.category || "personal",
        priority: action.payload.priority || "medium",
        recurrence: action.payload.recurrence || { type: 'none', interval: 1 },
        enableNotifications: action.payload.enableNotifications !== false,
        notificationTime: action.payload.notificationTime 
          ? new Date(action.payload.notificationTime)
          : new Date(goalDueDate.getTime() - 30 * 60000),
        customNotificationMessage: action.payload.customNotificationMessage || "",
        milestones: action.payload.milestones || [],
        tags: action.payload.tags || [],
        sharedWith: action.payload.sharedWith || [],
      };
    
    default:
      return state;
  }
}

/* ================================================================================
   📊 PROGRESS RING - Animated
   ================================================================================ */

const ProgressRing = ({ progress = 0, size = 60, strokeWidth = 4, showLabel = true }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (progress / 100) * circumference;
  
  let color = COLORS.sage;
  if (progress >= 100) color = COLORS.success;
  else if (progress >= 75) color = COLORS.accentWarm;
  else if (progress >= 50) color = COLORS.accentBlush;
  
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background Circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={COLORS.surfaceVariant}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress Circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90, ${size / 2}, ${size / 2})`}
        />
      </Svg>
      {showLabel && (
        <View style={{ position: 'absolute' }}>
          <Text style={{ fontSize: size * 0.2, fontWeight: '700', color }}>
            {Math.round(progress)}%
          </Text>
        </View>
      )}
    </View>
  );
};

/* ================================================================================
   🏷️ CATEGORY BADGE
   ================================================================================ */

const CategoryBadge = ({ category, size = 'small' }) => {
  const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.other;
  
  if (size === 'small') {
    return (
      <View style={[styles.categoryPill, { backgroundColor: config.lightColor }]}>
        <Ionicons name={config.icon} size={12} color={config.color} />
        <Text style={[styles.categoryPillText, { color: config.color }]}>
          {config.label}
        </Text>
      </View>
    );
  }
  
  return (
    <LinearGradient
      colors={config.gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.categoryBadgeLarge}
    >
      <Ionicons name={config.icon} size={16} color="white" />
      <Text style={styles.categoryBadgeLargeText}>{config.label}</Text>
    </LinearGradient>
  );
};

/* ================================================================================
   ⚡ PRIORITY BADGE
   ================================================================================ */

const PriorityBadge = ({ priority }) => {
  const config = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.medium;
  
  return (
    <View style={[styles.priorityBadge, { backgroundColor: config.lightColor }]}>
      <Ionicons name={config.icon} size={12} color={config.color} />
      <Text style={[styles.priorityBadgeText, { color: config.color }]}>
        {config.label}
      </Text>
    </View>
  );
};

/* ================================================================================
   🎯 GOAL CARD - Complete redesign with milestone hint
   ================================================================================ */

const GoalCard = ({ 
  goal, 
  onPress, 
  onEdit, 
  onDelete, 
  onShare, 
  onToggleNotification,
  onToggleMilestone,
  onAddMilestone,
  isExpanded,
  onExpand,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const expandAnim = useRef(new Animated.Value(isExpanded ? 1 : 0)).current;
  
  const category = CATEGORY_CONFIG[goal.category] || CATEGORY_CONFIG.other;
  const priority = PRIORITY_CONFIG[goal.priority] || PRIORITY_CONFIG.medium;
  
  const dueDate = new Date(goal.dueDate);
  const now = new Date();
  const daysUntil = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
  const isOverdue = daysUntil < 0 && goal.progress < 100;
  const isDueSoon = daysUntil >= 0 && daysUntil <= 3 && goal.progress < 100;
  const completedMilestones = goal.milestones?.filter(m => m.completed).length || 0;
  const totalMilestones = goal.milestones?.length || 0;
  
  useEffect(() => {
    Animated.timing(expandAnim, {
      toValue: isExpanded ? 1 : 0,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [isExpanded]);
  
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
    if (goal.progress === 100) return "Completed";
    if (isOverdue) return `${Math.abs(daysUntil)} days overdue`;
    if (daysUntil === 0) return "Today";
    if (daysUntil === 1) return "Tomorrow";
    return `${daysUntil} days left`;
  };
  
  const getDueColor = () => {
    if (goal.progress === 100) return COLORS.success;
    if (isOverdue) return COLORS.danger;
    if (isDueSoon) return COLORS.warning;
    return COLORS.textSecondary;
  };
  
  return (
    <Animated.View 
      style={[
        styles.goalCard,
        {
          transform: [{ scale: scaleAnim }],
          borderColor: isOverdue ? COLORS.danger + '40' : 
                      isDueSoon ? COLORS.warning + '40' : 
                      COLORS.cardBorder,
        }
      ]}
    >
      <BlurView intensity={90} tint="light" style={styles.goalCardBlur}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          onPress={() => onExpand(goal.id)}
          onLongPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            onEdit(goal);
          }}
          delayLongPress={500}
        >
          <View style={styles.goalCardHeader}>
            {/* Accent stripe */}
            <View style={[styles.goalAccent, { backgroundColor: category.color }]} />
            
            <View style={styles.goalContent}>
              {/* Top row */}
              <View style={styles.goalTopRow}>
                <View style={styles.goalTitleContainer}>
                  <Text style={styles.goalTitle} numberOfLines={1}>
                    {goal.title}
                  </Text>
                  <View style={styles.goalBadges}>
                    <PriorityBadge priority={goal.priority} />
                    <CategoryBadge category={goal.category} />
                  </View>
                </View>
                
                <ProgressRing progress={goal.progress} size={52} />
              </View>
              
              {/* Description */}
              {goal.description ? (
                <Text style={styles.goalDescription} numberOfLines={2}>
                  {goal.description}
                </Text>
              ) : null}
              
              {/* Meta row */}
              <View style={styles.goalMetaRow}>
                <View style={[styles.dueBadge, { backgroundColor: getDueColor() + '15' }]}>
                  <Ionicons 
                    name={goal.progress === 100 ? "checkmark-circle" : isOverdue ? "alert-circle" : "calendar-outline"} 
                    size={14} 
                    color={getDueColor()} 
                  />
                  <Text style={[styles.dueText, { color: getDueColor() }]}>
                    {getDueLabel()}
                  </Text>
                </View>
                
                {totalMilestones > 0 && (
                  <View style={styles.milestoneBadge}>
                    <Ionicons name="flag-outline" size={14} color={COLORS.textSecondary} />
                    <Text style={styles.milestoneBadgeText}>
                      {completedMilestones}/{totalMilestones}
                    </Text>
                  </View>
                )}
                
                {goal.enableNotifications && !goal.archived && goal.progress < 100 && (
                  <TouchableOpacity 
                    onPress={() => onToggleNotification(goal)}
                    style={styles.notificationBadge}
                  >
                    <Ionicons name="notifications" size={14} color={COLORS.info} />
                  </TouchableOpacity>
                )}
                
                {goal.sharedWith?.length > 0 && (
                  <View style={styles.sharedBadge}>
                    <Ionicons name="people" size={14} color={COLORS.accentBlush} />
                    <Text style={styles.sharedBadgeText}>{goal.sharedWith.length}</Text>
                  </View>
                )}
              </View>
              
              {/* Tags */}
              {goal.tags?.length > 0 && (
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  style={styles.tagsScroll}
                >
                  <View style={styles.tagsContainer}>
                    {goal.tags.map((tag, idx) => (
                      <View key={idx} style={styles.tagPill}>
                        <Text style={styles.tagText}>#{tag}</Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              )}
            </View>
          </View>
        </TouchableOpacity>
        
        {/* Expanded Content - Milestones */}
        <Animated.View 
          style={[
            styles.expandedContent,
            {
              maxHeight: expandAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 400],
              }),
              opacity: expandAnim,
            }
          ]}
        >
          <View style={styles.divider} />
          
          <View style={styles.milestonesHeader}>
            <Text style={styles.milestonesTitle}>Milestones</Text>
            {totalMilestones > 0 && (
              <Text style={styles.milestonesCount}>
                {completedMilestones}/{totalMilestones}
              </Text>
            )}
          </View>
          
          {goal.milestones?.length === 0 ? (
            <View style={styles.emptyMilestones}>
              <Ionicons name="flag-outline" size={32} color={COLORS.textTertiary} />
              <Text style={styles.emptyMilestonesText}>
                No milestones yet
              </Text>
              {goal.isOwner && (
                <>
                  <TouchableOpacity
                    style={styles.addMilestoneButton}
                    onPress={() => onAddMilestone(goal.id)}
                  >
                    <Ionicons name="add-circle" size={20} color={COLORS.sage} />
                    <Text style={styles.addMilestoneText}>Add first milestone</Text>
                  </TouchableOpacity>
                  {/* ✅ ADDED: Tap hint for milestone expansion */}
                  <View style={styles.tapHintContainer}>
                    <Ionicons name="chevron-down" size={14} color={COLORS.textTertiary} />
                    <Text style={styles.tapHintText}>
                      Tap card to add milestones
                    </Text>
                  </View>
                </>
              )}
              {!goal.isOwner && (
                <Text style={styles.noMilestonesHint}>
                  Owner hasn't added any milestones yet
                </Text>
              )}
            </View>
          ) : (
            <>
              <View style={styles.milestonesList}>
                {goal.milestones.map((milestone, idx) => (
                  <View key={milestone.id || idx} style={styles.milestoneItem}>
                    <TouchableOpacity
                      style={styles.milestoneCheckbox}
                      onPress={() => onToggleMilestone(goal.id, idx)}
                      disabled={!goal.isOwner}
                    >
                      <Ionicons
                        name={milestone.completed ? "checkmark-circle" : "ellipse-outline"}
                        size={20}
                        color={milestone.completed ? COLORS.success : COLORS.textTertiary}
                      />
                    </TouchableOpacity>
                    <View style={styles.milestoneContent}>
                      <Text style={[
                        styles.milestoneTitle,
                        milestone.completed && styles.milestoneTitleCompleted
                      ]}>
                        {milestone.title}
                      </Text>
                      {milestone.dueDate && (
                        <Text style={styles.milestoneDueDate}>
                          {new Date(milestone.dueDate).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric'
                          })}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
              
              {/* ✅ ADDED: Tap hint for adding more milestones */}
              {goal.isOwner && (
                <TouchableOpacity
                  style={styles.addMoreMilestoneButton}
                  onPress={() => onAddMilestone(goal.id)}
                >
                  <Ionicons name="add-circle-outline" size={18} color={COLORS.sage} />
                  <Text style={styles.addMoreMilestoneText}>Add milestone</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </Animated.View>
        
        {/* Action Buttons */}
        <View style={styles.goalActions}>
          {goal.isOwner && (
            <>
              <TouchableOpacity 
                onPress={() => onEdit(goal)} 
                style={styles.actionButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="create-outline" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
              
              <TouchableOpacity 
                onPress={() => onShare(goal)} 
                style={styles.actionButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="share-social-outline" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </>
          )}
          
          <TouchableOpacity 
            onPress={() => onDelete(goal)} 
            style={[styles.actionButton, styles.deleteButton]}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons 
              name={goal.isOwner ? "trash-outline" : "close-outline"} 
              size={20} 
              color={goal.isOwner ? COLORS.danger : COLORS.textSecondary} 
            />
          </TouchableOpacity>
        </View>
      </BlurView>
    </Animated.View>
  );
};

/* ================================================================================
   📊 STATS CARD - Analytics overview (Now only in analytics view)
   ================================================================================ */

const StatsCard = ({ stats }) => {
  return (
    <View style={styles.statsCard}>
      <LinearGradient
        colors={[COLORS.gradientStart, COLORS.gradientEnd]}
        style={StyleSheet.absoluteFill}
      />
      
      <View style={styles.statsGrid}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{stats.total}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        
        <View style={styles.statDivider} />
        
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: COLORS.success }]}>{stats.completed}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
        
        <View style={styles.statDivider} />
        
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: COLORS.accentWarm }]}>{stats.active}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        
        <View style={styles.statDivider} />
        
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: COLORS.danger }]}>{stats.overdue}</Text>
          <Text style={styles.statLabel}>Overdue</Text>
        </View>
      </View>
      
      <View style={styles.progressBarContainer}>
        <View style={styles.progressBarBackground}>
          <View 
            style={[
              styles.progressBarFill,
              { width: `${stats.completionRate}%` }
            ]} 
          />
        </View>
        <Text style={styles.progressBarText}>
          {stats.completionRate}% completion rate
        </Text>
      </View>
    </View>
  );
};

/* ================================================================================
   📅 MINI CALENDAR - Goal due dates
   ================================================================================ */

const MiniCalendar = ({ goals, selectedDate, onSelectDate }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  const daysInMonth = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth() + 1,
    0
  ).getDate();
  
  const firstDay = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth(),
    1
  ).getDay();
  
  const monthName = currentMonth.toLocaleString('default', { 
    month: 'long', 
    year: 'numeric' 
  });

  const goalDates = useMemo(() => {
    const dates = {};
    goals.forEach(goal => {
      if (goal.dueDate && goal.progress < 100) {
        const date = new Date(goal.dueDate);
        const key = date.toDateString();
        dates[key] = (dates[key] || 0) + 1;
      }
    });
    return dates;
  }, [goals]);

  return (
    <View style={styles.calendarContainer}>
      <View style={styles.calendarHeader}>
        <TouchableOpacity
          onPress={() => {
            setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          style={styles.calendarNav}
        >
          <Ionicons name="chevron-back" size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>
        
        <Text style={styles.calendarMonth}>{monthName}</Text>
        
        <TouchableOpacity
          onPress={() => {
            setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          style={styles.calendarNav}
        >
          <Ionicons name="chevron-forward" size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>
      </View>
      
      <View style={styles.weekdayRow}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
          <Text key={i} style={styles.weekdayText}>{day}</Text>
        ))}
      </View>
      
      <View style={styles.daysGrid}>
        {Array.from({ length: firstDay }).map((_, i) => (
          <View key={`empty-${i}`} style={styles.dayCell} />
        ))}
        
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
          const isSelected = selectedDate?.toDateString() === date.toDateString();
          const isToday = date.toDateString() === new Date().toDateString();
          const goalCount = goalDates[date.toDateString()] || 0;
          
          return (
            <TouchableOpacity
              key={day}
              style={[
                styles.dayCell,
                isSelected && styles.dayCellSelected,
                isToday && styles.dayCellToday,
              ]}
              onPress={() => {
                onSelectDate(date);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <Text
                style={[
                  styles.dayText,
                  isSelected && styles.dayTextSelected,
                  isToday && styles.dayTextToday,
                ]}
              >
                {day}
              </Text>
              {goalCount > 0 && (
                <View style={styles.dayDot}>
                  <Text style={styles.dayDotText}>{goalCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

/* ================================================================================
   🎯 QUICK ADD BAR - Intelligent input
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
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      });
      setText("");
    }
  };

  return (
    <Animated.View style={[styles.quickAddContainer, { transform: [{ scale: scaleAnim }] }]}>
      <BlurView intensity={90} tint="light" style={styles.quickAddBlur}>
        <View style={styles.quickAddInner}>
          <Ionicons name="flag-outline" size={24} color={COLORS.accentBlush} />
          
          <TextInput
            style={styles.quickAddInput}
            placeholder="Quick add goal..."
            placeholderTextColor={COLORS.textTertiary}
            value={text}
            onChangeText={setText}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onSubmitEditing={handleSubmit}
            returnKeyType="done"
          />
          
          {text.length > 0 && (
            <TouchableOpacity onPress={handleSubmit} style={styles.quickAddSubmit}>
              <Ionicons name="arrow-forward-circle" size={28} color={COLORS.accentBlush} />
            </TouchableOpacity>
          )}
        </View>
      </BlurView>
    </Animated.View>
  );
};

/* ================================================================================
   🏆 MAIN GOALS SCREEN - Complete redesign
   ================================================================================ */

export default function GoalsScreen() {
  const navigation = useNavigation();
  const { user, appId } = useApp();
  
  // State
  const [goals, setGoals] = useState([]);
  const [filteredGoals, setFilteredGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [isShareModalVisible, setIsShareModalVisible] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedGoalId, setExpandedGoalId] = useState(null);
  const [notificationPermission, setNotificationPermission] = useState(false);
  const [viewMode, setViewMode] = useState("list"); // list, calendar, analytics
  
  // Share modal state
  const [shareEmail, setShareEmail] = useState("");
  const [shareCollaborators, setShareCollaborators] = useState([]);
  const [shareEmailError, setShareEmailError] = useState("");
  
  // Form state
  const [formState, formDispatch] = useReducer(goalsReducer, initialState);
  
  // Picker states
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showNotifPicker, setShowNotifPicker] = useState(false);
  const [notifPickerMode, setNotifPickerMode] = useState('date');
  const [tempNotifDate, setTempNotifDate] = useState(new Date());
  const [showMilestoneInput, setShowMilestoneInput] = useState(false);
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneDueDate, setMilestoneDueDate] = useState(new Date());
  const [showMilestoneDatePicker, setShowMilestoneDatePicker] = useState(false);
  
  // Tag input
  const [tagInput, setTagInput] = useState("");
  
  // Stats
  const [stats, setStats] = useState({
    total: 0,
    completed: 0,
    active: 0,
    overdue: 0,
    completionRate: 0,
  });

  const isMounted = useRef(true);
  const scrollY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  /* ================================================================================
     🔔 NOTIFICATION SETUP
     ================================================================================ */

  useEffect(() => {
    const setupNotifications = async () => {
      const hasPermission = await hasNotificationPermissions();
      setNotificationPermission(hasPermission);
      
      if (!hasPermission) {
        const granted = await requestNotificationPermissions();
        setNotificationPermission(granted);
      }
    };
    
    setupNotifications();
  }, []);

  /* ================================================================================
     🔥 FIRESTORE LISTENER
     ================================================================================ */

  useEffect(() => {
    if (!user) {
      setGoals([]);
      setLoading(false);
      return;
    }

    const goalsRef = collection(db, "goals");
    const q = query(goalsRef, where("userId", "==", user.uid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const goalList = snapshot.docs.map(doc => {
          const data = doc.data();
          const milestones = Array.isArray(data.milestones) ? data.milestones : [];
          const completed = milestones.filter(m => m.completed).length;
          const progress = milestones.length ? Math.round((completed / milestones.length) * 100) : 0;
          
          return {
            id: doc.id,
            ...data,
            dueDate: data.dueDate?.toDate?.() || data.dueDate || new Date(),
            notificationTime: data.notificationTime?.toDate?.() || data.notificationTime,
            createdAt: data.createdAt?.toDate?.() || data.createdAt,
            updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
            milestones,
            progress,
            daysRemaining: Math.ceil((new Date(data.dueDate || 0) - new Date()) / (1000 * 60 * 60 * 24)),
            isOwner: true,
          };
        });
        
        goalList.sort((a, b) => {
          if (a.progress === 100 && b.progress < 100) return 1;
          if (b.progress === 100 && a.progress < 100) return -1;
          return new Date(a.dueDate || 0) - new Date(b.dueDate || 0);
        });

        if (isMounted.current) {
          setGoals(goalList);
          setLoading(false);
          
          // Calculate stats
          const total = goalList.length;
          const completed = goalList.filter(g => g.progress === 100).length;
          const active = goalList.filter(g => g.progress > 0 && g.progress < 100).length;
          const overdue = goalList.filter(g => g.daysRemaining < 0 && g.progress < 100).length;
          const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
          
          setStats({ total, completed, active, overdue, completionRate });
        }
      },
      (error) => {
        console.error("Goals listener error:", error);
        if (isMounted.current) {
          setLoading(false);
        }
      }
    );

    return () => unsubscribe();
  }, [user]);

  /* ================================================================================
     🔍 FILTERING & SEARCH
     ================================================================================ */

  useEffect(() => {
    let filtered = [...goals];
    
    if (selectedDate) {
      filtered = filtered.filter(g => {
        const date = new Date(g.dueDate);
        return date.toDateString() === selectedDate.toDateString();
      });
    }
    
    if (selectedCategory !== "all") {
      filtered = filtered.filter(g => g.category === selectedCategory);
    }
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(g => 
        g.title?.toLowerCase().includes(query) ||
        g.description?.toLowerCase().includes(query) ||
        g.tags?.some(tag => tag.toLowerCase().includes(query))
      );
    }
    
    setFilteredGoals(filtered);
  }, [goals, selectedDate, selectedCategory, searchQuery]);

  /* ================================================================================
     🎯 GOAL OPERATIONS
     ================================================================================ */

  const showMessage = useCallback((message) => {
    Alert.alert(message);
  }, []);

  const scheduleNotifications = useCallback(async (goal) => {
    if (!goal.enableNotifications || goal.progress === 100 || goal.archived) return;
    if (!notificationPermission) return;
    
    try {
      if (goal.notificationIds?.length > 0) {
        await cancelGoalNotifications(goal.id);
      }
      
      const notificationTime = goal.notificationTime || 
        new Date(new Date(goal.dueDate).getTime() - 30 * 60000);
      
      if (notificationTime < new Date()) {
        return;
      }

      const notificationIds = await scheduleGoalNotifications({
        ...goal,
        notificationTime,
      });
      
      if (notificationIds?.ids?.length > 0) {
        await updateDoc(doc(db, "goals", goal.id), {
          notificationIds: notificationIds.ids,
          notificationTime,
        });
      }
    } catch (error) {
      console.error("Failed to schedule goal notifications:", error);
    }
  }, [notificationPermission]);

  const handleQuickAdd = async ({ title, dueDate }) => {
    if (!user) return;
    
    try {
      const docRef = await addDoc(collection(db, "goals"), {
        title,
        description: "",
        dueDate,
        userId: user.uid,
        progress: 0,
        milestones: [],
        tags: [],
        category: "personal",
        priority: "medium",
        recurrence: { type: 'none', interval: 1 },
        enableNotifications: true,
        notificationTime: new Date(dueDate.getTime() - 30 * 60000),
        // ✅ ADDED: Notification flags for cloud function
        notificationSent: false,
        notificationSentAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      
      showMessage("✨ Goal created!");
    } catch (error) {
      console.error("Quick add error:", error);
      Alert.alert("Error", "Failed to create goal");
    }
  };

  const handleSaveGoal = async () => {
    if (!formState.title.trim()) {
      Alert.alert("Title Required", "Please enter a goal title");
      return;
    }
    
    if (!user) return;
    
    setLoading(true);
    
    try {
      const dueDateTime = new Date(
        formState.dueDate.getFullYear(),
        formState.dueDate.getMonth(),
        formState.dueDate.getDate(),
        formState.dueTime.getHours(),
        formState.dueTime.getMinutes()
      );

      const goalData = {
        title: formState.title.trim(),
        description: formState.description.trim(),
        dueDate: dueDateTime,
        category: formState.category,
        priority: formState.priority,
        recurrence: formState.recurrence,
        milestones: formState.milestones,
        tags: formState.tags,
        enableNotifications: formState.enableNotifications,
        notificationTime: formState.enableNotifications ? formState.notificationTime : null,
        customNotificationMessage: formState.customNotificationMessage.trim(),
        updatedAt: serverTimestamp(),
      };

      if (formState.isEditing && formState.id) {
        await updateDoc(doc(db, "goals", formState.id), goalData);
        
        if (formState.enableNotifications) {
          await scheduleNotifications({
            ...formState,
            ...goalData,
            id: formState.id,
            dueDate: dueDateTime,
          });
        } else {
          await cancelGoalNotifications(formState.id);
          await updateDoc(doc(db, "goals", formState.id), { 
            notificationIds: [],
            notificationSent: true, // Mark as sent to prevent cloud function from processing
          });
        }
        
        showMessage("✅ Goal updated");
      } else {
        goalData.userId = user.uid;
        goalData.progress = 0;
        // ✅ ADDED: Notification flags for cloud function
        goalData.notificationSent = false;
        goalData.notificationSentAt = null;
        goalData.createdAt = serverTimestamp();
        
        const docRef = await addDoc(collection(db, "goals"), goalData);
        showMessage("🎯 Goal created!");
        
        if (formState.enableNotifications) {
          await scheduleNotifications({
            ...goalData,
            id: docRef.id,
            dueDate: dueDateTime,
          });
        }
      }
      
      setIsFormVisible(false);
      formDispatch({ type: 'RESET' });
    } catch (error) {
      console.error("Save goal error:", error);
      Alert.alert("Error", "Failed to save goal");
    } finally {
      setLoading(false);
    }
  };

  const handleEditGoal = (goal) => {
    formDispatch({ type: 'LOAD_GOAL', payload: goal });
    setIsFormVisible(true);
  };

  const handleDeleteGoal = async (goal) => {
    Alert.alert(
      goal.isOwner ? "Delete Goal" : "Remove Goal",
      goal.isOwner 
        ? `Are you sure you want to delete "${goal.title}"?`
        : `Remove "${goal.title}" from your goals?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: goal.isOwner ? "Delete" : "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await cancelGoalNotifications(goal.id);
              await deleteDoc(doc(db, "goals", goal.id));
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              showMessage(goal.isOwner ? "🗑️ Goal deleted" : "✅ Goal removed");
            } catch (error) {
              console.error("Delete error:", error);
              Alert.alert("Error", "Failed to delete goal");
            }
          },
        },
      ]
    );
  };

  const handleToggleNotification = async (goal) => {
    if (!goal.isOwner) {
      showMessage("Only the owner can modify notifications");
      return;
    }

    try {
      const newValue = !goal.enableNotifications;
      
      await updateDoc(doc(db, "goals", goal.id), {
        enableNotifications: newValue,
        // ✅ ADDED: Reset notification flags when toggling
        notificationSent: false,
        notificationSentAt: null,
      });
      
      if (newValue) {
        await scheduleNotifications({ ...goal, enableNotifications: true });
        showMessage("🔔 Notifications enabled");
      } else {
        await cancelGoalNotifications(goal.id);
        await updateDoc(doc(db, "goals", goal.id), { 
          notificationIds: [],
          notificationSent: true, // Mark as sent to prevent cloud function from processing
        });
        showMessage("🔕 Notifications disabled");
      }
    } catch (error) {
      console.error("Toggle notification error:", error);
      Alert.alert("Error", "Failed to update notifications");
    }
  };

  const handleToggleMilestone = async (goalId, milestoneIndex) => {
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;
    
    try {
      const updatedMilestones = [...goal.milestones];
      updatedMilestones[milestoneIndex].completed = !updatedMilestones[milestoneIndex].completed;
      
      const completedCount = updatedMilestones.filter(m => m.completed).length;
      const progress = Math.round((completedCount / updatedMilestones.length) * 100);
      
      await updateDoc(doc(db, "goals", goalId), {
        milestones: updatedMilestones,
      });
      
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      
      if (updatedMilestones[milestoneIndex].completed) {
        if (progress === 100) {
          showMessage("🎉 Goal completed!");
          // ✅ ADDED: Mark notification as sent when goal completed
          await updateDoc(doc(db, "goals", goalId), {
            enableNotifications: false,
            notificationSent: true,
          });
        } else {
          showMessage("✨ Milestone completed");
        }
      }
    } catch (error) {
      console.error("Toggle milestone error:", error);
      Alert.alert("Error", "Failed to update milestone");
    }
  };

  const handleAddMilestone = async (goalId) => {
    if (!milestoneTitle.trim()) {
      Alert.alert("Error", "Please enter a milestone title");
      return;
    }
    
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;
    
    try {
      const newMilestone = {
        id: `ms_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        title: milestoneTitle.trim(),
        dueDate: milestoneDueDate,
        completed: false,
        createdAt: new Date(),
      };
      
      const updatedMilestones = [...(goal.milestones || []), newMilestone];
      
      await updateDoc(doc(db, "goals", goalId), {
        milestones: updatedMilestones,
      });
      
      setMilestoneTitle("");
      setMilestoneDueDate(new Date());
      setShowMilestoneInput(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      showMessage("✅ Milestone added");
    } catch (error) {
      console.error("Add milestone error:", error);
      Alert.alert("Error", "Failed to add milestone");
    }
  };

  /* ================================================================================
     👥 SHARE MODAL
     ================================================================================ */

  const openShareModal = async (goal) => {
    setSelectedGoal(goal);
    setShareCollaborators(goal.sharedWith || []);
    setShareEmail("");
    setShareEmailError("");
    setIsShareModalVisible(true);
  };

  const resolveEmailToUid = async (email) => {
    try {
      const normalized = email.trim().toLowerCase();
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("email", "==", normalized));
      const snap = await getDocs(q);
      
      if (snap.empty) return null;
      
      const userDoc = snap.docs[0];
      return {
        uid: userDoc.id,
        email: userDoc.data().email,
        displayName: userDoc.data().displayName || userDoc.data().email.split("@")[0],
      };
    } catch (error) {
      console.error("Error resolving email:", error);
      return null;
    }
  };

  const handleAddCollaborator = async () => {
    if (!shareEmail.trim()) return;
    
    const user = await resolveEmailToUid(shareEmail);
    
    if (!user) {
      setShareEmailError("User not found");
      return;
    }
    
    if (user.uid === selectedGoal.userId) {
      setShareEmailError("You are the owner");
      return;
    }
    
    if (shareCollaborators.some(c => c.uid === user.uid)) {
      setShareEmailError("Already added");
      return;
    }
    
    setShareCollaborators([...shareCollaborators, user]);
    setShareEmail("");
    setShareEmailError("");
  };

  const handleRemoveCollaborator = (uid) => {
    setShareCollaborators(shareCollaborators.filter(c => c.uid !== uid));
  };

  const handleShareGoal = async () => {
    if (!selectedGoal) return;
    
    setLoading(true);
    try {
      const collaboratorUids = shareCollaborators.map(c => c.uid);
      
      await updateDoc(doc(db, "goals", selectedGoal.id), {
        sharedWith: collaboratorUids,
        updatedAt: serverTimestamp(),
      });
      
      for (const collab of shareCollaborators) {
        await sendNotification(
          [collab.uid],
          `${user.displayName || user.email} shared "${selectedGoal.title}" with you`,
          {
            goalId: selectedGoal.id,
            goalTitle: selectedGoal.title,
            type: NOTIFICATION_TYPES.GOAL_INVITE,
            screen: "Goals",
          },
          {
            pushTitle: "🎯 Goal Shared",
            sendPush: notificationPermission,
          }
        );
      }
      
      showMessage("✅ Goal shared successfully");
      setIsShareModalVisible(false);
    } catch (error) {
      console.error("Share error:", error);
      Alert.alert("Error", "Failed to share goal");
    } finally {
      setLoading(false);
    }
  };

  /* ================================================================================
     📅 ADAPTIVE DATE/TIME PICKER HANDLERS
     ================================================================================ */

  const handleCustomNotificationPress = () => {
    setTempNotifDate(formState.notificationTime || new Date());
    setNotifPickerMode('date');
    setShowNotifPicker(true);
  };

  const handleNotifPickerChange = (event, selectedDate) => {
    if (Platform.OS === 'android') {
      if (event.type === 'dismissed' || !selectedDate) {
        setShowNotifPicker(false);
        return;
      }
    }

    if (notifPickerMode === 'date') {
      setTempNotifDate(selectedDate || tempNotifDate);
      
      if (Platform.OS === 'android') {
        setNotifPickerMode('time');
      } else {
        setNotifPickerMode('time');
      }
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
  };

  /* ================================================================================
     🎨 RENDER
     ================================================================================ */

  const headerHeight = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [Platform.OS === 'ios' ? 140 : 120, 100],
    extrapolate: 'clamp',
  });

  const headerTitleSize = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [32, 24],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.screen}>
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
                Goals
              </Animated.Text>
              <Text style={styles.headerSubtitle}>
                {stats.active} active • {stats.overdue} overdue
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
                  style={[styles.viewModeButton, viewMode === 'calendar' && styles.viewModeButtonActive]}
                  onPress={() => setViewMode('calendar')}
                >
                  <Ionicons 
                    name="calendar" 
                    size={20} 
                    color={viewMode === 'calendar' ? COLORS.accentBlush : COLORS.textTertiary} 
                  />
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.viewModeButton, viewMode === 'analytics' && styles.viewModeButtonActive]}
                  onPress={() => setViewMode('analytics')}
                >
                  <Ionicons 
                    name="stats-chart" 
                    size={20} 
                    color={viewMode === 'analytics' ? COLORS.accentBlush : COLORS.textTertiary} 
                  />
                </TouchableOpacity>
              </View>
              
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
            </View>
          </View>
          
          {/* Search Bar */}
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={18} color={COLORS.textTertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search goals..."
              placeholderTextColor={COLORS.textTertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color={COLORS.textTertiary} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </Animated.View>
      
      {/* Category Filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryScroll}
        contentContainerStyle={styles.categoryContainer}
      >
        <TouchableOpacity
          style={[
            styles.categoryFilter,
            selectedCategory === 'all' && styles.categoryFilterActive,
          ]}
          onPress={() => {
            setSelectedCategory('all');
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
        >
          <Text
            style={[
              styles.categoryFilterText,
              selectedCategory === 'all' && styles.categoryFilterTextActive,
            ]}
          >
            All Goals
          </Text>
        </TouchableOpacity>
        
        {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
          <TouchableOpacity
            key={key}
            style={[
              styles.categoryFilter,
              { backgroundColor: selectedCategory === key ? config.color : COLORS.card },
              selectedCategory === key && styles.categoryFilterActive,
            ]}
            onPress={() => {
              setSelectedCategory(key);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
          >
            <Ionicons
              name={config.icon}
              size={16}
              color={selectedCategory === key ? 'white' : config.color}
            />
            <Text
              style={[
                styles.categoryFilterText,
                { color: selectedCategory === key ? 'white' : config.color },
              ]}
            >
              {config.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      
      {/* Calendar View */}
      {viewMode === 'calendar' && (
        <View style={styles.calendarView}>
          <MiniCalendar
            goals={goals}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
          
          {selectedDate && (
            <View style={styles.selectedDateHeader}>
              <Text style={styles.selectedDateTitle}>
                {selectedDate.toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </Text>
              <TouchableOpacity onPress={() => setSelectedDate(null)}>
                <Ionicons name="close-circle" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
      
      {/* Analytics View - StatsCard only appears here */}
      {viewMode === 'analytics' && (
        <ScrollView style={styles.analyticsView} showsVerticalScrollIndicator={false}>
          <StatsCard stats={stats} />
          
          <View style={styles.analyticsCard}>
            <Text style={styles.analyticsTitle}>Progress Overview</Text>
            <View style={styles.analyticsGrid}>
              <View style={styles.analyticsItem}>
                <ProgressRing progress={stats.completionRate} size={80} />
                <Text style={styles.analyticsLabel}>Completion Rate</Text>
              </View>
              
              <View style={styles.analyticsStats}>
                <View style={styles.analyticsStatRow}>
                  <View style={[styles.analyticsDot, { backgroundColor: COLORS.sage }]} />
                  <Text style={styles.analyticsStatLabel}>Completed</Text>
                  <Text style={styles.analyticsStatValue}>{stats.completed}</Text>
                </View>
                <View style={styles.analyticsStatRow}>
                  <View style={[styles.analyticsDot, { backgroundColor: COLORS.accentWarm }]} />
                  <Text style={styles.analyticsStatLabel}>Active</Text>
                  <Text style={styles.analyticsStatValue}>{stats.active}</Text>
                </View>
                <View style={styles.analyticsStatRow}>
                  <View style={[styles.analyticsDot, { backgroundColor: COLORS.danger }]} />
                  <Text style={styles.analyticsStatLabel}>Overdue</Text>
                  <Text style={styles.analyticsStatValue}>{stats.overdue}</Text>
                </View>
              </View>
            </View>
          </View>
          
          <View style={styles.analyticsCard}>
            <Text style={styles.analyticsTitle}>Category Breakdown</Text>
            {Object.entries(CATEGORY_CONFIG).map(([key, config]) => {
              const categoryGoals = goals.filter(g => g.category === key);
              const total = categoryGoals.length;
              const completed = categoryGoals.filter(g => g.progress === 100).length;
              const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
              
              if (total === 0) return null;
              
              return (
                <View key={key} style={styles.categoryStatRow}>
                  <View style={styles.categoryStatHeader}>
                    <Ionicons name={config.icon} size={16} color={config.color} />
                    <Text style={[styles.categoryStatName, { color: config.color }]}>
                      {config.label}
                    </Text>
                    <Text style={styles.categoryStatCount}>
                      {completed}/{total}
                    </Text>
                  </View>
                  <View style={styles.categoryStatBar}>
                    <View 
                      style={[
                        styles.categoryStatFill,
                        { width: `${percentage}%`, backgroundColor: config.color }
                      ]} 
                    />
                  </View>
                </View>
              );
            })}
          </View>
          
          <TouchableOpacity
            style={styles.backToListButton}
            onPress={() => setViewMode('list')}
          >
            <Text style={styles.backToListText}>Back to List</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
      
      {/* Main Content - Goals List */}
      {viewMode !== 'analytics' && (
        <Animated.ScrollView
          style={styles.goalsList}
          contentContainerStyle={styles.goalsListContent}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: false }
          )}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.accentBlush} />
              <Text style={styles.loadingText}>Loading your goals...</Text>
            </View>
          ) : filteredGoals.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="flag-outline" size={64} color={COLORS.textTertiary} />
              <Text style={styles.emptyTitle}>No goals found</Text>
              <Text style={styles.emptyText}>
                {searchQuery 
                  ? "Try a different search" 
                  : selectedDate 
                    ? "No goals scheduled for this day"
                    : selectedCategory !== 'all'
                      ? `No ${CATEGORY_CONFIG[selectedCategory]?.label.toLowerCase()} goals`
                      : "Create your first goal to get started"}
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
                  <Text style={styles.emptyButtonText}>Create Goal</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          ) : (
            filteredGoals.map(goal => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onPress={() => {}}
                onEdit={handleEditGoal}
                onDelete={handleDeleteGoal}
                onShare={openShareModal}
                onToggleNotification={handleToggleNotification}
                onToggleMilestone={handleToggleMilestone}
                onAddMilestone={(goalId) => {
                  setShowMilestoneInput(true);
                  setSelectedGoal(goals.find(g => g.id === goalId));
                }}
                isExpanded={expandedGoalId === goal.id}
                onExpand={(id) => setExpandedGoalId(expandedGoalId === id ? null : id)}
              />
            ))
          )}
          
          {/* Add some bottom padding */}
          <View style={{ height: 100 }} />
        </Animated.ScrollView>
      )}
      
      {/* Quick Add Bar - Only in list view */}
      {viewMode === 'list' && !loading && (
        <QuickAddBar onAdd={handleQuickAdd} />
      )}
      
      {/* Milestone Input Modal */}
      <Modal
        visible={showMilestoneInput}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMilestoneInput(false)}
      >
        <View style={styles.modalOverlay}>
          <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.milestoneModal}>
            <View style={styles.milestoneModalHeader}>
              <Text style={styles.milestoneModalTitle}>Add Milestone</Text>
              <TouchableOpacity onPress={() => setShowMilestoneInput(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.modalLabel}>Title</Text>
            <View style={styles.modalInputContainer}>
              <TextInput
                style={styles.modalInput}
                placeholder="Enter milestone title"
                placeholderTextColor={COLORS.textTertiary}
                value={milestoneTitle}
                onChangeText={setMilestoneTitle}
                autoFocus
              />
            </View>
            
            <Text style={styles.modalLabel}>Due Date (Optional)</Text>
            <TouchableOpacity
              style={styles.modalDateButton}
              onPress={() => setShowMilestoneDatePicker(true)}
            >
              <Ionicons name="calendar-outline" size={20} color={COLORS.sage} />
              <Text style={styles.modalDateText}>
                {milestoneDueDate.toLocaleDateString('en-US', { 
                  month: 'short', 
                  day: 'numeric', 
                  year: 'numeric' 
                })}
              </Text>
            </TouchableOpacity>
            
            {showMilestoneDatePicker && (
              <DateTimePicker
                value={milestoneDueDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(event, date) => {
                  setShowMilestoneDatePicker(false);
                  if (date) setMilestoneDueDate(date);
                }}
              />
            )}
            
            <View style={styles.milestoneModalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => setShowMilestoneInput(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, styles.modalSaveButton]}
                onPress={() => {
                  handleAddMilestone(selectedGoal?.id);
                  setShowMilestoneInput(false);
                }}
              >
                <Text style={styles.modalSaveText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      
      {/* Share Modal */}
      <Modal
        visible={isShareModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsShareModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
          <View style={styles.shareModal}>
            <View style={styles.shareModalHeader}>
              <Text style={styles.shareModalTitle}>Share Goal</Text>
              <TouchableOpacity onPress={() => setIsShareModalVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.shareGoalTitle}>{selectedGoal?.title}</Text>
            
            <Text style={styles.modalLabel}>Add Collaborator</Text>
            <View style={styles.shareInputRow}>
              <View style={styles.shareInputContainer}>
                <Ionicons name="mail-outline" size={20} color={COLORS.textSecondary} />
                <TextInput
                  style={styles.shareInput}
                  placeholder="friend@example.com"
                  placeholderTextColor={COLORS.textTertiary}
                  value={shareEmail}
                  onChangeText={setShareEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
              <TouchableOpacity
                style={styles.shareAddButton}
                onPress={handleAddCollaborator}
              >
                <Ionicons name="add" size={24} color="white" />
              </TouchableOpacity>
            </View>
            
            {shareEmailError ? (
              <Text style={styles.shareErrorText}>{shareEmailError}</Text>
            ) : null}
            
            {shareCollaborators.length > 0 && (
              <View style={styles.collaboratorsList}>
                <Text style={styles.collaboratorsTitle}>Collaborators</Text>
                {shareCollaborators.map(collab => (
                  <View key={collab.uid} style={styles.collaboratorItem}>
                    <View style={styles.collaboratorInfo}>
                      <View style={styles.collaboratorAvatar}>
                        <Text style={styles.collaboratorInitial}>
                          {collab.displayName?.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View>
                        <Text style={styles.collaboratorName}>{collab.displayName}</Text>
                        <Text style={styles.collaboratorEmail}>{collab.email}</Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleRemoveCollaborator(collab.uid)}
                    >
                      <Ionicons name="close-circle" size={20} color={COLORS.danger} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
            
            <TouchableOpacity
              style={styles.shareConfirmButton}
              onPress={handleShareGoal}
              disabled={loading || shareCollaborators.length === 0}
            >
              <LinearGradient
                colors={[COLORS.accentBlush, COLORS.accentWarm]}
                style={styles.shareConfirmGradient}
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    <Ionicons name="share-social" size={20} color="white" />
                    <Text style={styles.shareConfirmText}>
                      Share with {shareCollaborators.length} {shareCollaborators.length === 1 ? 'person' : 'people'}
                    </Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      
      {/* Goal Form Modal - Complete redesign */}
      <Modal
        visible={isFormVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsFormVisible(false)}
      >
        <View style={styles.formModalOverlay}>
          <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
          
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.formModalKeyboard}
          >
            <View style={styles.formModalContainer}>
              <View style={styles.formModalHeader}>
                <Text style={styles.formModalTitle}>
                  {formState.isEditing ? "Edit Goal" : "Create New Goal"}
                </Text>
                <TouchableOpacity
                  onPress={() => { setIsFormVisible(false); formDispatch({ type: 'RESET' }); }}
                  style={styles.formModalClose}
                >
                  <Ionicons name="close" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
              </View>
              
              <ScrollView 
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.formModalScroll}
              >
                {/* Title */}
                <View style={styles.formSection}>
                  <View style={styles.formLabelRow}>
                    <Text style={styles.formLabel}>Title <Text style={styles.requiredStar}>*</Text></Text>
                    <Text style={styles.formCounter}>{formState.title.length}/120</Text>
                  </View>
                  <View style={styles.formInputContainer}>
                    <Ionicons name="flag-outline" size={20} color={COLORS.sage} />
                    <TextInput
                      style={styles.formInput}
                      placeholder="e.g., Run a marathon, Learn Spanish"
                      placeholderTextColor={COLORS.textTertiary}
                      value={formState.title}
                      onChangeText={(text) => 
                        formDispatch({ type: 'SET_FIELD', field: 'title', value: text })
                      }
                      maxLength={120}
                    />
                  </View>
                </View>
                
                {/* Description */}
                <View style={styles.formSection}>
                  <View style={styles.formLabelRow}>
                    <Text style={styles.formLabel}>Description</Text>
                    <Text style={styles.formCounter}>{formState.description.length}/500</Text>
                  </View>
                  <View style={[styles.formInputContainer, styles.formTextArea]}>
                    <Ionicons name="document-text-outline" size={20} color={COLORS.sage} />
                    <TextInput
                      style={[styles.formInput, { minHeight: 80 }]}
                      placeholder="What's your goal about?"
                      placeholderTextColor={COLORS.textTertiary}
                      value={formState.description}
                      onChangeText={(text) => 
                        formDispatch({ type: 'SET_FIELD', field: 'description', value: text })
                      }
                      multiline
                      maxLength={500}
                    />
                  </View>
                </View>
                
                {/* Due Date & Time */}
                <View style={styles.formSection}>
                  <Text style={styles.formLabel}>Due Date & Time</Text>
                  <View style={styles.formDateTimeRow}>
                    <TouchableOpacity
                      style={styles.formDateTimeButton}
                      onPress={() => setShowDatePicker(true)}
                    >
                      <Ionicons name="calendar-outline" size={20} color={COLORS.sage} />
                      <Text style={styles.formDateTimeText}>
                        {formState.dueDate.toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric' 
                        })}
                      </Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      style={styles.formDateTimeButton}
                      onPress={() => setShowTimePicker(true)}
                    >
                      <Ionicons name="time-outline" size={20} color={COLORS.sage} />
                      <Text style={styles.formDateTimeText}>
                        {formState.dueTime.toLocaleTimeString([], { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
                
                {/* Date Picker */}
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
                
                {/* Time Picker */}
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
                
                {/* Category & Priority */}
                <View style={styles.formRow}>
                  <View style={[styles.formSection, { flex: 1, marginRight: 8 }]}>
                    <Text style={styles.formLabel}>Category</Text>
                    <ScrollView 
                      horizontal 
                      showsHorizontalScrollIndicator={false}
                      style={{ flexGrow: 0 }}
                    >
                      <View style={styles.formChipGroup}>
                        {Object.entries(CATEGORY_CONFIG).map(([key, config]) => (
                          <TouchableOpacity
                            key={key}
                            style={[
                              styles.formChip,
                              { backgroundColor: config.lightColor },
                              formState.category === key && { 
                                backgroundColor: config.color,
                                borderWidth: 0,
                              },
                            ]}
                            onPress={() => 
                              formDispatch({ type: 'SET_FIELD', field: 'category', value: key })
                            }
                          >
                            <Ionicons
                              name={config.icon}
                              size={16}
                              color={formState.category === key ? 'white' : config.color}
                            />
                            <Text
                              style={[
                                styles.formChipText,
                                { color: formState.category === key ? 'white' : config.color },
                              ]}
                            >
                              {config.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  </View>
                  
                  <View style={[styles.formSection, { flex: 1, marginLeft: 8 }]}>
                    <Text style={styles.formLabel}>Priority</Text>
                    <View style={styles.formChipGroup}>
                      {Object.entries(PRIORITY_CONFIG).map(([key, config]) => (
                        <TouchableOpacity
                          key={key}
                          style={[
                            styles.formChip,
                            { backgroundColor: config.lightColor },
                            formState.priority === key && { 
                              backgroundColor: config.color,
                              borderWidth: 0,
                            },
                          ]}
                          onPress={() => 
                            formDispatch({ type: 'SET_FIELD', field: 'priority', value: key })
                          }
                        >
                          <Ionicons
                            name={config.icon}
                            size={16}
                            color={formState.priority === key ? 'white' : config.color}
                          />
                          <Text
                            style={[
                              styles.formChipText,
                              { color: formState.priority === key ? 'white' : config.color },
                            ]}
                          >
                            {config.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>
                
                {/* Milestones */}
                <View style={styles.formSection}>
                  <Text style={styles.formLabel}>Milestones</Text>
                  
                  {formState.milestones.length > 0 && (
                    <View style={styles.formMilestonesList}>
                      {formState.milestones.map((milestone, index) => (
                        <View key={milestone.id || index} style={styles.formMilestoneItem}>
                          <TouchableOpacity
                            onPress={() => formDispatch({ type: 'TOGGLE_MILESTONE', index })}
                            style={styles.formMilestoneCheck}
                          >
                            <Ionicons
                              name={milestone.completed ? "checkmark-circle" : "ellipse-outline"}
                              size={20}
                              color={milestone.completed ? COLORS.success : COLORS.textSecondary}
                            />
                          </TouchableOpacity>
                          <View style={styles.formMilestoneContent}>
                            <Text style={[
                              styles.formMilestoneTitle,
                              milestone.completed && styles.formMilestoneTitleCompleted
                            ]}>
                              {milestone.title}
                            </Text>
                            {milestone.dueDate && (
                              <Text style={styles.formMilestoneDate}>
                                {new Date(milestone.dueDate).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric'
                                })}
                              </Text>
                            )}
                          </View>
                          <TouchableOpacity
                            onPress={() => formDispatch({ type: 'REMOVE_MILESTONE', index })}
                          >
                            <Ionicons name="close-circle" size={20} color={COLORS.danger} />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                  
                  <View style={styles.formAddMilestoneRow}>
                    <View style={styles.formAddMilestoneInput}>
                      <Ionicons name="add-circle-outline" size={20} color={COLORS.sage} />
                      <TextInput
                        style={styles.formAddMilestoneText}
                        placeholder="Add a milestone..."
                        placeholderTextColor={COLORS.textTertiary}
                        value={milestoneTitle}
                        onChangeText={setMilestoneTitle}
                        onSubmitEditing={() => {
                          if (milestoneTitle.trim()) {
                            formDispatch({
                              type: 'ADD_MILESTONE',
                              payload: { title: milestoneTitle.trim(), dueDate: null }
                            });
                            setMilestoneTitle("");
                          }
                        }}
                      />
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.formAddMilestoneButton,
                        !milestoneTitle.trim() && styles.formAddMilestoneButtonDisabled
                      ]}
                      disabled={!milestoneTitle.trim()}
                      onPress={() => {
                        formDispatch({
                          type: 'ADD_MILESTONE',
                          payload: { title: milestoneTitle.trim(), dueDate: null }
                        });
                        setMilestoneTitle("");
                      }}
                    >
                      <Ionicons name="add" size={20} color="white" />
                    </TouchableOpacity>
                  </View>
                </View>
                
                {/* Tags */}
                <View style={styles.formSection}>
                  <Text style={styles.formLabel}>Tags</Text>
                  
                  {formState.tags.length > 0 && (
                    <View style={styles.formTagsContainer}>
                      {formState.tags.map((tag, idx) => (
                        <View key={idx} style={styles.formTag}>
                          <Text style={styles.formTagText}>#{tag}</Text>
                          <TouchableOpacity
                            onPress={() => formDispatch({ type: 'REMOVE_TAG', payload: tag })}
                          >
                            <Ionicons name="close" size={16} color={COLORS.sage} />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                  
                  <View style={styles.formAddTagRow}>
                    <View style={styles.formAddTagInput}>
                      <Ionicons name="pricetag-outline" size={20} color={COLORS.sage} />
                      <TextInput
                        style={styles.formAddTagText}
                        placeholder="Add a tag..."
                        placeholderTextColor={COLORS.textTertiary}
                        value={tagInput}
                        onChangeText={setTagInput}
                        onSubmitEditing={() => {
                          if (tagInput.trim() && formState.tags.length < 5) {
                            formDispatch({ type: 'ADD_TAG', payload: tagInput.trim().toLowerCase() });
                            setTagInput("");
                          }
                        }}
                      />
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.formAddTagButton,
                        (formState.tags.length >= 5 || !tagInput.trim()) && styles.formAddTagButtonDisabled
                      ]}
                      disabled={formState.tags.length >= 5 || !tagInput.trim()}
                      onPress={() => {
                        if (tagInput.trim() && formState.tags.length < 5) {
                          formDispatch({ type: 'ADD_TAG', payload: tagInput.trim().toLowerCase() });
                          setTagInput("");
                        }
                      }}
                    >
                      <Ionicons name="add" size={20} color="white" />
                    </TouchableOpacity>
                  </View>
                  {formState.tags.length >= 5 && (
                    <Text style={styles.formHelperText}>Maximum 5 tags allowed</Text>
                  )}
                </View>
                
                {/* Notifications */}
                <View style={styles.formSection}>
                  <View style={styles.formSwitchRow}>
                    <View style={styles.formSwitchLabel}>
                      <Ionicons name="notifications-outline" size={20} color={COLORS.sage} />
                      <Text style={[styles.formLabel, { marginBottom: 0, marginLeft: 8 }]}>
                        Reminder
                      </Text>
                    </View>
                    <Switch
                      value={formState.enableNotifications}
                      onValueChange={(value) => {
                        formDispatch({ type: 'SET_FIELD', field: 'enableNotifications', value });
                        if (value && !formState.notificationTime) {
                          formDispatch({ 
                            type: 'SET_NOTIFICATION_TIME', 
                            payload: new Date(formState.dueDate.getTime() - 30 * 60000)
                          });
                        }
                      }}
                      trackColor={{ false: '#E0E0E0', true: COLORS.sage + '80' }}
                      thumbColor={formState.enableNotifications ? COLORS.sage : '#f4f3f4'}
                    />
                  </View>
                  
                  {formState.enableNotifications && (
                    <>
                      <Text style={[styles.formLabel, { marginTop: 16 }]}>Remind me</Text>
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
                                    payload: new Date(dueTime + preset.minutes * 60000)
                                  });
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                }
                              }}
                            >
                              <Text style={[
                                styles.formNotifPresetText,
                                isActive && styles.formNotifPresetTextActive
                              ]}>
                                {preset.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      
                      {/* Custom Notification Picker */}
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
                      
                      {/* Display selected notification time */}
                      {formState.notificationTime && (
                        <View style={styles.formNotifTimeDisplay}>
                          <Ionicons name="time" size={16} color={COLORS.sage} />
                          <Text style={styles.formNotifTimeText}>
                            {formState.notificationTime.toLocaleDateString('en-US', { 
                              month: 'short', 
                              day: 'numeric' 
                            })} at {formState.notificationTime.toLocaleTimeString([], { 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </Text>
                          <TouchableOpacity
                            onPress={handleCustomNotificationPress}
                            style={{ padding: 4 }}
                          >
                            <Ionicons name="create-outline" size={16} color={COLORS.sage} />
                          </TouchableOpacity>
                        </View>
                      )}
                      
                      {/* Custom Message */}
                      <View style={{ marginTop: 16 }}>
                        <Text style={styles.formLabel}>Custom Message (Optional)</Text>
                        <View style={styles.formInputContainer}>
                          <Ionicons name="chatbubble-outline" size={20} color={COLORS.sage} />
                          <TextInput
                            style={styles.formInput}
                            placeholder="Add a personal reminder message..."
                            placeholderTextColor={COLORS.textTertiary}
                            value={formState.customNotificationMessage}
                            onChangeText={(text) => 
                              formDispatch({ 
                                type: 'SET_FIELD', 
                                field: 'customNotificationMessage', 
                                value: text 
                              })
                            }
                          />
                        </View>
                      </View>
                    </>
                  )}
                </View>
                
                {/* Recurrence */}
                <View style={styles.formSection}>
                  <Text style={styles.formLabel}>Recurrence</Text>
                  <View style={styles.formRecurrenceGrid}>
                    {RECURRENCE_OPTIONS.map((option) => (
                      <TouchableOpacity
                        key={option.value}
                        style={[
                          styles.formRecurrenceCard,
                          formState.recurrence.type === option.value && styles.formRecurrenceCardActive
                        ]}
                        onPress={() => {
                          formDispatch({ 
                            type: 'SET_FIELD', 
                            field: 'recurrence', 
                            value: { ...formState.recurrence, type: option.value }
                          });
                        }}
                      >
                        <Ionicons
                          name={option.icon}
                          size={20}
                          color={formState.recurrence.type === option.value ? COLORS.recurring : COLORS.textSecondary}
                        />
                        <Text style={[
                          styles.formRecurrenceText,
                          formState.recurrence.type === option.value && styles.formRecurrenceTextActive
                        ]}>
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  
                  {formState.recurrence.type !== 'none' && (
                    <View style={styles.formIntervalContainer}>
                      <Text style={styles.formIntervalLabel}>Repeat every</Text>
                      <View style={styles.formIntervalInputWrapper}>
                        <TextInput
                          style={styles.formIntervalInput}
                          value={formState.recurrence.interval.toString()}
                          onChangeText={(text) => {
                            const num = parseInt(text) || 1;
                            formDispatch({
                              type: 'SET_FIELD',
                              field: 'recurrence',
                              value: { ...formState.recurrence, interval: num > 0 ? num : 1 }
                            });
                          }}
                          keyboardType="numeric"
                          maxLength={2}
                        />
                        <Text style={styles.formIntervalUnit}>
                          {formState.recurrence.type === 'daily' ? 'days' :
                           formState.recurrence.type === 'weekly' ? 'weeks' :
                           formState.recurrence.type === 'monthly' ? 'months' : 'years'}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              </ScrollView>
              
              {/* Save Button */}
              <TouchableOpacity
                style={styles.formSaveButton}
                onPress={handleSaveGoal}
                disabled={loading}
              >
                <LinearGradient
                  colors={[COLORS.accentBlush, COLORS.accentWarm]}
                  style={styles.formSaveGradient}
                >
                  {loading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <>
                      <Ionicons 
                        name={formState.isEditing ? "checkmark-done" : "flag"} 
                        size={20} 
                        color="white" 
                      />
                      <Text style={styles.formSaveText}>
                        {formState.isEditing ? "Update Goal" : "Create Goal"}
                      </Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

/* ================================================================================
   🎨 STYLES - Complete redesign matching Planner
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
  
  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  
  // Category Filters
  categoryScroll: {
    maxHeight: 60,
    marginTop: 16,
  },
  categoryContainer: {
    paddingHorizontal: 20,
    gap: 12,
  },
  categoryFilter: {
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
  categoryFilterActive: {
    borderWidth: 0,
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  categoryFilterText: {
    fontSize: 14,
    fontWeight: '600',
  },
  categoryFilterTextActive: {
    color: 'white',
  },
  
  // Stats Card (Now only in analytics)
  statsCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    overflow: 'hidden',
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: COLORS.cardBorder,
  },
  progressBarContainer: {
    marginTop: 8,
  },
  progressBarBackground: {
    height: 6,
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.sage,
    borderRadius: 3,
  },
  progressBarText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 8,
    textAlign: 'center',
    fontWeight: '600',
  },
  
  // Goal Card
  goalCard: {
    marginBottom: 12,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 4,
  },
  goalCardBlur: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  goalCardHeader: {
    flexDirection: 'row',
  },
  goalAccent: {
    width: 6,
    height: '100%',
  },
  goalContent: {
    flex: 1,
    padding: 16,
  },
  goalTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  goalTitleContainer: {
    flex: 1,
    marginRight: 12,
  },
  goalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 6,
  },
  goalBadges: {
    flexDirection: 'row',
    gap: 8,
  },
  goalDescription: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginTop: 8,
  },
  goalMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 12,
  },
  dueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 4,
  },
  dueText: {
    fontSize: 12,
    fontWeight: '600',
  },
  milestoneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  milestoneBadgeText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  notificationBadge: {
    backgroundColor: COLORS.info + '20',
    padding: 5,
    borderRadius: 12,
  },
  sharedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.accentBlush + '20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  sharedBadgeText: {
    fontSize: 11,
    color: COLORS.accentBlush,
    fontWeight: '700',
  },
  
  // Tags
  tagsScroll: {
    marginTop: 12,
  },
  tagsContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 20,
  },
  tagPill: {
    backgroundColor: COLORS.accentBlush + '15',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tagText: {
    fontSize: 11,
    color: COLORS.accentBlush,
    fontWeight: '600',
  },
  
  // Priority & Category Badges
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  priorityBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  categoryPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  categoryBadgeLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  categoryBadgeLargeText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 14,
  },
  
  // Expanded Content
  expandedContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.cardBorder,
    marginVertical: 12,
  },
  milestonesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  milestonesTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  milestonesCount: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  emptyMilestones: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 12,
  },
  emptyMilestonesText: {
    fontSize: 13,
    color: COLORS.textTertiary,
    marginTop: 8,
    marginBottom: 12,
  },
  addMilestoneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.card,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addMilestoneText: {
    fontSize: 13,
    color: COLORS.sage,
    fontWeight: '600',
  },
  // ✅ NEW: Tap hint styles
  tapHintContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: COLORS.sage + '10',
    borderRadius: 16,
  },
  tapHintText: {
    fontSize: 11,
    color: COLORS.sage,
    marginLeft: 4,
    fontWeight: '500',
    fontStyle: 'italic',
  },
  noMilestonesHint: {
    fontSize: 12,
    color: COLORS.textTertiary,
    fontStyle: 'italic',
    marginTop: 8,
  },
  addMoreMilestoneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 8,
    gap: 6,
    backgroundColor: COLORS.sage + '10',
    borderRadius: 16,
  },
  addMoreMilestoneText: {
    fontSize: 12,
    color: COLORS.sage,
    fontWeight: '600',
  },
  milestonesList: {
    gap: 8,
  },
  milestoneItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  milestoneCheckbox: {
    padding: 2,
  },
  milestoneContent: {
    flex: 1,
  },
  milestoneTitle: {
    fontSize: 14,
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  milestoneTitleCompleted: {
    textDecorationLine: 'line-through',
    color: COLORS.textTertiary,
  },
  milestoneDueDate: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  
  // Goal Actions
  goalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.cardBorder,
  },
  actionButton: {
    padding: 6,
  },
  deleteButton: {
    marginLeft: 'auto',
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
  },
  
  // Calendar View
  calendarView: {
    flex: 1,
    paddingTop: 20,
  },
  calendarContainer: {
    backgroundColor: COLORS.card,
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 16,
    borderRadius: 24,
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 4,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  calendarNav: {
    padding: 8,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceVariant,
  },
  calendarMonth: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekdayText: {
    width: (width - 72) / 7,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: (width - 72) / 7,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 22,
    position: 'relative',
  },
  dayCellSelected: {
    backgroundColor: COLORS.accentBlush,
  },
  dayCellToday: {
    borderWidth: 2,
    borderColor: COLORS.sage,
  },
  dayText: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.textPrimary,
  },
  dayTextSelected: {
    color: 'white',
  },
  dayTextToday: {
    fontWeight: '700',
  },
  dayDot: {
    position: 'absolute',
    bottom: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.sage,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayDotText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '700',
  },
  selectedDateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 16,
  },
  selectedDateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  
  // Analytics View
  analyticsView: {
    flex: 1,
    padding: 20,
  },
  analyticsCard: {
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 4,
  },
  analyticsTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 20,
  },
  analyticsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  analyticsItem: {
    alignItems: 'center',
  },
  analyticsLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 8,
    fontWeight: '600',
  },
  analyticsStats: {
    flex: 1,
    marginLeft: 20,
  },
  analyticsStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  analyticsDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  analyticsStatLabel: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  analyticsStatValue: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  categoryStatRow: {
    marginBottom: 16,
  },
  categoryStatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  categoryStatName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  categoryStatCount: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  categoryStatBar: {
    height: 8,
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 4,
    overflow: 'hidden',
  },
  categoryStatFill: {
    height: '100%',
    borderRadius: 4,
  },
  backToListButton: {
    backgroundColor: COLORS.card,
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 40,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  backToListText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.sage,
  },
  
  // Goals List
  goalsList: {
    flex: 1,
  },
  goalsListContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  
  // Loading
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  
  // Empty State
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
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
  
  // Modal Overlay
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // Milestone Modal
  milestoneModal: {
    width: width * 0.9,
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 24,
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 10,
  },
  milestoneModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  milestoneModalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  modalInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 14 : 8,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    marginBottom: 16,
  },
  modalInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  modalDateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    marginBottom: 16,
  },
  modalDateText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  milestoneModalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
  },
  modalCancelButton: {
    backgroundColor: COLORS.surfaceVariant,
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  modalSaveButton: {
    backgroundColor: COLORS.sage,
  },
  modalSaveText: {
    fontSize: 16,
    fontWeight: '700',
    color: 'white',
  },
  
  // Share Modal
  shareModal: {
    width: width * 0.9,
    backgroundColor: COLORS.card,
    borderRadius: 24,
    padding: 24,
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 10,
  },
  shareModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  shareModalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  shareGoalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.sage,
    marginBottom: 20,
    padding: 12,
    backgroundColor: COLORS.sage + '10',
    borderRadius: 12,
  },
  shareInputRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  shareInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 14 : 8,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  shareInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  shareAddButton: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: COLORS.sage,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareErrorText: {
    fontSize: 13,
    color: COLORS.danger,
    marginBottom: 16,
  },
  collaboratorsList: {
    marginTop: 20,
    marginBottom: 24,
  },
  collaboratorsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  collaboratorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
  },
  collaboratorInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  collaboratorAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.accentBlush,
    justifyContent: 'center',
    alignItems: 'center',
  },
  collaboratorInitial: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
  },
  collaboratorName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  collaboratorEmail: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  shareConfirmButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  shareConfirmGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  shareConfirmText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  
  // Form Modal
  formModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  formModalKeyboard: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  formModalContainer: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    maxHeight: height * 0.9,
  },
  formModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  formModalTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  formModalClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
  },
  formModalScroll: {
    paddingBottom: 20,
  },
  
  // Form Elements
  formSection: {
    marginBottom: 24,
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
    paddingVertical: Platform.OS === 'ios' ? 14 : 8,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  formTextArea: {
    alignItems: 'flex-start',
  },
  formInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  formDateTimeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  formDateTimeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  formDateTimeText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  formRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  formChipGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  formChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  formChipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  
  // Form Milestones
  formMilestonesList: {
    marginBottom: 12,
  },
  formMilestoneItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
  },
  formMilestoneCheck: {
    marginRight: 12,
  },
  formMilestoneContent: {
    flex: 1,
  },
  formMilestoneTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  formMilestoneTitleCompleted: {
    textDecorationLine: 'line-through',
    color: COLORS.textTertiary,
  },
  formMilestoneDate: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  formAddMilestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  formAddMilestoneInput: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 14 : 8,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  formAddMilestoneText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  formAddMilestoneButton: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: COLORS.sage,
    justifyContent: 'center',
    alignItems: 'center',
  },
  formAddMilestoneButtonDisabled: {
    backgroundColor: COLORS.textTertiary,
    opacity: 0.5,
  },
  
  // Form Tags
  formTagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  formTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.sage + '15',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  formTagText: {
    fontSize: 13,
    color: COLORS.sage,
    fontWeight: '600',
  },
  formAddTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  formAddTagInput: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 14 : 8,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  formAddTagText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  formAddTagButton: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: COLORS.sage,
    justifyContent: 'center',
    alignItems: 'center',
  },
  formAddTagButtonDisabled: {
    backgroundColor: COLORS.textTertiary,
    opacity: 0.5,
  },
  formHelperText: {
    fontSize: 12,
    color: COLORS.textTertiary,
    marginTop: 8,
  },
  
  // Form Notifications
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
    marginTop: 8,
    marginBottom: 16,
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
    marginBottom: 16,
    gap: 8,
  },
  formNotifTimeText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.sage,
    fontWeight: '600',
  },
  
  // Form Recurrence
  formRecurrenceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
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
    backgroundColor: COLORS.recurring + '15',
    borderColor: COLORS.recurring,
  },
  formRecurrenceText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  formRecurrenceTextActive: {
    color: COLORS.recurring,
  },
  formIntervalContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 16,
    padding: 16,
  },
  formIntervalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginRight: 12,
  },
  formIntervalInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  formIntervalInput: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 10,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
    width: 60,
    marginRight: 8,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  formIntervalUnit: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  
  // Form Save Button
  formSaveButton: {
    marginTop: 24,
    borderRadius: 16,
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
    fontSize: 18,
    fontWeight: '800',
  },
});