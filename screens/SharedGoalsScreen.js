// screens/SharedGoalsScreen.js
// 🎯 COMPLETE REDESIGN - PRODUCTION READY
// ✅ Added notificationSent flag for cloud function integration
// ✅ Added proper notification scheduling/cleanup
// ✅ Click on saved goal → Opens detail modal (NOT edit)
// ✅ Removed add milestone from main card (now only in progress tab)
// ✅ Glass-morphism design matching all screens
// ✅ Dynamic date pickers (iOS/Android adaptive)
// ✅ Push token registration for notifications
// ✅ FIX: Added missing COLORS.error
// ✅ FIX: Firestore field unified to "participants"
// ✅ FIX: Single atomic write in handleAddProgress
// ✅ FIX: try/catch on handleAddMilestone, handleToggleMilestone, handleEditGoal, handleAddComment
// ✅ FIX: maxLength on QuickAddBar input
// ✅ FIX: Email format validation before Firestore query
// ✅ FIX: Delete before notify in handleDeleteGoal

import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import NetInfo from "@react-native-community/netinfo";
import { BlurView } from 'expo-blur';
import * as Haptics from "expo-haptics";
import { LinearGradient } from 'expo-linear-gradient';

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { Circle, Svg } from "react-native-svg";
import { useApp } from "../context/AppContext";
import { supabase } from "../supabaseConfig";
import {
  configureNotificationHandler,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  NOTIFICATION_TYPES,
  registerAndSaveExpoPushToken,
  requestNotificationPermissions,
  sendNotification,
  setupNotificationListener,
  setupNotificationReceivedHandler,
  setupNotificationResponseHandler
} from "../utils/notifications";

const { width, height } = Dimensions.get('window');

/* ================================================================================
   🎨 COLORS - Matching Planner/Goals/Notes/Journal
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
  placeholder: "#C7B5B0",
  
  // ✅ FIX: error was missing — used by PRIORITIES.high and PRIORITIES.urgent
  error: "#FF4444",

  // Shared Goals specific
  shared: "#9B59B6",
  sharedLight: "#F3E8F5",
  sharedGradient: ["#9B59B6", "#D8A39D"],
};

const CATEGORIES = {
  health: { label: 'Health', icon: 'fitness-outline', color: COLORS.sage, lightColor: "#EDF5F3" },
  work: { label: 'Work', icon: 'briefcase-outline', color: COLORS.accentWarm, lightColor: "#FCF5EB" },
  education: { label: 'Education', icon: 'school-outline', color: COLORS.warning, lightColor: "#FFF9F0" },
  personal: { label: 'Personal', icon: 'person-outline', color: COLORS.accentBlush, lightColor: "#FCF1EF" },
  financial: { label: 'Financial', icon: 'cash-outline', color: "#3498DB", lightColor: "#E8F0F9" },
  social: { label: 'Social', icon: 'people-outline', color: COLORS.shared, lightColor: "#F3E8F5" },
  other: { label: 'Other', icon: 'ellipsis-horizontal-outline', color: COLORS.textTertiary, lightColor: "#F5F5F5" }
};

const PRIORITIES = {
  low: { color: COLORS.sage, label: 'Low', icon: 'arrow-down', lightColor: "#F1F8F1" },
  medium: { color: COLORS.warning, label: 'Medium', icon: 'remove', lightColor: "#FFF9F0" },
  high: { color: COLORS.error, label: 'High', icon: 'arrow-up', lightColor: "#FFF0F0" },
  urgent: { color: COLORS.error, label: 'Urgent', icon: 'warning', lightColor: "#FFF0F0" }
};

const TABS = [
  { id: 'overview', label: 'Overview', icon: 'information-circle-outline' },
  { id: 'progress', label: 'Progress', icon: 'trending-up-outline' },
  { id: 'discussion', label: 'Discussion', icon: 'chatbubbles-outline' }
];


/* ================================================================================
   📝 HELPER FUNCTIONS
   ================================================================================ */

const formatDate = (date) => {
  if (!date) return 'No deadline';
  const d = date.seconds ? new Date(date.seconds * 1000) : new Date(date);
  return d.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  });
};

const formatRelativeTime = (timestamp) => {
  if (!timestamp) return '';
  
  let date;
  if (timestamp.seconds) {
    date = new Date(timestamp.seconds * 1000);
  } else if (timestamp instanceof Date) {
    date = timestamp;
  } else if (typeof timestamp === 'string') {
    date = new Date(timestamp);
  } else {
    return '';
  }

  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric' 
  });
};

const getDaysRemaining = (dueDate) => {
  if (!dueDate) return null;
  const due = dueDate.seconds ? new Date(dueDate.seconds * 1000) : new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffTime = due - today;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const computeProgress = (goal) => {
  if (!goal) return 0;
  
  if (goal.target_value && goal.target_value > 0) {
    const current = goal.current_value || 0;
    const progress = (current / goal.target_value) * 100;
    return Math.min(Math.round(progress * 10) / 10, 100);
  }
  
  const milestones = goal.milestones || [];
  if (!milestones.length) return 0;
  
  const completedMilestones = milestones.filter(m => m && m.completed).length;
  return Math.round((completedMilestones / milestones.length) * 100);
};

/* ================================================================================
   🔔 NOTIFICATION HELPER - Bulletproof filtering
   ================================================================================ */

const sendNotificationToOthers = async (userUid, participantUids, message, data, options = {}) => {
  try {
    console.log('========================================');
    console.log('📤 [NOTIFY] Sending notification to others');
    console.log('📤 [NOTIFY] Current user:', userUid);
    console.log('📤 [NOTIFY] Original participants:', participantUids);
    
    if (!sendNotification || typeof sendNotification !== 'function') {
      console.error("❌ [NOTIFY] sendNotification function not available");
      return false;
    }
    
    if (!userUid || typeof userUid !== 'string') {
      console.error("❌ [NOTIFY] Invalid or missing user ID");
      return false;
    }

    const otherParticipants = (participantUids || [])
      .filter(uid => uid)
      .filter(uid => typeof uid === 'string')
      .filter(uid => uid.trim().length > 0)
      .filter(uid => uid !== userUid)
      .filter((uid, index, self) => self.indexOf(uid) === index);
    
    console.log('📤 [NOTIFY] After filtering:', otherParticipants);
    
    if (otherParticipants.length === 0) {
      console.log('⏭️ [NOTIFY] No other participants to notify');
      return true;
    }

    console.log(`📤 [NOTIFY] Sending to ${otherParticipants.length} user(s)`);
    
    const notificationOptions = {
      type: options.type || NOTIFICATION_TYPES.GENERAL,
      priority: options.priority || "normal",
      pushTitle: options.pushTitle || 'Shared Goal Update',
      pushBody: options.pushBody || message,
      sendPush: options.sendPush !== false,
      sendLocalPush: false,
      senderId: userUid,
      senderName: options.senderName || 'Someone',
    };
    
    const success = await sendNotification(
      otherParticipants,
      message,
      {
        ...data,
        senderId: userUid,
        senderName: options.senderName || 'Someone',
      },
      notificationOptions
    );
    
    if (success) {
      console.log(`✅ [NOTIFY] Successfully sent notifications to ${otherParticipants.length} users`);
    }
    
    console.log('========================================');
    return success;
    
  } catch (error) {
    console.error("❌ [NOTIFY] Critical error:", error);
    console.log('========================================');
    return false;
  }
};

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
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={COLORS.surfaceVariant}
          strokeWidth={strokeWidth}
          fill="none"
        />
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

const CategoryBadge = ({ category }) => {
  const config = CATEGORIES[category] || CATEGORIES.other;
  return (
    <View style={[styles.categoryPill, { backgroundColor: config.lightColor }]}>
      <Ionicons name={config.icon} size={12} color={config.color} />
      <Text style={[styles.categoryPillText, { color: config.color }]}>
        {config.label}
      </Text>
    </View>
  );
};

/* ================================================================================
   ⚡ PRIORITY BADGE
   ================================================================================ */

const PriorityBadge = ({ priority }) => {
  const config = PRIORITIES[priority] || PRIORITIES.medium;
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
   👥 USER AVATAR
   ================================================================================ */

const UserAvatar = React.memo(({ user, size = 28 }) => {
  if (user?.photoURL) {
    return (
      <Image 
        source={{ uri: user?.photoURL }} 
        style={[
          styles.avatar,
          { width: size, height: size, borderRadius: size / 2 }
        ]}
      />
    );
  }
  
  return (
    <View style={[
      styles.avatar, 
      { 
        width: size, 
        height: size, 
        borderRadius: size / 2, 
        backgroundColor: COLORS.shared,
        alignItems: 'center',
        justifyContent: 'center'
      }
    ]}>
      <Text style={{ color: "#fff", fontWeight: "700", fontSize: size * 0.4 }}>
        {(user?.displayName || user?.email || "U").charAt(0).toUpperCase()}
      </Text>
    </View>
  );
});

/* ================================================================================
   👥 COLLABORATOR AVATARS INLINE
   ================================================================================ */

const CollaboratorAvatars = React.memo(({ collaborators, max = 3, size = 28 }) => {
  const arr = collaborators || [];
  const show = arr.slice(0, max);
  const remaining = Math.max(0, arr.length - max);
  
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {show.map((p, i) => (
        <View key={p.uid || i} style={{ marginLeft: i === 0 ? 0 : -8 }}>
          <UserAvatar user={p} size={size} />
        </View>
      ))}
      {remaining > 0 && (
        <View style={[
          styles.avatar, 
          { 
            marginLeft: -8, 
            backgroundColor: COLORS.sharedLight,
            width: size,
            height: size,
            borderRadius: size / 2,
            alignItems: 'center',
            justifyContent: 'center'
          }
        ]}>
          <Text style={{ color: COLORS.shared, fontSize: size * 0.3, fontWeight: '700' }}>
            +{remaining}
          </Text>
        </View>
      )}
    </View>
  );
});

/* ================================================================================
   🎯 SHARED GOAL CARD - REMOVED add milestone section
   ================================================================================ */

const SharedGoalCard = ({ 
  goal, 
  onPress, 
  onEdit, 
  onDelete, 
  onAddProgress,
  onToggleMilestone,
  isExpanded,
  onExpand,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const expandAnim = useRef(new Animated.Value(isExpanded ? 1 : 0)).current;
  
  const category = CATEGORIES[goal.category] || CATEGORIES.other;
  const priority = PRIORITIES[goal.priority] || PRIORITIES.medium;
  
  const dueDate = new Date(goal.due_date);
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

  const [progressValue, setProgressValue] = useState("");
  
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
          onPress={() => onPress(goal)} // ✅ Opens detail modal, NOT edit
          onLongPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            onEdit(goal);
          }}
          delayLongPress={500}
        >
          <View style={styles.goalCardHeader}>
            <View style={[styles.goalAccent, { backgroundColor: COLORS.shared }]} />
            
            <View style={styles.goalContent}>
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
              
              {goal.description ? (
                <Text style={styles.goalDescription} numberOfLines={2}>
                  {goal.description}
                </Text>
              ) : null}
              
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
              </View>
              
              {goal.participant_details?.length > 0 && (
                <View style={styles.collaboratorRow}>
                  <CollaboratorAvatars collaborators={goal.participant_details} max={4} size={28} />
                  <Text style={styles.collaboratorText}>
                    {goal.participant_details.length} {goal.participant_details.length === 1 ? 'member' : 'members'}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </TouchableOpacity>
        
        {/* ✅ REMOVED: Add milestone section from expanded card */}
        <Animated.View 
          style={[
            styles.expandedContent,
            {
              maxHeight: expandAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 200],
              }),
              opacity: expandAnim,
            }
          ]}
        >
          <View style={styles.divider} />
          
          {/* Quick Progress Update */}
          <View style={styles.expandedSection}>
            <View style={styles.progressInputRow}>
              <TextInput
                style={styles.progressInput}
                placeholder="Add progress..."
                placeholderTextColor={COLORS.placeholder}
                value={progressValue}
                onChangeText={setProgressValue}
                keyboardType="numeric"
              />
              <TouchableOpacity
                style={styles.progressButton}
                onPress={() => {
                  const value = parseInt(progressValue);
                  if (value > 0) {
                    onAddProgress(goal.id, value);
                    setProgressValue("");
                  }
                }}
              >
                <LinearGradient
                  colors={[COLORS.shared, COLORS.accentBlush]}
                  style={styles.progressButtonGradient}
                >
                  <Ionicons name="add" size={18} color="white" />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
          
          {/* Milestones Summary */}
          {totalMilestones > 0 && (
            <View style={styles.expandedSection}>
              <View style={styles.milestonesHeader}>
                <Text style={styles.milestonesTitle}>Milestones</Text>
                <Text style={styles.milestonesCount}>
                  {completedMilestones}/{totalMilestones}
                </Text>
              </View>
              <View style={styles.milestoneBar}>
                <View 
                  style={[
                    styles.milestoneBarFill,
                    { width: `${(completedMilestones / totalMilestones) * 100}%` }
                  ]} 
                />
              </View>
              <TouchableOpacity 
                style={styles.viewAllMilestonesButton}
                onPress={() => onPress(goal)}
              >
                <Text style={styles.viewAllMilestonesText}>View all in details</Text>
                <Ionicons name="arrow-forward" size={14} color={COLORS.shared} />
              </TouchableOpacity>
            </View>
          )}
          
          {totalMilestones === 0 && (
            <View style={styles.expandedSection}>
              <View style={styles.emptyMilestones}>
                <Ionicons name="flag-outline" size={24} color={COLORS.textTertiary} />
                <Text style={styles.emptyMilestonesText}>
                  No milestones yet
                </Text>
                <TouchableOpacity 
                  style={styles.addMilestoneHintButton}
                  onPress={() => onPress(goal)}
                >
                  <Text style={styles.addMilestoneHintText}>Add in details</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </Animated.View>
        
        <View style={styles.goalActions}>
          {goal.isOwner && (
            <TouchableOpacity 
              onPress={() => onEdit(goal)} 
              style={styles.actionButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="create-outline" size={20} color={COLORS.textSecondary} />
            </TouchableOpacity>
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
   📱 NOTIFICATION CENTER
   ================================================================================ */

const NotificationCenter = React.memo(() => {
  const { user } = useApp();
  const [notifications, setNotifications] = useState([]);
  const [notificationVisible, setNotificationVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    
    const unsubscribe = setupNotificationListener(user.id, (receivedNotifications) => {
      setNotifications(receivedNotifications || []);
    });
    
    return () => {
      if (unsubscribe && typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [user]);

  const markAsRead = async (notificationId) => {
    if (!user?.uid || !notificationId) return;
    try {
      await markNotificationAsRead(user.id, notificationId);
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  const markAllAsRead = async () => {
    if (!user?.uid) return;
    try {
      setLoading(true);
      await markAllNotificationsAsRead(user.id);
    } catch (error) {
      console.error("Error marking all as read:", error);
    } finally {
      setLoading(false);
    }
  };

  const unreadCount = useMemo(() => 
    notifications.filter(n => n && !n.read).length, 
    [notifications]
  );

  const renderNotificationIcon = (type) => {
    const iconConfig = {
      goal_invite: { icon: 'person-add', color: COLORS.shared },
      progress_update: { icon: 'trending-up', color: COLORS.success },
      milestone_completed: { icon: 'trophy', color: COLORS.warning },
      goal_joined: { icon: 'people', color: COLORS.info },
      goal_completed: { icon: 'checkmark-done', color: COLORS.success },
      comment: { icon: 'chatbubble', color: COLORS.accentBlush },
      goal_updated: { icon: 'create', color: COLORS.info },
      participant_removed: { icon: 'person-remove', color: COLORS.error },
      goal_deleted: { icon: 'trash', color: COLORS.error }
    };
    
    const config = iconConfig[type] || { icon: 'notifications', color: COLORS.textSecondary };
    
    return (
      <View style={[styles.notificationIconCircle, { backgroundColor: config.color + '20' }]}>
        <Ionicons name={config.icon} size={20} color={config.color} />
      </View>
    );
  };

  return (
    <>
      <TouchableOpacity 
        style={styles.notificationButton}
        onPress={() => setNotificationVisible(true)}
      >
        <Ionicons name="notifications-outline" size={24} color={COLORS.textPrimary} />
        {unreadCount > 0 && (
          <View style={styles.notificationBadge}>
            <Text style={styles.notificationBadgeText}>
              {unreadCount > 9 ? "9+" : unreadCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      <Modal
        visible={notificationVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setNotificationVisible(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.backgroundBase }}>
          <LinearGradient
            colors={[COLORS.gradientStart, COLORS.gradientEnd]}
            style={styles.notificationHeaderGradient}
          >
            <View style={styles.notificationHeader}>
              <View>
                <Text style={styles.notificationTitle}>Notifications</Text>
                {unreadCount > 0 && (
                  <Text style={styles.notificationSubtitle}>
                    {unreadCount} unread
                  </Text>
                )}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                {unreadCount > 0 && (
                  <TouchableOpacity onPress={markAllAsRead} disabled={loading}>
                    <Text style={styles.markAllReadText}>Mark all read</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setNotificationVisible(false)}>
                  <Ionicons name="close" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
              </View>
            </View>
          </LinearGradient>

          <FlatList
            data={[...notifications].sort((a, b) => {
              const dateA = a.timestamp?.seconds ? new Date(a.timestamp.seconds * 1000) : new Date(a.timestamp || 0);
              const dateB = b.timestamp?.seconds ? new Date(b.timestamp.seconds * 1000) : new Date(b.timestamp || 0);
              return dateB - dateA;
            })}
            keyExtractor={(item, index) => item?.id || `notification-${index}`}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.notificationItem,
                  !item.read && styles.notificationItemUnread
                ]}
                onPress={() => item.id && markAsRead(item.id)}
              >
                {renderNotificationIcon(item.type)}
                <View style={styles.notificationContent}>
                  <Text style={styles.notificationMessage} numberOfLines={2}>
                    {item.message || 'Notification'}
                  </Text>
                  <Text style={styles.notificationTime}>
                    {formatRelativeTime(item.timestamp)}
                  </Text>
                </View>
                {!item.read && <View style={styles.notificationDot} />}
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.emptyNotifications}>
                <Ionicons name="notifications-off-outline" size={64} color={COLORS.textTertiary} />
                <Text style={styles.emptyNotificationText}>No notifications</Text>
                <Text style={styles.emptyNotificationSubtext}>
                  When you get invited to goals or someone makes progress, you'll see it here
                </Text>
              </View>
            }
            contentContainerStyle={notifications.length === 0 ? { flex: 1 } : { paddingBottom: 20 }}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
});

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
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
      setText("");
    }
  };

  return (
    <Animated.View style={[styles.quickAddContainer, { transform: [{ scale: scaleAnim }] }]}>
      <BlurView intensity={90} tint="light" style={styles.quickAddBlur}>
        <View style={styles.quickAddInner}>
          <Ionicons name="people-outline" size={24} color={COLORS.shared} />
          
          <TextInput
            style={styles.quickAddInput}
            placeholder="Quick add shared goal..."
            placeholderTextColor={COLORS.placeholder}
            value={text}
            onChangeText={setText}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onSubmitEditing={handleSubmit}
            returnKeyType="done"
            maxLength={120}
          />
          
          {text.length > 0 && (
            <TouchableOpacity onPress={handleSubmit} style={styles.quickAddSubmit}>
              <LinearGradient
                colors={[COLORS.shared, COLORS.accentBlush]}
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
   📋 SHARED GOAL DETAIL MODAL - All functionality preserved
   ================================================================================ */

const SharedGoalDetailModal = ({
  visible,
  onClose,
  goal,
  user,
  onAddProgress,
  onAddComment,
  onAddMilestone,
  onToggleMilestone,
  onEditGoal,
  onDeleteGoal,
  onAddCollaborator,
  onRemoveParticipant,
  canManageRoles,
}) => {
  const { profile } = useApp();
  const userPhoto = profile?.profilePic || null;
  const userName = profile?.username || user?.email || "User";
  const [activeTab, setActiveTab] = useState('overview');
  const [commentInput, setCommentInput] = useState('');
  const [progressInput, setProgressInput] = useState('');
  const [milestoneInput, setMilestoneInput] = useState('');
  const [milestoneDueDate, setMilestoneDueDate] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editCollabLoading, setEditCollabLoading] = useState(false);
  const [comments, setComments] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [optimisticComments, setOptimisticComments] = useState([]);
  const [optimisticMilestones, setOptimisticMilestones] = useState([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState('');
  
  // Date picker states
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [tempDate, setTempDate] = useState(new Date());

  const [editForm, setEditForm] = useState({
    title: goal?.title || '',
    description: goal?.description || '',
    dueDate: goal?.dueDate ? (goal.due_date.seconds ? new Date(goal.due_date.seconds * 1000) : new Date(goal.due_date)) : new Date(),
    targetValue: goal?.targetValue?.toString() || '',
    unit: goal?.unit || '',
    priority: goal?.priority || 'medium',
    category: goal?.category || 'social',
    collabEmail: ''
  });

  const slideAnim = useRef(new Animated.Value(0)).current;
  const commentInputRef = useRef(null);

  useEffect(() => {
    if (goal) {
      setEditForm({
        title: goal.title || '',
        description: goal.description || '',
        dueDate: goal.due_date ? (goal.due_date.seconds ? new Date(goal.due_date.seconds * 1000) : new Date(goal.due_date)) : new Date(),
        targetValue: goal.target_value?.toString() || '',
        unit: goal.unit || '',
        priority: goal.priority || 'medium',
        category: goal.category || 'social',
        collabEmail: ''
      });
      setComments(goal.comments ? [...goal.comments].reverse() : []);
      setMilestones(goal.milestones || []);
    }
  }, [goal]);

  const progress = useMemo(() => computeProgress(goal), [goal]);
  const daysRemaining = useMemo(() => getDaysRemaining(goal?.dueDate), [goal?.dueDate]);
  const isOverdue = daysRemaining !== null && daysRemaining < 0;
  const isDueSoon = daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= 3;
  const completedMilestones = goal?.milestones?.filter(m => m.completed).length || 0;
  const totalMilestones = goal?.milestones?.length || 0;

  const handleEditToggle = () => {
    setIsEditing(!isEditing);
    Animated.timing(slideAnim, {
      toValue: isEditing ? 0 : 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const handleCancelEdit = () => {
    if (goal) {
      setEditForm({
        title: goal.title || '',
        description: goal.description || '',
        dueDate: goal.due_date ? (goal.due_date.seconds ? new Date(goal.due_date.seconds * 1000) : new Date(goal.due_date)) : new Date(),
        targetValue: goal.target_value?.toString() || '',
        unit: goal.unit || '',
        priority: goal.priority || 'medium',
        category: goal.category || 'social',
        collabEmail: ''
      });
    }
    setIsEditing(false);
  };

  const handleDateChange = (event, selectedDate) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setTempDate(selectedDate);
      
      if (Platform.OS === 'android') {
        setShowTimePicker(true);
      } else {
        const currentTime = editForm.dueDate || new Date();
        const newDate = new Date(
          selectedDate.getFullYear(),
          selectedDate.getMonth(),
          selectedDate.getDate(),
          currentTime.getHours(),
          currentTime.getMinutes()
        );
        setEditForm(prev => ({ ...prev, dueDate: newDate }));
      }
    }
  };

  const handleTimeChange = (event, selectedTime) => {
    setShowTimePicker(false);
    if (selectedTime) {
      const currentDate = editForm.dueDate || new Date();
      const newDateTime = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        currentDate.getDate(),
        selectedTime.getHours(),
        selectedTime.getMinutes()
      );
      setEditForm(prev => ({ ...prev, dueDate: newDateTime }));
    }
  };

  const handleAddComment = async () => {
    if (!commentInput.trim()) return;

    const tempComment = {
      id: `temp-${Date.now()}`,
      authorId: user.id,
      authorName: userName,
      text: commentInput.trim(),
      timestamp: new Date(),
      authorPhotoURL: userPhoto,
      _pending: true
    };

    setOptimisticComments(prev => [tempComment, ...prev]);
    setCommentInput('');

    try {
      await onAddComment(goal.id, commentInput.trim());
      setOptimisticComments(prev => prev.filter(c => c.id !== tempComment.id));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      console.error("Add comment error:", error);
      setOptimisticComments(prev => prev.filter(c => c.id !== tempComment.id));
      Alert.alert("Error", "Failed to add comment");
    }
  };

  const handleAddProgress = async () => {
    if (!progressInput.trim()) return;
    
    const value = parseInt(progressInput);
    if (isNaN(value) || value <= 0) {
      Alert.alert("Invalid Value", "Please enter a valid positive number");
      return;
    }

    try {
      await onAddProgress(goal.id, value);
      setProgressInput('');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {
      console.error("Add progress error:", error);
      Alert.alert("Error", "Failed to update progress");
    }
  };

  const handleAddMilestone = async () => {
    if (!milestoneInput.trim()) return;

    const tempMilestone = {
      id: `temp-${Date.now()}`,
      title: milestoneInput.trim(),
      completed: false,
      createdAt: new Date(),
      dueDate: milestoneDueDate,
      _pending: true
    };

    setOptimisticMilestones(prev => [...prev, tempMilestone]);
    const originalInput = milestoneInput;
    setMilestoneInput('');
    setMilestoneDueDate(null);

    try {
      await onAddMilestone(goal.id, originalInput.trim(), milestoneDueDate);
      setOptimisticMilestones(prev => prev.filter(m => m.id !== tempMilestone.id));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      console.error("Add milestone error:", error);
      setOptimisticMilestones(prev => prev.filter(m => m.id !== tempMilestone.id));
      Alert.alert("Error", "Failed to add milestone");
    }
  };

  const handleSaveEdit = async () => {
    if (!editForm.title.trim()) {
      Alert.alert("Error", "Title is required");
      return;
    }

    try {
      await onEditGoal(goal.id, editForm);
      setIsEditing(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Goal updated successfully");
    } catch (error) {
      console.error("Update goal error:", error);
      Alert.alert("Error", "Failed to update goal");
    }
  };

  const handleInviteCollaborator = async () => {
    if (!inviteEmail.trim()) return;
    
    try {
      await onAddCollaborator(inviteEmail, true);
      setInviteEmail('');
      setInviteError('');
      Alert.alert("Success", "Invitation sent!");
    } catch (error) {
      setInviteError(error.message || "Failed to invite user");
    }
  };

  if (!goal) return null;

  const getDueColor = () => {
    if (goal.progress === 100) return COLORS.success;
    if (isOverdue) return COLORS.danger;
    if (isDueSoon) return COLORS.warning;
    return COLORS.textSecondary;
  };

  const getDueLabel = () => {
    if (goal.progress === 100) return "Completed";
    if (isOverdue) return `${Math.abs(daysRemaining)} days overdue`;
    if (daysRemaining === 0) return "Today";
    if (daysRemaining === 1) return "Tomorrow";
    return `${daysRemaining} days left`;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.detailModalOverlay}>
        <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
        
        <SafeAreaView style={styles.detailModalSafeArea}>
          <View style={styles.detailModalContainer}>
            <View style={styles.detailModalHeader}>
              <TouchableOpacity
                onPress={onClose}
                style={styles.detailModalBackButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
              
              <Text style={styles.detailModalTitle} numberOfLines={1}>
                {isEditing ? 'Edit Goal' : goal.title}
              </Text>
              
              <View style={{ flexDirection: 'row', gap: 12 }}>
                {!isEditing && goal.isOwner && (
                  <TouchableOpacity
                    onPress={handleEditToggle}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="create-outline" size={22} color={COLORS.shared} />
                  </TouchableOpacity>
                )}
                {!isEditing && goal.isOwner && (
                  <TouchableOpacity
                    onPress={() => {
                      Alert.alert(
                        "Delete Goal",
                        "Are you sure you want to delete this goal?",
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Delete",
                            style: "destructive",
                            onPress: () => onDeleteGoal(goal)
                          }
                        ]
                      );
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="trash-outline" size={22} color={COLORS.danger} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <ScrollView
              contentContainerStyle={styles.detailModalContent}
              showsVerticalScrollIndicator={false}
            >
              {isEditing ? (
                <Animated.View
                  style={[
                    styles.detailEditForm,
                    {
                      opacity: slideAnim,
                      transform: [{
                        translateY: slideAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [20, 0]
                        })
                      }]
                    }
                  ]}
                >
                  <Text style={styles.detailSectionTitle}>Edit Goal Details</Text>
                  
                  <View style={styles.detailFormGroup}>
                    <Text style={styles.detailFormLabel}>Title *</Text>
                    <View style={styles.detailFormInputContainer}>
                      <Ionicons name="people-outline" size={20} color={COLORS.shared} />
                      <TextInput
                        style={styles.detailFormInput}
                        value={editForm.title}
                        onChangeText={(text) => setEditForm(prev => ({ ...prev, title: text }))}
                        placeholder="Goal title"
                        placeholderTextColor={COLORS.placeholder}
                      />
                    </View>
                  </View>

                  <View style={styles.detailFormGroup}>
                    <Text style={styles.detailFormLabel}>Description</Text>
                    <View style={[styles.detailFormInputContainer, styles.detailFormTextArea]}>
                      <Ionicons name="document-text-outline" size={20} color={COLORS.shared} />
                      <TextInput
                        style={[styles.detailFormInput, { minHeight: 80 }]}
                        value={editForm.description}
                        onChangeText={(text) => setEditForm(prev => ({ ...prev, description: text }))}
                        multiline
                        placeholder="Describe your goal..."
                        placeholderTextColor={COLORS.placeholder}
                      />
                    </View>
                  </View>

                  <View style={styles.detailFormRow}>
                    <View style={[styles.detailFormGroup, { flex: 1, marginRight: 8 }]}>
                      <Text style={styles.detailFormLabel}>Target</Text>
                      <View style={styles.detailFormInputContainer}>
                        <Ionicons name="flag-outline" size={20} color={COLORS.shared} />
                        <TextInput
                          style={styles.detailFormInput}
                          value={editForm.targetValue}
                          onChangeText={(text) => setEditForm(prev => ({ ...prev, targetValue: text }))}
                          keyboardType="numeric"
                          placeholder="100"
                          placeholderTextColor={COLORS.placeholder}
                        />
                      </View>
                    </View>
                    <View style={[styles.detailFormGroup, { flex: 1, marginLeft: 8 }]}>
                      <Text style={styles.detailFormLabel}>Unit</Text>
                      <View style={styles.detailFormInputContainer}>
                        <Ionicons name="analytics-outline" size={20} color={COLORS.shared} />
                        <TextInput
                          style={styles.detailFormInput}
                          value={editForm.unit}
                          onChangeText={(text) => setEditForm(prev => ({ ...prev, unit: text }))}
                          placeholder="km, books..."
                          placeholderTextColor={COLORS.placeholder}
                        />
                      </View>
                    </View>
                  </View>

                  <View style={styles.detailFormGroup}>
                    <Text style={styles.detailFormLabel}>Due Date & Time</Text>
                    <View style={styles.detailFormDateRow}>
                      <TouchableOpacity
                        style={[styles.detailFormDateButton, { flex: 1, marginRight: 8 }]}
                        onPress={() => {
                          setTempDate(editForm.dueDate || new Date());
                          setShowDatePicker(true);
                        }}
                      >
                        <Ionicons name="calendar-outline" size={20} color={COLORS.shared} />
                        <Text style={styles.detailFormDateText}>
                          {editForm.dueDate.toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </Text>
                      </TouchableOpacity>
                      
                      <TouchableOpacity
                        style={[styles.detailFormDateButton, { flex: 1, marginLeft: 8 }]}
                        onPress={() => {
                          setTempDate(editForm.dueDate || new Date());
                          setShowTimePicker(true);
                        }}
                      >
                        <Ionicons name="time-outline" size={20} color={COLORS.shared} />
                        <Text style={styles.detailFormDateText}>
                          {editForm.dueDate.toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {showDatePicker && (
                    <DateTimePicker
                      value={tempDate}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={handleDateChange}
                      minimumDate={new Date()}
                    />
                  )}

                  {showTimePicker && (
                    <DateTimePicker
                      value={tempDate}
                      mode="time"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={handleTimeChange}
                    />
                  )}

                  <View style={styles.detailFormGroup}>
                    <Text style={styles.detailFormLabel}>Priority</Text>
                    <View style={styles.detailPriorityGrid}>
                      {Object.keys(PRIORITIES).map((p) => (
                        <TouchableOpacity
                          key={p}
                          style={[
                            styles.detailPriorityCard,
                            editForm.priority === p && styles.detailPriorityCardActive,
                            { borderColor: PRIORITIES[p].color }
                          ]}
                          onPress={() => setEditForm(prev => ({ ...prev, priority: p }))}
                        >
                          <Ionicons
                            name={PRIORITIES[p].icon}
                            size={18}
                            color={editForm.priority === p ? PRIORITIES[p].color : COLORS.textSecondary}
                          />
                          <Text style={[
                            styles.detailPriorityCardText,
                            editForm.priority === p && { color: PRIORITIES[p].color }
                          ]}>
                            {p.charAt(0).toUpperCase() + p.slice(1)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <View style={styles.detailFormGroup}>
                    <Text style={styles.detailFormLabel}>Category</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={styles.detailCategoryGrid}>
                        {Object.keys(CATEGORIES).map((cat) => (
                          <TouchableOpacity
                            key={cat}
                            style={[
                              styles.detailCategoryChip,
                              { backgroundColor: editForm.category === cat ? CATEGORIES[cat].color : COLORS.card },
                              editForm.category === cat && { borderWidth: 0 }
                            ]}
                            onPress={() => setEditForm(prev => ({ ...prev, category: cat }))}
                          >
                            <Ionicons
                              name={CATEGORIES[cat].icon}
                              size={14}
                              color={editForm.category === cat ? 'white' : CATEGORIES[cat].color}
                            />
                            <Text style={[
                              styles.detailCategoryChipText,
                              { color: editForm.category === cat ? 'white' : CATEGORIES[cat].color }
                            ]}>
                              {CATEGORIES[cat].label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  </View>

                  {goal.isOwner && (
                    <>
                      <Text style={[styles.detailSectionTitle, { marginTop: 16 }]}>Add Collaborators</Text>
                      <View style={styles.detailFormGroup}>
                        <Text style={styles.detailFormLabel}>Invite by Email</Text>
                        <View style={styles.detailInviteRow}>
                          <View style={styles.detailInviteInputContainer}>
                            <Ionicons name="mail-outline" size={20} color={COLORS.shared} />
                            <TextInput
                              style={styles.detailInviteInput}
                              value={editForm.collabEmail}
                              onChangeText={(text) => setEditForm(prev => ({ ...prev, collabEmail: text }))}
                              placeholder="collaborator@example.com"
                              placeholderTextColor={COLORS.placeholder}
                              keyboardType="email-address"
                              autoCapitalize="none"
                            />
                          </View>
                          <TouchableOpacity
                            style={[
                              styles.detailInviteButton,
                              (!editForm.collabEmail.trim() || editCollabLoading) && { opacity: 0.5 }
                            ]}
                            onPress={() => onAddCollaborator(editForm.collabEmail, true)}
                            disabled={!editForm.collabEmail.trim() || editCollabLoading}
                          >
                            {editCollabLoading ? (
                              <ActivityIndicator color="#fff" size="small" />
                            ) : (
                              <Ionicons name="person-add" size={20} color="#fff" />
                            )}
                          </TouchableOpacity>
                        </View>
                      </View>
                    </>
                  )}

                  <View style={styles.detailEditActions}>
                    <TouchableOpacity
                      style={[styles.detailButton, styles.detailCancelButton]}
                      onPress={handleCancelEdit}
                    >
                      <Text style={styles.detailCancelButtonText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.detailButton, styles.detailSaveButton]}
                      onPress={handleSaveEdit}
                    >
                      <LinearGradient
                        colors={[COLORS.shared, COLORS.accentBlush]}
                        style={styles.detailSaveButtonGradient}
                      >
                        <Text style={styles.detailSaveButtonText}>Save Changes</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </Animated.View>
              ) : (
                <>
                  <View style={styles.detailTabContainer}>
                    {TABS.map((tab) => (
                      <TouchableOpacity
                        key={tab.id}
                        style={[
                          styles.detailTab,
                          activeTab === tab.id && styles.detailTabActive
                        ]}
                        onPress={() => setActiveTab(tab.id)}
                      >
                        <Ionicons
                          name={tab.icon}
                          size={18}
                          color={activeTab === tab.id ? COLORS.shared : COLORS.textSecondary}
                        />
                        <Text style={[
                          styles.detailTabText,
                          activeTab === tab.id && styles.detailTabTextActive
                        ]}>
                          {tab.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {activeTab === 'overview' && (
                    <View style={styles.detailTabContent}>
                      <BlurView intensity={90} tint="light" style={styles.detailOverviewCard}>
                        <View style={styles.detailOverviewHeader}>
                          <ProgressRing progress={progress} size={70} />
                          <View style={styles.detailOverviewStats}>
                            <Text style={styles.detailOverviewTitle}>Progress Overview</Text>
                            <Text style={styles.detailOverviewValue}>
                              {goal.current_value || 0} / {goal.target_value || 0} {goal.unit}
                            </Text>
                            <View style={[styles.dueBadge, { backgroundColor: getDueColor() + '15', marginTop: 8 }]}>
                              <Ionicons
                                name={goal.progress === 100 ? "checkmark-circle" : isOverdue ? "alert-circle" : "calendar-outline"}
                                size={14}
                                color={getDueColor()}
                              />
                              <Text style={[styles.dueText, { color: getDueColor() }]}>
                                {getDueLabel()}
                              </Text>
                            </View>
                          </View>
                        </View>
                        
                        {goal.description ? (
                          <View style={styles.detailDescription}>
                            <Text style={styles.detailDescriptionLabel}>Description</Text>
                            <Text style={styles.detailDescriptionText}>{goal.description}</Text>
                          </View>
                        ) : null}

                        {totalMilestones > 0 && (
                          <View style={styles.detailMilestonesSummary}>
                            <View style={styles.detailMilestonesSummaryHeader}>
                              <Text style={styles.detailMilestonesSummaryTitle}>Milestones</Text>
                              <Text style={styles.detailMilestonesSummaryCount}>
                                {completedMilestones}/{totalMilestones}
                              </Text>
                            </View>
                            <View style={styles.detailMilestoneBar}>
                              <View
                                style={[
                                  styles.detailMilestoneBarFill,
                                  { width: `${(completedMilestones / totalMilestones) * 100}%` }
                                ]}
                              />
                            </View>
                          </View>
                        )}
                      </BlurView>

                      <View style={styles.detailQuickActions}>
                        <TouchableOpacity
                          style={styles.detailQuickAction}
                          onPress={() => setActiveTab('progress')}
                        >
                          <LinearGradient
                            colors={[COLORS.shared + '20', COLORS.shared + '10']}
                            style={styles.detailQuickActionGradient}
                          >
                            <Ionicons name="trending-up-outline" size={24} color={COLORS.shared} />
                            <Text style={styles.detailQuickActionText}>Add Progress</Text>
                          </LinearGradient>
                        </TouchableOpacity>
                        
                        <TouchableOpacity
                          style={styles.detailQuickAction}
                          onPress={() => setActiveTab('discussion')}
                        >
                          <LinearGradient
                            colors={[COLORS.accentBlush + '20', COLORS.accentBlush + '10']}
                            style={styles.detailQuickActionGradient}
                          >
                            <Ionicons name="chatbubbles-outline" size={24} color={COLORS.accentBlush} />
                            <Text style={styles.detailQuickActionText}>Discussion</Text>
                          </LinearGradient>
                        </TouchableOpacity>
                      </View>

                      <View style={styles.detailParticipantsCard}>
                        <View style={styles.detailParticipantsHeader}>
                          <Text style={styles.detailParticipantsTitle}>Participants</Text>
                          <Text style={styles.detailParticipantsCount}>
                            {goal.participant_details?.length || 0} members
                          </Text>
                        </View>
                        
                        {(goal.participant_details || []).map((participant, idx) => {
                          const role = goal.roles?.[participant.uid] || 
                                     (participant.uid === goal.owner_id ? 'owner' : 'member');
                          
                          return (
                            <View key={participant.uid || idx} style={styles.detailParticipantItem}>
                              <UserAvatar user={participant} size={44} />
                              <View style={styles.detailParticipantInfo}>
                                <Text style={styles.detailParticipantName}>
                                  {participant.displayName}
                                  {participant.uid === user.id && ' (You)'}
                                </Text>
                                <Text style={styles.detailParticipantEmail}>{participant.email}</Text>
                              </View>
                              <View style={styles.detailParticipantRole}>
                                <Text style={[
                                  styles.detailRoleText,
                                  role === 'owner' && { color: COLORS.shared, fontWeight: '700' },
                                  role === 'admin' && { color: COLORS.info },
                                  role === 'editor' && { color: COLORS.sage }
                                ]}>
                                  {role}
                                </Text>
                              </View>
                              {canManageRoles?.(goal) && participant.uid !== goal.owner_id && participant.uid !== user.id && (
                                <TouchableOpacity
                                  style={styles.detailRemoveParticipantBtn}
                                  onPress={() => onRemoveParticipant?.(goal.id, participant.uid)}
                                >
                                  <Ionicons name="close-circle" size={20} color={COLORS.danger} />
                                </TouchableOpacity>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {activeTab === 'progress' && (
                    <View style={styles.detailTabContent}>
                      <BlurView intensity={90} tint="light" style={styles.detailProgressCard}>
                        <Text style={styles.detailSectionTitle}>Add Progress</Text>
                        <Text style={styles.detailProgressHelpText}>
                          Current: {goal.current_value || 0} {goal.unit} • 
                          Target: {goal.target_value || 0} {goal.unit}
                        </Text>
                        
                        <View style={styles.detailProgressInputRow}>
                          <View style={styles.detailProgressInputWrapper}>
                            <TextInput
                              style={styles.detailProgressInput}
                              value={progressInput}
                              onChangeText={setProgressInput}
                              placeholder="Enter amount"
                              placeholderTextColor={COLORS.placeholder}
                              keyboardType="numeric"
                            />
                            <Text style={styles.detailUnitText}>{goal.unit}</Text>
                          </View>
                          <TouchableOpacity
                            style={[
                              styles.detailProgressAddButton,
                              (!progressInput.trim() || isNaN(parseInt(progressInput))) && styles.detailProgressAddButtonDisabled
                            ]}
                            onPress={handleAddProgress}
                            disabled={!progressInput.trim() || isNaN(parseInt(progressInput))}
                          >
                            <LinearGradient
                              colors={[COLORS.shared, COLORS.accentBlush]}
                              style={styles.detailProgressAddButtonGradient}
                            >
                              <Ionicons name="add-circle" size={24} color="#fff" />
                            </LinearGradient>
                          </TouchableOpacity>
                        </View>
                      </BlurView>

                      <BlurView intensity={90} tint="light" style={styles.detailMilestonesCard}>
                        <View style={styles.detailMilestonesHeader}>
                          <Text style={styles.detailSectionTitle}>Milestones</Text>
                          {totalMilestones > 0 && (
                            <Text style={styles.detailMilestonesCount}>
                              {completedMilestones}/{totalMilestones}
                            </Text>
                          )}
                        </View>
                        
                        {optimisticMilestones.map((m) => (
                          <View key={m.id} style={[styles.detailMilestoneItem, styles.detailMilestoneItemPending]}>
                            <View style={styles.detailMilestoneCheckbox}>
                              <ActivityIndicator size="small" color={COLORS.shared} />
                            </View>
                            <View style={styles.detailMilestoneContent}>
                              <Text style={styles.detailMilestoneText}>{m.title}</Text>
                              {m.dueDate && (
                                <Text style={styles.detailMilestoneDate}>
                                  Due: {m.dueDate.toLocaleDateString()}
                                </Text>
                              )}
                              <Text style={styles.detailPendingText}>Adding...</Text>
                            </View>
                          </View>
                        ))}
                        
                        {milestones.map((m, index) => (
                          <TouchableOpacity
                            key={index}
                            style={[
                              styles.detailMilestoneItem,
                              m?.completed && styles.detailMilestoneItemCompleted
                            ]}
                            onPress={() => onToggleMilestone(goal.id, index)}
                            disabled={!goal.isOwner}
                          >
                            <View style={styles.detailMilestoneCheckbox}>
                              <Ionicons
                                name={m?.completed ? "checkmark-circle" : "ellipse-outline"}
                                size={24}
                                color={m?.completed ? COLORS.success : COLORS.textSecondary}
                              />
                            </View>
                            <View style={styles.detailMilestoneContent}>
                              <Text style={[
                                styles.detailMilestoneText,
                                m?.completed && styles.detailMilestoneTextCompleted
                              ]}>
                                {m?.title || 'Unnamed Milestone'}
                              </Text>
                              {m?.dueDate && (
                                <Text style={styles.detailMilestoneDate}>
                                  Due: {formatDate(m.dueDate)}
                                </Text>
                              )}
                              {m?.completedAt && (
                                <Text style={styles.detailMilestoneDate}>
                                  Completed {formatRelativeTime(m.completedAt)}
                                </Text>
                              )}
                            </View>
                          </TouchableOpacity>
                        ))}

                        {/* ✅ ADD MILESTONE INPUT - Only in progress tab */}
                        {goal.isOwner && (
                          <View style={styles.detailAddMilestoneRow}>
                            <View style={styles.detailAddMilestoneInputContainer}>
                              <Ionicons name="add-circle-outline" size={20} color={COLORS.shared} />
                              <TextInput
                                style={styles.detailAddMilestoneInput}
                                value={milestoneInput}
                                onChangeText={setMilestoneInput}
                                placeholder="Add a new milestone..."
                                placeholderTextColor={COLORS.placeholder}
                              />
                            </View>
                            <TouchableOpacity
                              style={[
                                styles.detailAddMilestoneButton,
                                !milestoneInput.trim() && styles.detailAddMilestoneButtonDisabled
                              ]}
                              onPress={handleAddMilestone}
                              disabled={!milestoneInput.trim()}
                            >
                              <Ionicons name="add" size={20} color="#fff" />
                            </TouchableOpacity>
                          </View>
                        )}
                      </BlurView>
                    </View>
                  )}

                  {activeTab === 'discussion' && (
                    <View style={styles.detailTabContent}>
                      <BlurView intensity={90} tint="light" style={styles.detailCommentCard}>
                        <Text style={styles.detailSectionTitle}>Discussion</Text>
                        <View style={styles.detailCommentInputRow}>
                          <UserAvatar user={user} size={40} />
                          <View style={styles.detailCommentInputWrapper}>
                            <TextInput
                              ref={commentInputRef}
                              style={styles.detailCommentInput}
                              value={commentInput}
                              onChangeText={setCommentInput}
                              placeholder="Write a comment..."
                              placeholderTextColor={COLORS.placeholder}
                              multiline
                            />
                            <TouchableOpacity
                              style={[
                                styles.detailCommentSendButton,
                                !commentInput.trim() && styles.detailCommentSendButtonDisabled
                              ]}
                              onPress={handleAddComment}
                              disabled={!commentInput.trim()}
                            >
                              <Ionicons name="send" size={18} color="#fff" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      </BlurView>

                      <View style={styles.detailCommentsList}>
                        {optimisticComments.map((comment) => (
                          <View key={comment.id} style={[styles.detailCommentItem, styles.detailCommentItemPending]}>
                            <UserAvatar user={comment} size={40} />
                            <View style={styles.detailCommentContent}>
                              <View style={styles.detailCommentHeader}>
                                <Text style={styles.detailCommentAuthor}>{comment.authorName}</Text>
                                <Text style={styles.detailCommentTime}>Sending...</Text>
                              </View>
                              <Text style={styles.detailCommentText}>{comment.text}</Text>
                              <ActivityIndicator size="small" color={COLORS.shared} style={styles.detailPendingIndicator} />
                            </View>
                          </View>
                        ))}
                        
                        {comments.map((c, idx) => (
                          <View key={idx} style={styles.detailCommentItem}>
                            <UserAvatar user={c} size={40} />
                            <View style={styles.detailCommentContent}>
                              <View style={styles.detailCommentHeader}>
                                <Text style={styles.detailCommentAuthor}>{c.authorName}</Text>
                                <Text style={styles.detailCommentTime}>
                                  {formatRelativeTime(c.timestamp)}
                                </Text>
                              </View>
                              <Text style={styles.detailCommentText}>{c.text}</Text>
                            </View>
                          </View>
                        ))}

                        {comments.length === 0 && optimisticComments.length === 0 && (
                          <View style={styles.detailEmptyComments}>
                            <Ionicons name="chatbubbles-outline" size={48} color={COLORS.textTertiary} />
                            <Text style={styles.detailEmptyCommentsText}>No comments yet</Text>
                            <Text style={styles.detailEmptyCommentsSubtext}>
                              Be the first to start the discussion!
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  )}
                </>
              )}
            </ScrollView>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
};

/* ================================================================================
   🏆 MAIN SHARED GOALS SCREEN
   ================================================================================ */

export default function SharedGoalsScreen() {
  const { user, profile } = useApp();
  // helper — Supabase user display name (no displayName on auth user)
  const userName = profile?.username || user?.email || "User";
  const userPhoto = profile?.profilePic || null;

  // State
  const [goals, setGoals] = useState([]);
  const [filteredGoals, setFilteredGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [expandedGoalId, setExpandedGoalId] = useState(null);
  const [activeTab, setActiveTab] = useState('progress');

  // Modal states
  const [createVisible, setCreateVisible] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedDetailGoal, setSelectedDetailGoal] = useState(null);

  // Form state
  const [createForm, setCreateForm] = useState({
    title: "",
    description: "",
    dueDate: new Date(),
    targetValue: "",
    unit: "",
    priority: "medium",
    category: "social",
    collaborators: [],
    collabEmail: ""
  });

  // Date picker states for create modal
  const [showCreateDatePicker, setShowCreateDatePicker] = useState(false);
  const [showCreateTimePicker, setShowCreateTimePicker] = useState(false);
  const [tempCreateDate, setTempCreateDate] = useState(new Date());

  const [editCollabLoading, setEditCollabLoading] = useState(false);

  // Notification state
  const [notificationPermission, setNotificationPermission] = useState(false);
  const notificationListener = useRef(null);
  const responseListener = useRef(null);

  // Animation refs
  const scrollY = useRef(new Animated.Value(0)).current;
  const flatListRef = useRef(null);

  // User cache
  const userCache = useRef(new Map());

  /* ================================================================================
     🔔 PUSH TOKEN REGISTRATION
     ================================================================================ */

  useEffect(() => {
    const registerPushToken = async () => {
      if (user?.id) {
        try {
          const token = await registerAndSaveExpoPushToken(user.id);
          if (token) {
            console.log('✅ Push token registered for user:', user.id);
          }
        } catch (error) {
          console.error('❌ Failed to register push token:', error);
        }
      }
    };

    registerPushToken();
  }, [user]);

  useEffect(() => {
    const initializePushNotifications = async () => {
      try {
        configureNotificationHandler?.();
        const hasPermission = await requestNotificationPermissions?.();
        setNotificationPermission(!!hasPermission);
        
        if (hasPermission) {
          notificationListener.current = setupNotificationReceivedHandler?.();
          responseListener.current = setupNotificationResponseHandler?.();
        }
      } catch (error) {
        console.error('❌ Error initializing push notifications:', error);
      }
    };

    initializePushNotifications();

    return () => {
      notificationListener.current?.remove?.();
      responseListener.current?.remove?.();
    };
  }, []);

  /* ================================================================================
     📶 NETWORK MONITOR
     ================================================================================ */

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(!state.isConnected);
    });
    NetInfo.fetch().then((state) => setIsOffline(!state.isConnected));
    return () => unsubscribe();
  }, []);

  /* ================================================================================
     👤 USER DETAILS FETCHING
     ================================================================================ */

  const fetchUserDetails = useCallback(async (uids) => {
    const uniqueUids = [...new Set(uids.filter(uid => uid))];
    const result = [];

    for (const uid of uniqueUids) {
      if (userCache.current.has(uid)) {
        result.push(userCache.current.get(uid));
        continue;
      }

      try {
        const { data } = await supabase
          .from("profiles")
          .select("id, username, profile_pic")
          .eq("id", uid)
          .single();

        if (data) {
          const userInfo = {
            uid: data.id,
            displayName: data.username || "User",
            email: "",
            photoURL: data.profile_pic || null,
          };
          userCache.current.set(uid, userInfo);
          result.push(userInfo);
        }
      } catch (error) {
        console.warn("Error fetching user details for uid:", uid, error);
      }
    }
    return result;
  }, []);

  /* ================================================================================
     🔥 FIRESTORE LISTENER
     ================================================================================ */

  useEffect(() => {
    if (!user?.id) return;

    setLoading(true);

    const processGoals = async (rows) => {
      try {
        const goalsList = await Promise.all(
          (rows || []).map(async (data) => {
            if (!data.participant_details && data.participants) {
              try {
                data.participant_details = await fetchUserDetails(data.participants);
              } catch {
                data.participant_details = [];
              }
            }

            const progress = computeProgress(data);
            const daysRemaining = getDaysRemaining(data.due_date);
            const isOwner = data.owner_id === user.id || data.creator_id === user.id;

            return { ...data, progress, daysRemaining, isOwner, activeTab: "progress" };
          })
        );

        goalsList.sort((a, b) => {
          if (a.progress === 100 && b.progress < 100) return 1;
          if (b.progress === 100 && a.progress < 100) return -1;
          return new Date(a.due_date || 0) - new Date(b.due_date || 0);
        });

        setGoals(goalsList);
      } catch (error) {
        console.error("Error processing goals:", error);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    };

    const fetchGoals = async () => {
      const { data, error } = await supabase
        .from("shared_goals")
        .select("*")
        .filter("participants", "cs", `["${user.id}"]`);

      if (error) {
        console.error("Shared goals fetch error:", error);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      await processGoals(data || []);
    };

    fetchGoals();

    const channel = supabase
      .channel(`shared-goals-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "shared_goals" },
        fetchGoals)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "shared_goals" },
        ({ new: updated }) => {
          if (!updated) return;
          const participants = updated.participants || [];
          if (participants.includes(user.id)) {
            setGoals(prev => prev.map(g => g.id === updated.id
              ? { ...g, ...updated, isOwner: updated.owner_id === user.id }
              : g
            ));
            // Keep detail modal in sync if it's open for this goal
            setSelectedDetailGoal(prev =>
              prev?.id === updated.id
                ? { ...prev, ...updated, isOwner: updated.owner_id === user.id }
                : prev
            );
          } else {
            setGoals(prev => prev.filter(g => g.id !== updated.id));
            setSelectedDetailGoal(prev => prev?.id === updated.id ? null : prev);
          }
        })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "shared_goals" },
        ({ old: deleted }) => {
          if (!deleted?.id) return;
          setGoals(prev => prev.filter(g => g.id !== deleted.id));
          setSelectedDetailGoal(prev => prev?.id === deleted.id ? null : prev);
        })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user, fetchUserDetails]);

  /* ================================================================================
     🔍 FILTERING & SEARCH
     ================================================================================ */

  useEffect(() => {
    let filtered = [...goals];
    
    if (selectedCategory !== "all") {
      filtered = filtered.filter(g => g.category === selectedCategory);
    }
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(g => 
        g.title?.toLowerCase().includes(query) ||
        g.description?.toLowerCase().includes(query)
      );
    }
    
    setFilteredGoals(filtered);
  }, [goals, selectedCategory, searchQuery]);

  /* ================================================================================
     👥 COLLABORATOR RESOLUTION
     ================================================================================ */

  const resolveEmailToUser = useCallback(async (email) => {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail) return null;

      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, profile_pic")
        .eq("email", normalizedEmail)
        .single();

      if (error || !data) return null;

      return {
        uid: data.id,
        email: normalizedEmail,
        displayName: data.username || normalizedEmail.split("@")[0],
        photoURL: data.profile_pic || null,
      };
    } catch (error) {
      console.error("Error resolving email to user:", error);
      return null;
    }
  }, []);

  /* ================================================================================
     🎯 GOAL OPERATIONS
     ================================================================================ */

  const handleAddCollaborator = useCallback(async (email, isEditMode = false) => {
    if (!email.trim()) return;
    
    // ✅ FIX: Validate email format before hitting Firestore
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      Alert.alert("Invalid Email", "Please enter a valid email address (e.g. name@example.com).");
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    
    if (isEditMode) {
      if (selectedDetailGoal?.participants?.some(uid => {
        const participant = selectedDetailGoal.participantDetails?.find(p => p.uid === uid);
        return participant?.email === normalizedEmail;
      })) {
        Alert.alert("Already Added", "This user is already a participant.");
        return;
      }
      setEditCollabLoading(true);
    }

    try {
      const resolvedUser = await resolveEmailToUser(normalizedEmail);
      if (!resolvedUser) {
        Alert.alert("User Not Found", `No user found with email ${normalizedEmail}`);
        return;
      }

      if (isEditMode) {
        const newParticipant = { ...resolvedUser, role: "editor" };

        const currentGoal = await supabase.from("shared_goals").select("participants, participant_details, activity").eq("id", selectedDetailGoal.id).single();
        const updatedParticipants = [...new Set([...(currentGoal.data?.participants || []), resolvedUser.uid])];
        const updatedParticipantDetails = [...(currentGoal.data?.participant_details || []).filter(p => p.uid !== resolvedUser.uid), newParticipant];
        const updatedActivity = [...(currentGoal.data?.activity || []), {
          type: "participant_added",
          actorId: user.id,
          message: `${userName} added ${resolvedUser.displayName} to the goal`,
          timestamp: new Date().toISOString(),
        }];
        await supabase.from("shared_goals").update({
          participants: updatedParticipants,
          participant_details: updatedParticipantDetails,
          activity: updatedActivity,
          updated_at: new Date().toISOString(),
        }).eq("id", selectedDetailGoal.id);

        await sendNotificationToOthers(
          user.id,
          [resolvedUser.uid],
          `${userName} invited you to join "${selectedDetailGoal.title}"`,
          { 
            goalId: selectedDetailGoal.id,
            goalTitle: selectedDetailGoal.title,
            inviterId: user.id,
            inviterName: userName
          },
          {
            type: NOTIFICATION_TYPES?.GOAL_INVITE,
            priority: "high",
            actionRequired: true,
            pushTitle: '🎯 New Goal Invitation',
            senderName: userName,
          }
        );

        const existingParticipants = (selectedDetailGoal.participants || []).filter(uid => 
          uid && uid !== user.id && uid !== resolvedUser.uid
        );
        
        if (existingParticipants.length > 0) {
          await sendNotificationToOthers(
            user.id,
            existingParticipants,
            `${resolvedUser.displayName} joined "${selectedDetailGoal.title}"`,
            { 
              goalId: selectedDetailGoal.id,
              goalTitle: selectedDetailGoal.title,
              newMemberId: resolvedUser.uid,
              newMemberName: resolvedUser.displayName
            },
            {
              type: NOTIFICATION_TYPES?.GOAL_JOINED,
              pushTitle: '👋 New Member',
              senderName: userName,
            }
          );
        }

        Alert.alert("Invitation Sent!", `${resolvedUser.displayName} has been invited to the goal!`);
      } else {
        setCreateForm(prev => ({
          ...prev,
          collaborators: [...prev.collaborators, { ...resolvedUser, role: "editor" }],
          collabEmail: ""
        }));
      }
    } catch (error) {
      console.error("Error adding collaborator:", error);
      Alert.alert("Error", "Failed to add collaborator");
    } finally {
      if (isEditMode) setEditCollabLoading(false);
    }
  }, [user, selectedDetailGoal, resolveEmailToUser]);

  const handleCreateDateChange = (event, selectedDate) => {
    setShowCreateDatePicker(false);
    if (selectedDate) {
      setTempCreateDate(selectedDate);
      
      if (Platform.OS === 'android') {
        setShowCreateTimePicker(true);
      } else {
        const currentTime = createForm.dueDate || new Date();
        const newDate = new Date(
          selectedDate.getFullYear(),
          selectedDate.getMonth(),
          selectedDate.getDate(),
          currentTime.getHours(),
          currentTime.getMinutes()
        );
        setCreateForm(prev => ({ ...prev, dueDate: newDate }));
      }
    }
  };

  const handleCreateTimeChange = (event, selectedTime) => {
    setShowCreateTimePicker(false);
    if (selectedTime) {
      const currentDate = createForm.dueDate || new Date();
      const newDateTime = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        currentDate.getDate(),
        selectedTime.getHours(),
        selectedTime.getMinutes()
      );
      setCreateForm(prev => ({ ...prev, dueDate: newDateTime }));
    }
  };

  const handleCreateSharedGoal = useCallback(async () => {
    if (!createForm.title.trim()) {
      Alert.alert("Title Required", "Please enter a goal title");
      return;
    }

    if (createForm.collaborators.length === 0) {
      Alert.alert("Collaborators Required", "Please add at least one collaborator");
      return;
    }

    const targetValue = parseInt(createForm.targetValue);
    if (isNaN(targetValue) || targetValue <= 0) {
      Alert.alert("Invalid Target", "Please enter a valid positive number for the target");
      return;
    }

    setLoading(true);
    
    try {
      const participantUids = [...new Set([user.id, ...createForm.collaborators.map(c => c.uid)])];
      const participantDetails = [
        { 
          uid: user.id, 
          displayName: userName, 
          email: user.email, 
          photoURL: userPhoto, 
          role: "owner" 
        },
        ...createForm.collaborators.map(c => ({ 
          ...c, 
          role: c.role || "editor" 
        })),
      ];
      
      const roles = {};
      participantDetails.forEach(p => roles[p.uid] = p.role);

      const payload = {
        title: createForm.title.trim(),
        description: createForm.description.trim(),
        owner_id: user.id,
        creator_id: user.id,
        participants: participantUids,
        participant_details: participantDetails,
        roles,
        milestones: [],
        comments: [],
        contributions: { [user.id]: 0 },
        current_value: 0,
        target_value: targetValue,
        unit: createForm.unit.trim(),
        priority: createForm.priority,
        category: createForm.category,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        due_date: createForm.dueDate ? createForm.dueDate.toISOString() : null,
        activity: [{
          type: "created",
          actorId: user.id,
          message: `${userName} created this goal`,
          timestamp: new Date().toISOString(),
        }],
      };

      const { data: newGoal, error: insertError } = await supabase
        .from("shared_goals")
        .insert(payload)
        .select()
        .single();
      if (insertError) throw insertError;
      const docRef = newGoal;

      const collaboratorsUids = participantUids.filter(uid => uid !== user.id);
      await sendNotificationToOthers(
        user.id,
        collaboratorsUids,
        `${userName} invited you to join "${createForm.title.trim()}"`,
        { 
          goalId: docRef.id,
          goalTitle: createForm.title.trim(),
          inviterId: user.id,
          inviterName: userName
        },
        {
          type: NOTIFICATION_TYPES?.GOAL_INVITE,
          priority: "high",
          actionRequired: true,
          pushTitle: '🎯 New Goal Invitation',
          senderName: userName,
        }
      );

      setCreateVisible(false);
      resetCreateForm();
      Alert.alert("Success!", "Goal created and invitations sent!");
    } catch (error) {
      console.error("Create goal error:", error);
      Alert.alert("Error", "Failed to create goal");
    } finally {
      setLoading(false);
    }
  }, [createForm, user]);

  const resetCreateForm = useCallback(() => {
    setCreateForm({
      title: "",
      description: "",
      dueDate: new Date(),
      targetValue: "",
      unit: "",
      priority: "medium",
      category: "social",
      collaborators: [],
      collabEmail: ""
    });
    setTempCreateDate(new Date());
  }, []);

  const handleAddProgress = useCallback(async (goalId, value) => {
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;
    
    try {
      const newCurrentValue = (goal.current_value || 0) + value;
      const newProgress = Math.min(Math.round((newCurrentValue / goal.target_value) * 100), 100);
      const isCompleted = newProgress >= 100;

      const newActivity = [...(goal.activity || []), {
        type: "progress",
        actorId: user.id,
        message: `${userName} added ${value} ${goal.unit || ""}`,
        timestamp: new Date().toISOString(),
      }];
      const newContributions = { ...(goal.contributions || {}), [user.id]: (goal.contributions?.[user.id] || 0) + value };

      await supabase.from("shared_goals").update({
        current_value: newCurrentValue,
        contributions: newContributions,
        activity: newActivity,
        updated_at: new Date().toISOString(),
      }).eq("id", goalId);

      const progressPercentage = Math.min(Math.round((newCurrentValue / goal.target_value) * 100), 100);
      
      let message = `${userName} added ${value} ${goal.unit || ""} to "${goal.title}"`;
      let pushTitle = '📈 Progress Update';
      let type = NOTIFICATION_TYPES?.PROGRESS_UPDATE;
      
      if (progressPercentage >= 100) {
        message = `🎉 Goal "${goal.title}" has been 100% completed!`;
        pushTitle = '🎉 Goal Completed!';
        type = NOTIFICATION_TYPES?.GOAL_COMPLETED;
      }

      await sendNotificationToOthers(
        user.id,
        goal.participants || [],
        message,
        { 
          goalId: goal.id,
          goalTitle: goal.title,
          addedValue: value,
          unit: goal.unit,
          progressPercentage
        },
        {
          type,
          pushTitle,
          senderName: userName,
        }
      );

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      Alert.alert("Success!", `Added ${value} ${goal.unit || ""} to the goal!`);
    } catch (error) {
      console.error("Add progress error:", error);
      Alert.alert("Error", "Failed to update progress");
    }
  }, [goals, user]);

  const handleAddComment = useCallback(async (goalId, comment) => {
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;
    
    const commentObj = { 
      authorId: user.id, 
      authorName: userName, 
      text: comment, 
      timestamp: new Date().toISOString(),
      authorPhotoURL: userPhoto
    };
    
    try {
      const { data: cCurrent } = await supabase.from("shared_goals").select("comments").eq("id", goalId).single();
      const updatedComments = [...(cCurrent?.comments || []), commentObj];

      await supabase.from("shared_goals").update({
        comments: updatedComments,
        updated_at: new Date().toISOString(),
      }).eq("id", goalId);

      // ✅ FIX: Immediately sync goals state AND selectedDetailGoal so the 
      // modal shows the sent message without waiting for realtime re-fetch
      setGoals(prev => prev.map(g =>
        g.id === goalId ? { ...g, comments: updatedComments } : g
      ));
      setSelectedDetailGoal(prev =>
        prev?.id === goalId ? { ...prev, comments: updatedComments } : prev
      );

      await sendNotificationToOthers(
        user.id,
        goal.participants || [],
        `${userName} commented on "${goal.title}"`,
        { 
          goalId: goal.id,
          goalTitle: goal.title,
          comment: comment.substring(0, 50) + (comment.length > 50 ? "..." : "")
        },
        {
          type: NOTIFICATION_TYPES?.COMMENT,
          pushTitle: '💬 New Comment',
          senderName: userName,
        }
      );
    } catch (error) {
      console.error("Add comment error:", error);
      Alert.alert("Error", "Failed to post comment. Please try again.");
      throw error; // Re-throw so optimistic UI can revert
    }
  }, [goals, user, userName, userPhoto]);

  const handleAddMilestone = useCallback(async (goalId, title, dueDate = null) => {
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;
    if (!title?.trim()) return;
    
    const milestone = {
      title: title.trim(),
      completed: false,
      created_at: new Date().toISOString(),
      due_date: dueDate ? dueDate.toISOString() : null,
      completedBy: null,
    };
    
    // ✅ FIX: Added try/catch — previously silent failure
    try {
      const { data: gmCurrent } = await supabase.from("shared_goals").select("milestones").eq("id", goalId).single();
      await supabase.from("shared_goals").update({
        milestones: [...(gmCurrent?.milestones || []), milestone],
        updated_at: new Date().toISOString(),
      }).eq("id", goalId);

      await sendNotificationToOthers(
        user.id,
        goal.participants || [],
        `${userName} added milestone: "${title.trim()}"`,
        { 
          goalId: goal.id,
          goalTitle: goal.title,
          milestoneTitle: title.trim()
        },
        {
          type: NOTIFICATION_TYPES?.MILESTONE_ADDED,
          pushTitle: '🎯 New Milestone',
          senderName: userName,
        }
      );

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      console.error("Add milestone error:", error);
      Alert.alert("Error", "Failed to add milestone. Please try again.");
    }
  }, [goals, user]);

  const handleToggleMilestone = useCallback(async (goalId, index) => {
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;
    
    const milestoneList = [...(goal.milestones || [])];
    if (!milestoneList[index]) return;

    const isCompleting = !milestoneList[index].completed;
    
    milestoneList[index] = {
      ...milestoneList[index],
      completed: isCompleting,
      completedBy: isCompleting ? user.id : null,
      completedAt: isCompleting ? new Date().toISOString() : null,
    };

    // Check if this completes the goal
    const completedCount = milestoneList.filter(m => m.completed).length;
    const progress = Math.round((completedCount / milestoneList.length) * 100);
    const isGoalCompleted = progress >= 100;

    // ✅ FIX: Added try/catch — previously silent failure
    try {
      await supabase.from("shared_goals").update({
        milestones: milestoneList,
        updated_at: new Date().toISOString(),
      }).eq("id", goalId);

      if (isCompleting) {
        await sendNotificationToOthers(
          user.id,
          goal.participants || [],
          `${userName} completed milestone: "${milestoneList[index].title}"`,
          { 
            goalId: goal.id,
            goalTitle: goal.title,
            milestoneTitle: milestoneList[index].title
          },
          {
            type: NOTIFICATION_TYPES?.MILESTONE_COMPLETED,
            pushTitle: '🏆 Milestone Completed!',
            senderName: userName,
          }
        );
        
        if (isGoalCompleted) {
          await sendNotificationToOthers(
            user.id,
            goal.participants || [],
            `🎉 Goal "${goal.title}" has been 100% completed!`,
            { 
              goalId: goal.id,
              goalTitle: goal.title
            },
            {
              type: NOTIFICATION_TYPES?.GOAL_COMPLETED,
              pushTitle: '🎉 Goal Completed!',
              senderName: userName,
            }
          );
        }
        
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error("Toggle milestone error:", error);
      Alert.alert("Error", "Failed to update milestone. Please try again.");
    }
  }, [goals, user]);

  const handleEditGoal = useCallback(async (goalId, updatedData) => {
    // ✅ FIX: Added try/catch — previously silent failure
    try {
      await supabase.from("shared_goals").update({
        title: updatedData.title.trim(),
        description: updatedData.description.trim(),
        due_date: updatedData.dueDate ? new Date(updatedData.dueDate).toISOString() : null,
        target_value: parseInt(updatedData.targetValue) || 0,
        unit: updatedData.unit.trim(),
        priority: updatedData.priority,
        category: updatedData.category,
        updated_at: new Date().toISOString(),
      }).eq("id", goalId);

      const goal = goals.find(g => g.id === goalId);
      if (goal) {
        await sendNotificationToOthers(
          user.id,
          goal.participants?.filter(uid => uid !== user.id) || [],
          `✏️ ${userName} updated the goal`,
          { 
            goalId,
            goalTitle: goal.title,
          },
          {
            type: NOTIFICATION_TYPES?.GOAL_UPDATED,
            pushTitle: '✏️ Goal Updated',
            senderName: userName,
          }
        );
      }
    } catch (error) {
      console.error("Edit goal error:", error);
      Alert.alert("Error", "Failed to update goal. Please try again.");
      throw error; // Re-throw so edit form can stay open
    }
  }, [goals, user]);

  const handleDeleteGoal = useCallback(async (goal) => {
    Alert.alert(
      goal.isOwner ? "Delete Shared Goal" : "Remove Shared Goal",
      goal.isOwner 
        ? `Are you sure you want to delete "${goal.title}"?`
        : `Remove "${goal.title}" from your shared goals?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: goal.isOwner ? "Delete" : "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              // ✅ FIX: Delete FIRST, then notify.
              // Previously notifications fired before the delete — if delete
              // failed, participants got a "goal deleted" alert but goal still existed.
              await supabase.from("shared_goals").delete().eq("id", goal.id);

              if (goal.isOwner) {
                await sendNotificationToOthers(
                  user.id,
                  goal.participants?.filter(uid => uid !== user.id) || [],
                  `The goal "${goal.title}" was deleted by ${userName}`,
                  { 
                    goalId: goal.id,
                    goalTitle: goal.title
                  },
                  {
                    type: NOTIFICATION_TYPES?.GOAL_DELETED,
                    pushTitle: '🗑️ Goal Deleted',
                    senderName: userName,
                  }
                );
              }

              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert(goal.isOwner ? "🗑️ Goal deleted" : "✅ Goal removed");
            } catch (error) {
              console.error("Delete error:", error);
              Alert.alert("Error", "Failed to delete goal");
            }
          }
        }
      ]
    );
  }, [user]);

  const handleQuickAdd = async ({ title, dueDate }) => {
    if (!user) return;
    
    try {
      await supabase.from("shared_goals").insert({
        title,
        description: "",
        due_date: dueDate ? dueDate.toISOString() : null,
        owner_id: user.id,
        creator_id: user.id,
        participants: [user.id],
        participant_details: [{
          uid: user.id,
          displayName: userName,
          email: user.email,
          role: "owner",
        }],
        milestones: [],
        comments: [],
        contributions: { [user.id]: 0 },
        current_value: 0,
        target_value: 100,
        unit: "",
        priority: "medium",
        category: "social",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        activity: [{
          type: "created",
          actorId: user.id,
          message: `${userName} created this goal`,
          timestamp: new Date().toISOString(),
        }],
      });
      
      Alert.alert("✨ Success", "Shared goal created! Add collaborators to start collaborating.");
    } catch (error) {
      console.error("Quick add error:", error);
      Alert.alert("Error", "Failed to create shared goal");
    }
  };

  const openGoalDetail = useCallback((goal) => {
    setSelectedDetailGoal(goal);
    setDetailModalVisible(true);
  }, []);

  const clearSearch = () => {
    setSearchQuery("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const canManageRoles = useCallback((goal) => {
    if (!goal || !user?.id) return false;
    return goal.owner_id === user.id || goal.creator_id === user.id;
  }, [user]);

  const handleRemoveParticipant = useCallback(async (goalId, participantUid) => {
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;
    
    try {
      await supabase.from("shared_goals").update({
        participants: (goal.participants || []).filter(uid => uid !== participantUid),
        participant_details: (goal.participant_details || []).filter(p => p.uid !== participantUid),
        updated_at: new Date().toISOString(),
      }).eq("id", goalId);
      
      await sendNotificationToOthers(
        user.id,
        [participantUid],
        `You were removed from the goal "${goal.title}"`,
        { 
          goalId: goal.id,
          goalTitle: goal.title
        },
        {
          type: NOTIFICATION_TYPES?.PARTICIPANT_REMOVED,
          pushTitle: '👋 Removed from Goal',
          senderName: userName,
        }
      );
      
      Alert.alert("Success", "Participant removed");
    } catch (error) {
      console.error("Remove participant error:", error);
      Alert.alert("Error", "Failed to remove participant");
    }
  }, [goals, user]);

  const renderGoalItem = ({ item }) => (
    <SharedGoalCard
      goal={item}
      onPress={openGoalDetail} // ✅ Opens detail modal, NOT edit
      onEdit={() => openGoalDetail(item)} // ✅ Long press still opens detail (can edit from there)
      onDelete={handleDeleteGoal}
      onAddProgress={handleAddProgress}
      onToggleMilestone={handleToggleMilestone}
      isExpanded={expandedGoalId === item.id}
      onExpand={(id) => setExpandedGoalId(expandedGoalId === id ? null : id)}
    />
  );

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
    outputRange: [28, 24],
    extrapolate: 'clamp',
  });

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.backgroundBase} />
      
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline" size={16} color="#9A4B00" />
          <Text style={styles.offlineText}>
            You are offline — changes will sync when you're back online
          </Text>
        </View>
      )}

      <Animated.View style={[styles.header, { height: headerHeight }]}>
        <LinearGradient
          colors={[COLORS.gradientStart, COLORS.gradientEnd]}
          style={StyleSheet.absoluteFill}
        />
        
        <View style={styles.headerContent}>
          <View style={styles.headerTop}>
            <View>
              <Animated.Text style={[styles.headerTitle, { fontSize: headerTitleSize }]}>
                Shared Goals
              </Animated.Text>
              <Text style={styles.headerSubtitle}>
                {goals.length} {goals.length === 1 ? 'goal' : 'goals'}
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
                    color={viewMode === 'list' ? COLORS.shared : COLORS.textTertiary} 
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.viewModeButton, viewMode === 'grid' && styles.viewModeButtonActive]}
                  onPress={() => setViewMode('grid')}
                >
                  <Ionicons 
                    name="grid" 
                    size={20} 
                    color={viewMode === 'grid' ? COLORS.shared : COLORS.textTertiary} 
                  />
                </TouchableOpacity>
              </View>
              
              <NotificationCenter />
              
              <TouchableOpacity 
                style={styles.addButton}
                onPress={() => { resetCreateForm(); setCreateVisible(true); }}
              >
                <LinearGradient
                  colors={[COLORS.shared, COLORS.accentBlush]}
                  style={styles.addButtonGradient}
                >
                  <Ionicons name="add" size={24} color="white" />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
          
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={18} color={COLORS.textTertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search shared goals..."
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
            All
          </Text>
        </TouchableOpacity>
        
        {Object.entries(CATEGORIES).map(([key, config]) => (
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
      
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.shared} />
          <Text style={styles.loadingText}>Loading shared goals...</Text>
        </View>
      ) : filteredGoals.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={64} color={COLORS.textTertiary} />
          <Text style={styles.emptyTitle}>
            {searchQuery ? "No goals found" : "No shared goals yet"}
          </Text>
          <Text style={styles.emptyText}>
            {searchQuery 
              ? "Try a different search term" 
              : "Create a shared goal to collaborate with others"}
          </Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={() => { resetCreateForm(); setCreateVisible(true); }}
          >
            <LinearGradient
              colors={[COLORS.shared, COLORS.accentBlush]}
              style={styles.emptyButtonGradient}
            >
              <Ionicons name="add" size={20} color="white" />
              <Text style={styles.emptyButtonText}>Create Shared Goal</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={filteredGoals}
          renderItem={renderGoalItem}
          keyExtractor={(item) => item.id}
          numColumns={viewMode === 'grid' ? 2 : 1}
          key={viewMode}
          contentContainerStyle={styles.goalsListContent}
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: false }
          )}
          scrollEventThrottle={16}
          ListFooterComponent={<View style={{ height: 100 }} />}
        />
      )}
      
      {viewMode === 'list' && !loading && filteredGoals.length > 0 && (
        <QuickAddBar onAdd={handleQuickAdd} />
      )}
      
      {/* CREATE MODAL */}
      <Modal 
        visible={createVisible} 
        animationType="slide" 
        onRequestClose={() => setCreateVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
          
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalKeyboard}
          >
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <TouchableOpacity
                  onPress={() => { setCreateVisible(false); resetCreateForm(); }}
                  style={styles.modalCancelButton}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                
                <Text style={styles.modalTitle}>Create Shared Goal</Text>
                
                <TouchableOpacity
                  onPress={handleCreateSharedGoal}
                  disabled={loading}
                  style={styles.modalDoneButton}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color={COLORS.shared} />
                  ) : (
                    <Text style={styles.modalDoneText}>Create</Text>
                  )}
                </TouchableOpacity>
              </View>
              
              <ScrollView contentContainerStyle={styles.modalScrollContent}>
                <View style={styles.formSection}>
                  <View style={styles.formLabelRow}>
                    <Text style={styles.formLabel}>Title <Text style={styles.requiredStar}>*</Text></Text>
                    <Text style={styles.formCounter}>{createForm.title.length}/120</Text>
                  </View>
                  <View style={styles.formInputContainer}>
                    <Ionicons name="people-outline" size={20} color={COLORS.shared} />
                    <TextInput 
                      style={styles.formInput}
                      value={createForm.title} 
                      onChangeText={(text) => setCreateForm(prev => ({ ...prev, title: text }))}
                      placeholder="e.g., Team Project, Family Trip"
                      placeholderTextColor={COLORS.placeholder}
                      maxLength={120}
                    />
                  </View>
                </View>

                <View style={styles.formSection}>
                  <View style={styles.formLabelRow}>
                    <Text style={styles.formLabel}>Description</Text>
                    <Text style={styles.formCounter}>{createForm.description.length}/500</Text>
                  </View>
                  <View style={[styles.formInputContainer, styles.formTextArea]}>
                    <Ionicons name="document-text-outline" size={20} color={COLORS.shared} />
                    <TextInput 
                      style={[styles.formInput, { minHeight: 80 }]}
                      value={createForm.description} 
                      onChangeText={(text) => setCreateForm(prev => ({ ...prev, description: text }))}
                      multiline 
                      placeholder="What's this goal about?"
                      placeholderTextColor={COLORS.placeholder}
                      maxLength={500}
                    />
                  </View>
                </View>

                <View style={styles.formRow}>
                  <View style={[styles.formSection, { flex: 1, marginRight: 8 }]}>
                    <Text style={styles.formLabel}>Target</Text>
                    <View style={styles.formInputContainer}>
                      <Ionicons name="flag-outline" size={20} color={COLORS.shared} />
                      <TextInput 
                        style={styles.formInput}
                        value={createForm.targetValue} 
                        onChangeText={(text) => setCreateForm(prev => ({ ...prev, targetValue: text }))}
                        keyboardType="numeric" 
                        placeholder="100"
                        placeholderTextColor={COLORS.placeholder}
                      />
                    </View>
                  </View>
                  <View style={[styles.formSection, { flex: 1, marginLeft: 8 }]}>
                    <Text style={styles.formLabel}>Unit</Text>
                    <View style={styles.formInputContainer}>
                      <Ionicons name="analytics-outline" size={20} color={COLORS.shared} />
                      <TextInput 
                        style={styles.formInput}
                        value={createForm.unit} 
                        onChangeText={(text) => setCreateForm(prev => ({ ...prev, unit: text }))}
                        placeholder="km, books..."
                        placeholderTextColor={COLORS.placeholder}
                      />
                    </View>
                  </View>
                </View>

                <View style={styles.formSection}>
                  <Text style={styles.formLabel}>Due Date & Time</Text>
                  <View style={styles.formDateTimeRow}>
                    <TouchableOpacity
                      style={[styles.formDateTimeButton, { flex: 1, marginRight: 8 }]}
                      onPress={() => {
                        setTempCreateDate(createForm.dueDate || new Date());
                        setShowCreateDatePicker(true);
                      }}
                    >
                      <Ionicons name="calendar-outline" size={20} color={COLORS.shared} />
                      <Text style={styles.formDateTimeText}>
                        {createForm.dueDate.toLocaleDateString('en-US', { 
                          month: 'short', 
                          day: 'numeric', 
                          year: 'numeric' 
                        })}
                      </Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      style={[styles.formDateTimeButton, { flex: 1, marginLeft: 8 }]}
                      onPress={() => {
                        setTempCreateDate(createForm.dueDate || new Date());
                        setShowCreateTimePicker(true);
                      }}
                    >
                      <Ionicons name="time-outline" size={20} color={COLORS.shared} />
                      <Text style={styles.formDateTimeText}>
                        {createForm.dueDate.toLocaleTimeString('en-US', { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {showCreateDatePicker && (
                  <DateTimePicker
                    value={tempCreateDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={handleCreateDateChange}
                    minimumDate={new Date()}
                  />
                )}

                {showCreateTimePicker && (
                  <DateTimePicker
                    value={tempCreateDate}
                    mode="time"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={handleCreateTimeChange}
                  />
                )}

                <View style={styles.formSection}>
                  <Text style={styles.formLabel}>Invite Collaborators</Text>
                  
                  {createForm.collaborators.length > 0 && (
                    <View style={styles.collaboratorList}>
                      {createForm.collaborators.map((collab, idx) => (
                        <View key={collab.uid} style={styles.collaboratorChip}>
                          <View style={styles.collaboratorChipAvatar}>
                            <Text style={styles.collaboratorChipText}>
                              {collab.displayName?.charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <View style={styles.collaboratorChipInfo}>
                            <Text style={styles.collaboratorChipName}>{collab.displayName}</Text>
                            <Text style={styles.collaboratorChipEmail}>{collab.email}</Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => setCreateForm(prev => ({
                              ...prev,
                              collaborators: prev.collaborators.filter(c => c.uid !== collab.uid)
                            }))}
                          >
                            <Ionicons name="close-circle" size={20} color={COLORS.danger} />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                  
                  <View style={styles.inviteRow}>
                    <View style={styles.inviteInputContainer}>
                      <Ionicons name="mail-outline" size={20} color={COLORS.shared} />
                      <TextInput 
                        style={styles.inviteInput}
                        placeholder="collaborator@example.com"
                        placeholderTextColor={COLORS.placeholder}
                        value={createForm.collabEmail}
                        onChangeText={(text) => setCreateForm(prev => ({ ...prev, collabEmail: text }))}
                        keyboardType="email-address"
                        autoCapitalize="none"
                      />
                    </View>
                    <TouchableOpacity 
                      style={styles.inviteButton}
                      onPress={() => handleAddCollaborator(createForm.collabEmail, false)}
                    >
                      <Ionicons name="add" size={24} color="white" />
                    </TouchableOpacity>
                  </View>
                  
                  <Text style={styles.helperText}>
                    Collaborators will receive push notifications when invited
                  </Text>
                </View>

                <View style={styles.formSection}>
                  <Text style={styles.formLabel}>Priority</Text>
                  <View style={styles.priorityGrid}>
                    {Object.keys(PRIORITIES).map((p) => (
                      <TouchableOpacity
                        key={p}
                        style={[
                          styles.priorityCard,
                          createForm.priority === p && styles.priorityCardActive,
                          { borderColor: PRIORITIES[p].color }
                        ]}
                        onPress={() => setCreateForm(prev => ({ ...prev, priority: p }))}
                      >
                        <Ionicons 
                          name={PRIORITIES[p].icon} 
                          size={20} 
                          color={createForm.priority === p ? PRIORITIES[p].color : COLORS.textSecondary} 
                        />
                        <Text style={[
                          styles.priorityCardText,
                          createForm.priority === p && { color: PRIORITIES[p].color }
                        ]}>
                          {p.charAt(0).toUpperCase() + p.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.formSection}>
                  <Text style={styles.formLabel}>Category</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.categoryGrid}>
                      {Object.keys(CATEGORIES).map((cat) => (
                        <TouchableOpacity
                          key={cat}
                          style={[
                            styles.categoryChip,
                            { backgroundColor: createForm.category === cat ? CATEGORIES[cat].color : COLORS.card },
                            createForm.category === cat && { borderWidth: 0 }
                          ]}
                          onPress={() => setCreateForm(prev => ({ ...prev, category: cat }))}
                        >
                          <Ionicons 
                            name={CATEGORIES[cat].icon} 
                            size={16} 
                            color={createForm.category === cat ? 'white' : CATEGORIES[cat].color} 
                          />
                          <Text style={[
                            styles.categoryText,
                            { color: createForm.category === cat ? 'white' : CATEGORIES[cat].color }
                          ]}>
                            {CATEGORIES[cat].label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* DETAIL MODAL */}
      <SharedGoalDetailModal
        visible={detailModalVisible}
        onClose={() => setDetailModalVisible(false)}
        goal={selectedDetailGoal}
        user={user}
        onAddProgress={handleAddProgress}
        onAddComment={handleAddComment}
        onAddMilestone={handleAddMilestone}
        onToggleMilestone={handleToggleMilestone}
        onEditGoal={handleEditGoal}
        onDeleteGoal={handleDeleteGoal}
        onAddCollaborator={handleAddCollaborator}
        onRemoveParticipant={handleRemoveParticipant}
        canManageRoles={canManageRoles}
      />
    </SafeAreaView>
  );
}

/* ================================================================================
   🎨 STYLES - Complete redesign matching all screens
   ================================================================================ */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.backgroundBase,
  },
  
  offlineBanner: { 
    backgroundColor: "#FFF3E5", 
    padding: 12, 
    alignItems: "center",
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8
  },
  offlineText: { color: "#9A4B00", fontWeight: "600", fontSize: 14 },
  
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
  
  addButton: {
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: COLORS.shared,
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
  
  collaboratorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  collaboratorText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  
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
  
  avatar: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: COLORS.card,
  },
  
  expandedContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.cardBorder,
    marginVertical: 12,
  },
  expandedSection: {
    marginBottom: 16,
  },
  
  progressInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressInput: {
    flex: 1,
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  progressButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  progressButtonGradient: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  milestonesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  milestonesTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  milestonesCount: {
    fontSize: 12,
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
    color: COLORS.shared,
    fontWeight: '600',
  },
  milestonesList: {
    gap: 8,
  },
  milestoneItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  milestoneText: {
    fontSize: 14,
    color: COLORS.textPrimary,
    flex: 1,
  },
  milestoneTextCompleted: {
    textDecorationLine: 'line-through',
    color: COLORS.textTertiary,
  },
  viewAllButton: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  viewAllText: {
    fontSize: 12,
    color: COLORS.shared,
    fontWeight: '600',
  },
  addMilestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addMilestoneInput: {
    flex: 1,
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  
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
  
  goalsListContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  
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
    shadowColor: COLORS.shared,
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
  
  notificationButton: {
    position: 'relative',
    padding: 8,
  },
  notificationBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: COLORS.danger,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.card,
  },
  notificationBadgeText: {
    color: COLORS.card,
    fontSize: 10,
    fontWeight: '800',
  },
  notificationHeaderGradient: {
    paddingTop: Platform.OS === 'ios' ? 50 : 18,
    paddingBottom: 16,
  },
  notificationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  notificationTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  notificationSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  markAllReadText: {
    color: COLORS.shared,
    fontSize: 15,
    fontWeight: '600',
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
    backgroundColor: COLORS.card,
  },
  notificationItemUnread: {
    backgroundColor: COLORS.shared + '10',
  },
  notificationIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  notificationContent: {
    flex: 1,
  },
  notificationMessage: {
    fontSize: 14,
    color: COLORS.textPrimary,
    marginBottom: 4,
    lineHeight: 20,
  },
  notificationTime: {
    fontSize: 12,
    color: COLORS.textTertiary,
  },
  notificationDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.shared,
  },
  emptyNotifications: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyNotificationText: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 16,
  },
  emptyNotificationSubtext: {
    fontSize: 14,
    color: COLORS.textTertiary,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalKeyboard: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    maxHeight: height * 0.9,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalCancelButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  modalCancelText: {
    fontSize: 17,
    color: COLORS.shared,
    fontWeight: '400',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  modalDoneButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  modalDoneText: {
    fontSize: 17,
    color: COLORS.shared,
    fontWeight: '600',
  },
  modalScrollContent: {
    paddingBottom: 20,
  },
  
  // Form Elements
  formSection: {
    marginBottom: 20,
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
  formRow: {
    flexDirection: 'row',
    marginBottom: 20,
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
  
  // Priority Grid
  priorityGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.surfaceVariant,
    gap: 6,
  },
  priorityCardActive: {
    backgroundColor: COLORS.card,
    borderWidth: 2,
  },
  priorityCardText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  
  // Category
  categoryGrid: {
    flexDirection: 'row',
    paddingVertical: 4,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    gap: 6,
    marginRight: 8,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600',
  },
  
  // Collaborator Invites
  collaboratorList: {
    marginBottom: 12,
  },
  collaboratorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
  },
  collaboratorChipAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.shared,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  collaboratorChipText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
  },
  collaboratorChipInfo: {
    flex: 1,
  },
  collaboratorChipName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  collaboratorChipEmail: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  inviteInputContainer: {
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
  inviteInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  inviteButton: {
    width: 50,
    height: 50,
    borderRadius: 16,
    backgroundColor: COLORS.shared,
    justifyContent: 'center',
    alignItems: 'center',
  },
  helperText: {
    fontSize: 11,
    color: COLORS.textTertiary,
    marginTop: 8,
    fontStyle: 'italic',
  },
  
  // Detail Modal Styles
  detailModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  detailModalSafeArea: {
    flex: 1,
  },
  detailModalContainer: {
    flex: 1,
    backgroundColor: COLORS.backgroundBase,
  },
  detailModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
    paddingBottom: 16,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
  },
  detailModalBackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    flex: 1,
    textAlign: 'center',
  },
  detailModalContent: {
    padding: 20,
    paddingBottom: 40,
  },
  
  detailTabContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 4,
    marginBottom: 20,
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 3,
  },
  detailTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 6,
  },
  detailTabActive: {
    backgroundColor: COLORS.shared + '15',
  },
  detailTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  detailTabTextActive: {
    color: COLORS.shared,
  },
  
  detailTabContent: {
    gap: 20,
  },
  
  detailOverviewCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 20,
    overflow: 'hidden',
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  detailOverviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  detailOverviewStats: {
    flex: 1,
  },
  detailOverviewTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  detailOverviewValue: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.shared,
    marginBottom: 4,
  },
  detailDescription: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.cardBorder,
  },
  detailDescriptionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailDescriptionText: {
    fontSize: 14,
    color: COLORS.textPrimary,
    lineHeight: 20,
  },
  
  detailMilestonesSummary: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.cardBorder,
  },
  detailMilestonesSummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailMilestonesSummaryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  detailMilestonesSummaryCount: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.shared,
  },
  detailMilestoneBar: {
    height: 6,
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 3,
    overflow: 'hidden',
  },
  detailMilestoneBarFill: {
    height: '100%',
    backgroundColor: COLORS.shared,
    borderRadius: 3,
  },
  
  detailQuickActions: {
    flexDirection: 'row',
    gap: 12,
  },
  detailQuickAction: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  detailQuickActionGradient: {
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  detailQuickActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  
  detailParticipantsCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 20,
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  detailParticipantsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  detailParticipantsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  detailParticipantsCount: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  detailParticipantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
  },
  detailParticipantInfo: {
    flex: 1,
    marginLeft: 12,
  },
  detailParticipantName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  detailParticipantEmail: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  detailParticipantRole: {
    marginRight: 8,
  },
  detailRoleText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  detailRemoveParticipantBtn: {
    padding: 4,
  },
  
  detailProgressCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 20,
    overflow: 'hidden',
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  detailProgressHelpText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 16,
  },
  detailProgressInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  detailProgressInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceVariant,
    overflow: 'hidden',
  },
  detailProgressInput: {
    flex: 1,
    padding: 12,
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  detailUnitText: {
    paddingHorizontal: 12,
    fontSize: 14,
    color: COLORS.shared,
    fontWeight: '600',
  },
  detailProgressAddButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  detailProgressAddButtonDisabled: {
    opacity: 0.5,
  },
  detailProgressAddButtonGradient: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  detailMilestonesCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 20,
    overflow: 'hidden',
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  detailMilestonesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  detailMilestonesCount: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.shared,
  },
  detailMilestoneItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
  },
  detailMilestoneItemCompleted: {
    backgroundColor: COLORS.success + '08',
  },
  detailMilestoneItemPending: {
    opacity: 0.7,
  },
  detailMilestoneCheckbox: {
    marginRight: 12,
  },
  detailMilestoneContent: {
    flex: 1,
  },
  detailMilestoneText: {
    fontSize: 14,
    color: COLORS.textPrimary,
    fontWeight: '500',
  },
  detailMilestoneTextCompleted: {
    textDecorationLine: 'line-through',
    color: COLORS.textTertiary,
  },
  detailMilestoneDate: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  detailPendingText: {
    fontSize: 11,
    color: COLORS.shared,
    fontStyle: 'italic',
    marginTop: 2,
  },
  detailAddMilestoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 16,
  },
  detailAddMilestoneInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  detailAddMilestoneInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  detailAddMilestoneButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.shared,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailAddMilestoneButtonDisabled: {
    backgroundColor: COLORS.textTertiary,
    opacity: 0.5,
  },
  
  detailCommentCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 20,
    overflow: 'hidden',
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  detailCommentInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 8,
  },
  detailCommentInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 20,
    backgroundColor: COLORS.surfaceVariant,
    overflow: 'hidden',
  },
  detailCommentInput: {
    flex: 1,
    padding: 12,
    fontSize: 14,
    color: COLORS.textPrimary,
    maxHeight: 100,
  },
  detailCommentSendButton: {
    backgroundColor: COLORS.shared,
    padding: 10,
    margin: 6,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailCommentSendButtonDisabled: {
    backgroundColor: COLORS.textTertiary,
    opacity: 0.5,
  },
  detailCommentsList: {
    gap: 12,
  },
  detailCommentItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  detailCommentItemPending: {
    opacity: 0.7,
  },
  detailCommentContent: {
    flex: 1,
    backgroundColor: COLORS.card,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  detailCommentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  detailCommentAuthor: {
    fontWeight: '700',
    color: COLORS.textPrimary,
    fontSize: 13,
  },
  detailCommentTime: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  detailCommentText: {
    color: COLORS.textPrimary,
    fontSize: 13,
    lineHeight: 18,
  },
  detailPendingIndicator: {
    marginTop: 4,
  },
  detailEmptyComments: {
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: COLORS.card,
    borderRadius: 16,
  },
  detailEmptyCommentsText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginTop: 12,
  },
  detailEmptyCommentsSubtext: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  
  detailEditForm: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 20,
  },
  detailSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 16,
  },
  detailFormGroup: {
    marginBottom: 16,
  },
  detailFormLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  detailFormInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  detailFormTextArea: {
    alignItems: 'flex-start',
  },
  detailFormInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  detailFormRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  detailFormDateRow: {
    flexDirection: 'row',
    gap: 12,
  },
  detailFormDateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  detailFormDateText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  detailPriorityGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  detailPriorityCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    backgroundColor: COLORS.surfaceVariant,
    gap: 4,
  },
  detailPriorityCardActive: {
    backgroundColor: COLORS.card,
    borderWidth: 2,
  },
  detailPriorityCardText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  detailCategoryGrid: {
    flexDirection: 'row',
    paddingVertical: 4,
  },
  detailCategoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    gap: 6,
    marginRight: 8,
  },
  detailCategoryChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  detailInviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  detailInviteInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  detailInviteInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  detailInviteButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.shared,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailEditActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  detailButton: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  detailCancelButton: {
    backgroundColor: COLORS.surfaceVariant,
    paddingVertical: 14,
    alignItems: 'center',
  },
  detailCancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  detailSaveButton: {
    overflow: 'hidden',
  },
  detailSaveButtonGradient: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  detailSaveButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});