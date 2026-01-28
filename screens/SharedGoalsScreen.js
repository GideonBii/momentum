// ./screens/SharedGoalsScreen.js
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import NetInfo from "@react-native-community/netinfo";
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
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform
} from "react-native";
import { Circle, Svg } from "react-native-svg";
import { useApp } from "../context/AppContext";
import { db } from "../firebaseConfig";
import { 
  sendNotification,
  NOTIFICATION_TYPES,
  requestNotificationPermissions,
  configureNotificationHandler,
  setupNotificationResponseHandler,
  setupNotificationReceivedHandler
} from "../utils/notifications";

const { width } = Dimensions.get('window');

/* -------------------- Theme -------------------- */
const COLORS = {
  background: "#FCF7F5",
  card: "#FFFFFF",
  warm: "#A98467",
  blush: "#D8A39D",
  text: "#3e2a24",
  softText: "#8b6f63",
  border: "#EFE6E2",
  accent: "#F6EDEB",
  success: "#4CAF50",
  error: "#D64545",
  warning: "#FF9800",
  info: "#2196F3",
};

const getSharedGoalsCollectionPath = (appId) =>
  `artifacts/${appId || "default-app-id"}/public/data/sharedGoals`;

/* -------------------- Enhanced Components -------------------- */
const ProgressRing = ({ size = 64, progress = 0, showPercentage = true }) => {
  const radius = (size - 8) / 2;
  const strokeWidth = 6;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;
  const color = progress >= 100 ? COLORS.success : progress > 50 ? COLORS.warm : COLORS.softText;
  
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        <Circle cx={size/2} cy={size/2} r={radius} stroke={COLORS.border} strokeWidth={strokeWidth} fill="none" />
        <Circle cx={size/2} cy={size/2} r={radius} stroke={color} strokeWidth={strokeWidth} fill="none" 
          strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={offset} 
          strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`} />
      </Svg>
      {showPercentage && (
        <Text style={{ position: "absolute", fontWeight: "800", color, fontSize: size * 0.2 }}>
          {Math.round(progress)}%
        </Text>
      )}
    </View>
  );
};

// FIXED: Enhanced DateTimePicker Component
const CustomDateTimePicker = ({ 
  value, 
  onChange, 
  mode = "date",
  minimumDate,
  maximumDate,
  style 
}) => {
  const [show, setShow] = useState(false);
  const [tempDate, setTempDate] = useState(value);

  const onDateChange = (event, selectedDate) => {
    setShow(false);
    if (selectedDate) {
      setTempDate(selectedDate);
      onChange(selectedDate);
    }
  };

  const showPicker = () => {
    setShow(true);
  };

  const formatDate = (date) => {
    if (!date) return 'Select date';
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <View>
      <TouchableOpacity 
        style={[styles.dateButton, style]} 
        onPress={showPicker}
      >
        <Ionicons name="calendar-outline" size={18} color={COLORS.warm} />
        <Text style={{ marginLeft: 8, color: COLORS.text }}>
          {formatDate(value)}
        </Text>
      </TouchableOpacity>
      
      {show && (
        <DateTimePicker
          value={tempDate}
          mode={mode}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onDateChange}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          style={Platform.OS === 'ios' ? { height: 200 } : null}
        />
      )}
    </View>
  );
};

const PriorityBadge = ({ priority }) => {
  const priorityConfig = {
    low: { color: COLORS.success, label: 'Low', icon: 'arrow-down' },
    medium: { color: COLORS.warning, label: 'Medium', icon: 'remove' },
    high: { color: COLORS.error, label: 'High', icon: 'arrow-up' },
    urgent: { color: COLORS.error, label: 'Urgent', icon: 'warning' }
  };

  const config = priorityConfig[priority] || priorityConfig.medium;

  return (
    <View style={[styles.priorityBadge, { backgroundColor: config.color + '20' }]}>
      <Ionicons name={config.icon} size={12} color={config.color} />
      <Text style={[styles.priorityText, { color: config.color }]}>{config.label}</Text>
    </View>
  );
};

const CategoryChip = ({ category, onPress, selected = false }) => {
  const categories = {
    health: { label: 'Health', icon: 'fitness', color: COLORS.success },
    work: { label: 'Work', icon: 'briefcase', color: COLORS.info },
    education: { label: 'Education', icon: 'school', color: COLORS.warning },
    personal: { label: 'Personal', icon: 'person', color: COLORS.blush },
    financial: { label: 'Financial', icon: 'cash', color: COLORS.success },
    social: { label: 'Social', icon: 'people', color: COLORS.warm },
    other: { label: 'Other', icon: 'ellipse', color: COLORS.softText }
  };

  const config = categories[category] || categories.other;

  return (
    <TouchableOpacity 
      style={[
        styles.categoryChip, 
        { backgroundColor: selected ? config.color : COLORS.card },
        selected && { borderColor: config.color }
      ]}
      onPress={onPress}
    >
      <Ionicons 
        name={config.icon} 
        size={16} 
        color={selected ? COLORS.card : config.color } 
      />
      <Text style={[
        styles.categoryText,
        { color: selected ? COLORS.card : config.color }
      ]}>
        {config.label}
      </Text>
    </TouchableOpacity>
  );
};

const UserAvatar = ({ user, size = 28 }) => {
  if (user?.photoURL) {
    return (
      <Image 
        source={{ uri: user.photoURL }} 
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
      { width: size, height: size, borderRadius: size / 2, backgroundColor: COLORS.warm }
    ]}>
      <Text style={{ color: "#fff", fontWeight: "700", fontSize: size * 0.4 }}>
        {(user?.displayName || user?.email || "U").charAt(0).toUpperCase()}
      </Text>
    </View>
  );
};

/* -------------------- Fixed Notification Center Component -------------------- */
const NotificationCenter = () => {
  const { user } = useApp();
  const [notifications, setNotifications] = useState([]);
  const [notificationVisible, setNotificationVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    
    const userRef = doc(db, "users", user.uid);
    const unsub = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        // FIX: Handle both array and object formats
        const notificationsData = data.notifications || [];
        setNotifications(Array.isArray(notificationsData) ? notificationsData : []);
      }
    });

    return () => unsub();
  }, [user]);

  const markAsRead = async (notificationId) => {
    try {
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      
      if (userSnap.exists()) {
        const userData = userSnap.data();
        const updatedNotifications = (userData.notifications || []).map(n => 
          n.id === notificationId ? { ...n, read: true } : n
        );
        
        await updateDoc(userRef, {
          notifications: updatedNotifications
        });
      }
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  const markAllAsRead = async () => {
    try {
      setLoading(true);
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);
      
      if (userSnap.exists()) {
        const userData = userSnap.data();
        const updatedNotifications = (userData.notifications || []).map(n => ({ ...n, read: true }));
        
        await updateDoc(userRef, {
          notifications: updatedNotifications
        });
      }
    } catch (error) {
      console.error("Error marking all as read:", error);
    } finally {
      setLoading(false);
    }
  };

  const clearAllNotifications = async () => {
    try {
      setLoading(true);
      const userRef = doc(db, "users", user.uid);
      
      await updateDoc(userRef, {
        notifications: []
      });
      
      Alert.alert("Success", "All notifications have been cleared.");
    } catch (error) {
      console.error("Error clearing all notifications:", error);
      Alert.alert("Error", "Failed to clear notifications");
    } finally {
      setLoading(false);
    }
  };

  // FIX: Calculate unread count properly
  const unreadCount = notifications.filter(n => n && !n.read).length;

  const formatNotificationTime = (timestamp) => {
    if (!timestamp) return '';
    
    let date;
    if (timestamp.seconds) {
      date = new Date(timestamp.seconds * 1000);
    } else if (timestamp instanceof Date) {
      date = timestamp;
    } else if (typeof timestamp === 'string') {
      date = new Date(timestamp);
    } else {
      date = new Date();
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

  return (
    <>
      <TouchableOpacity 
        style={styles.notificationButton}
        onPress={() => setNotificationVisible(true)}
      >
        <Ionicons name="notifications-outline" size={24} color={COLORS.text} />
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
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
          <View style={styles.notificationHeader}>
            <View>
              <Text style={styles.notificationTitle}>Notifications</Text>
              {unreadCount > 0 && (
                <Text style={styles.notificationSubtitle}>
                  {unreadCount} unread {unreadCount === 1 ? 'notification' : 'notifications'}
                </Text>
              )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              {notifications.length > 0 && (
                <TouchableOpacity onPress={clearAllNotifications} disabled={loading}>
                  <Text style={styles.markAllReadText}>Clear All</Text>
                </TouchableOpacity>
              )}
              {unreadCount > 0 && (
                <TouchableOpacity onPress={markAllAsRead} disabled={loading}>
                  <Text style={styles.markAllReadText}>Mark all read</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setNotificationVisible(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
          </View>

          <FlatList
            data={[...notifications].sort((a, b) => {
              const dateA = a.timestamp ? (a.timestamp.seconds ? new Date(a.timestamp.seconds * 1000) : new Date(a.timestamp)) : new Date(0);
              const dateB = b.timestamp ? (b.timestamp.seconds ? new Date(b.timestamp.seconds * 1000) : new Date(b.timestamp)) : new Date(0);
              return dateB - dateA;
            })}
            keyExtractor={(item, index) => item.id || `notification-${index}`}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.notificationItem,
                  item && !item.read && styles.notificationItemUnread
                ]}
                onPress={() => item && item.id && markAsRead(item.id)}
              >
                <View style={styles.notificationIcon}>
                  {item?.type === "goal_invite" && (
                    <View style={[styles.notificationIconCircle, { backgroundColor: COLORS.warm + '20' }]}>
                      <Ionicons name="person-add" size={20} color={COLORS.warm} />
                    </View>
                  )}
                  {item?.type === "progress_update" && (
                    <View style={[styles.notificationIconCircle, { backgroundColor: COLORS.success + '20' }]}>
                      <Ionicons name="trending-up" size={20} color={COLORS.success} />
                    </View>
                  )}
                  {item?.type === "milestone_completed" && (
                    <View style={[styles.notificationIconCircle, { backgroundColor: COLORS.warning + '20' }]}>
                      <Ionicons name="trophy" size={20} color={COLORS.warning} />
                    </View>
                  )}
                  {item?.type === "goal_joined" && (
                    <View style={[styles.notificationIconCircle, { backgroundColor: COLORS.info + '20' }]}>
                      <Ionicons name="people" size={20} color={COLORS.info} />
                    </View>
                  )}
                  {item?.type === "goal_completed" && (
                    <View style={[styles.notificationIconCircle, { backgroundColor: COLORS.success + '20' }]}>
                      <Ionicons name="checkmark-done" size={20} color={COLORS.success} />
                    </View>
                  )}
                  {!item?.type && (
                    <View style={[styles.notificationIconCircle, { backgroundColor: COLORS.softText + '20' }]}>
                      <Ionicons name="notifications" size={20} color={COLORS.softText} />
                    </View>
                  )}
                </View>
                <View style={styles.notificationContent}>
                  <Text style={styles.notificationMessage}>{item?.message || 'Notification'}</Text>
                  <Text style={styles.notificationTime}>
                    {formatNotificationTime(item?.timestamp)}
                  </Text>
                </View>
                {item && !item.read && <View style={styles.notificationDot} />}
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.emptyNotifications}>
                <Ionicons name="notifications-off-outline" size={64} color={COLORS.border} />
                <Text style={styles.emptyNotificationText}>No notifications yet</Text>
                <Text style={styles.emptyNotificationSubtext}>
                  When you get invited to goals or someone makes progress, you'll see it here!
                </Text>
              </View>
            }
          />
        </SafeAreaView>
      </Modal>
    </>
  );
};

/* -------------------- Screen -------------------- */
export default function SharedGoalsScreen() {
  const { user, appId } = useApp();
  const path = getSharedGoalsCollectionPath(appId);

  // Main state
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Create modal
  const [createVisible, setCreateVisible] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [targetValue, setTargetValue] = useState("");
  const [unit, setUnit] = useState("");
  const [priority, setPriority] = useState("medium");
  const [category, setCategory] = useState("other");

  // Collaborators
  const [collabEmail, setCollabEmail] = useState("");
  const [collaborators, setCollaborators] = useState([]);
  const [collabLoading, setCollabLoading] = useState(false);

  // Detail & Edit
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDueDate, setEditDueDate] = useState(new Date());
  const [editTargetValue, setEditTargetValue] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [editPriority, setEditPriority] = useState("medium");
  const [editCategory, setEditCategory] = useState("other");

  // Enhanced states
  const [commentInput, setCommentInput] = useState("");
  const [progressInput, setProgressInput] = useState("");
  const [milestoneInput, setMilestoneInput] = useState("");
  const [milestoneDueDate, setMilestoneDueDate] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [optimisticComments, setOptimisticComments] = useState([]);
  const [optimisticMilestones, setOptimisticMilestones] = useState([]);
  const [editCollabEmail, setEditCollabEmail] = useState("");
  const [editCollabLoading, setEditCollabLoading] = useState(false);

  // Add state for real-time goal updates
  const [goalRealTimeData, setGoalRealTimeData] = useState(null);
  const [comments, setComments] = useState([]);
  const [milestones, setMilestones] = useState([]);

  // Push Notification Setup
  const [notificationPermission, setNotificationPermission] = useState(false);
  const notificationListener = useRef();
  const responseListener = useRef();

  const animValues = useRef({});
  const slideAnim = useRef(new Animated.Value(0)).current;
  const commentInputRef = useRef(null);

  /* -------------------- FIXED: Enhanced Helpers -------------------- */
  const computeProgress = (goal) => {
    if (!goal) return 0;
    
    // FIX: Handle both target-based and milestone-based progress
    if (goal.targetValue && goal.targetValue > 0) {
      const current = goal.currentValue || 0;
      const progress = (current / goal.targetValue) * 100;
      return Math.min(Math.round(progress * 10) / 10, 100); // Keep 1 decimal
    }
    
    const milestones = goal.milestones || [];
    if (!milestones.length) return 0;
    
    const completedMilestones = milestones.filter(m => m && m.completed).length;
    const progress = (completedMilestones / milestones.length) * 100;
    return Math.round(progress);
  };

  const formatDate = (date) => {
    if (!date) return 'No deadline';
    const d = date.seconds ? new Date(date.seconds * 1000) : new Date(date);
    return d.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const formatCommentDate = (timestamp) => {
    if (!timestamp) return '';
    
    let date;
    if (timestamp.seconds) {
      date = new Date(timestamp.seconds * 1000);
    } else if (timestamp instanceof Date) {
      date = timestamp;
    } else {
      date = new Date(timestamp);
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
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getCategoryIcon = (category) => {
    const icons = {
      health: 'fitness',
      work: 'briefcase',
      education: 'school',
      personal: 'person',
      financial: 'cash',
      social: 'people',
      other: 'ellipse'
    };
    return icons[category] || 'ellipse';
  };

  /* -------------------- Enhanced Notification Functions -------------------- */
  const sendEnhancedGoalInvite = async (goal, newParticipant, inviter) => {
    try {
      // FIX: Added null checks for notification function
      if (!sendNotification) {
        console.warn("sendNotification function not available");
        return false;
      }

      // Notification to the new participant
      await sendNotification(
        [newParticipant.uid],
        `${inviter.displayName || inviter.email} invited you to join "${goal.title}"`,
        { 
          goalId: goal.id,
          goalTitle: goal.title,
          inviterId: inviter.uid,
          inviterName: inviter.displayName || inviter.email
        },
        {
          type: NOTIFICATION_TYPES.GOAL_INVITE,
          priority: "high",
          actionRequired: true,
          pushTitle: '🎯 New Goal Invitation',
          pushBody: `${inviter.displayName || inviter.email} invited you to join "${goal.title}"`,
          sendPush: notificationPermission,
        }
      );

      // Notification to existing participants (excluding inviter)
      const existingParticipants = (goal.participants || []).filter(uid => 
        uid && uid !== inviter.uid && uid !== newParticipant.uid
      );
      
      if (existingParticipants.length > 0) {
        await sendNotification(
          existingParticipants,
          `${newParticipant.displayName} joined "${goal.title}"`,
          { 
            goalId: goal.id,
            goalTitle: goal.title,
            newMemberId: newParticipant.uid,
            newMemberName: newParticipant.displayName
          },
          {
            type: NOTIFICATION_TYPES.GOAL_JOINED,
            priority: "normal",
            pushTitle: '👋 New Member',
            pushBody: `${newParticipant.displayName} joined "${goal.title}"`,
            sendPush: notificationPermission,
          }
        );
      }

      // Send a welcome message in comments
      const welcomeComment = {
        authorId: "system",
        authorName: "System",
        text: `🎉 Welcome ${newParticipant.displayName} to this goal!`,
        timestamp: new Date(),
        isSystemMessage: true
      };

      await updateDoc(doc(db, path, goal.id), {
        comments: arrayUnion(welcomeComment),
        updatedAt: serverTimestamp(),
      });

      return true;
    } catch (error) {
      console.error("Error sending enhanced goal invite:", error);
      return false;
    }
  };

  const sendProgressCelebration = async (goal, addedValue, contributor) => {
    try {
      if (!sendNotification) {
        console.warn("sendNotification function not available");
        return false;
      }

      const progressPercentage = computeProgress(goal);
      
      // Send notifications for milestone achievements
      if (progressPercentage >= 100) {
        await sendNotification(
          goal.participants.filter(id => id !== user?.uid) || [],
          `🎉 Goal "${goal.title}" has been 100% completed! Congratulations everyone!`,
          { 
            goalId: goal.id,
            goalTitle: goal.title
          },
          {
            type: NOTIFICATION_TYPES.GOAL_COMPLETED,
            priority: "high",
            pushTitle: '🎉 Goal Completed!',
            pushBody: `"${goal.title}" is 100% complete!`,
            sendPush: notificationPermission,
          }
        );
      } else if (progressPercentage >= 75) {
        await sendNotification(
          goal.participants.filter(id => id !== user?.uid) || [],
          `🔥 You're 75% of the way to completing "${goal.title}"! Keep going!`,
          { 
            goalId: goal.id,
            goalTitle: goal.title,
            milestone: "75%"
          },
          {
            type: NOTIFICATION_TYPES.GOAL_MILESTONE_REACHED,
            pushTitle: '🔥 75% Complete!',
            pushBody: `"${goal.title}" is almost there!`,
            sendPush: notificationPermission,
          }
        );
      } else if (progressPercentage >= 50) {
        await sendNotification(
          goal.participants.filter(id => id !== user?.uid) || [],
          `✨ Halfway there! "${goal.title}" is 50% complete.`,
          { 
            goalId: goal.id,
            goalTitle: goal.title,
            milestone: "50%"
          },
          {
            type: NOTIFICATION_TYPES.GOAL_MILESTONE_REACHED,
            pushTitle: '✨ Halfway There!',
            pushBody: `"${goal.title}" is 50% complete`,
            sendPush: notificationPermission,
          }
        );
      }

      // Send progress update to all participants (excluding contributor)
      const otherParticipants = (goal.participants || []).filter(uid => uid !== contributor.uid);
      
      if (otherParticipants.length > 0) {
        await sendNotification(
          otherParticipants,
          `${contributor.displayName} added ${addedValue} ${goal.unit || ""} to "${goal.title}"`,
          { 
            goalId: goal.id,
            goalTitle: goal.title,
            addedValue,
            unit: goal.unit,
            contributorId: contributor.uid,
            contributorName: contributor.displayName
          },
          {
            type: NOTIFICATION_TYPES.PROGRESS_UPDATE,
            pushTitle: '📈 Progress Update',
            pushBody: `${contributor.displayName} updated "${goal.title}"`,
            sendPush: notificationPermission,
          }
        );
      }

      return true;
    } catch (error) {
      console.error("Error sending progress celebration:", error);
      return false;
    }
  };

  const sendMilestoneNotification = async (goal, milestone, action, actor) => {
    try {
      if (!sendNotification) {
        console.warn("sendNotification function not available");
        return false;
      }

      const actionText = action === "completed" ? "completed" : "added";
      const emoji = action === "completed" ? "🏆" : "🎯";
      
      await sendNotification(
        goal.participants.filter(id => id !== actor.uid) || [],
        `${emoji} ${actor.displayName} ${actionText} milestone: "${milestone.title}"`,
        { 
          goalId: goal.id,
          goalTitle: goal.title,
          milestoneTitle: milestone.title,
          milestoneIndex: milestone.index,
          actorId: actor.uid,
          actorName: actor.displayName
        },
        {
          type: action === "completed" ? NOTIFICATION_TYPES.MILESTONE_COMPLETED : NOTIFICATION_TYPES.MILESTONE_ADDED,
          pushTitle: action === "completed" ? '🏆 Milestone Completed!' : '🎯 New Milestone',
          pushBody: `${actor.displayName} ${actionText} "${milestone.title}"`,
          sendPush: notificationPermission,
        }
      );

      return true;
    } catch (error) {
      console.error("Error sending milestone notification:", error);
      return false;
    }
  };

  const sendGoalUpdateNotification = async (goal, updater, changes) => {
    try {
      if (!sendNotification) {
        console.warn("sendNotification function not available");
        return false;
      }

      const otherParticipants = (goal.participants || []).filter(uid => uid !== updater.uid);
      
      if (otherParticipants.length > 0) {
        let changeMessage = "";
        if (changes.title) {
          changeMessage = `renamed the goal to "${changes.title}"`;
        } else if (changes.dueDate) {
          changeMessage = "updated the deadline";
        } else if (changes.priority) {
          changeMessage = `changed priority to ${changes.priority}`;
        } else {
          changeMessage = "updated the goal details";
        }

        await sendNotification(
          otherParticipants,
          `✏️ ${updater.displayName} ${changeMessage}`,
          { 
            goalId: goal.id,
            goalTitle: goal.title,
            updaterId: updater.uid,
            updaterName: updater.displayName,
            changes
          },
          {
            type: NOTIFICATION_TYPES.GOAL_UPDATED,
            pushTitle: '✏️ Goal Updated',
            pushBody: `${updater.displayName} ${changeMessage}`,
            sendPush: notificationPermission,
          }
        );
      }

      return true;
    } catch (error) {
      console.error("Error sending goal update notification:", error);
      return false;
    }
  };

  /* -------------------- Network & Data -------------------- */
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setIsOffline(!state.isConnected);
    });
    NetInfo.fetch().then((s) => setIsOffline(!s.isConnected));
    return () => unsub();
  }, []);

  // Initialize Push Notifications
  useEffect(() => {
    const initializePushNotifications = async () => {
      try {
        console.log('🔔 Initializing push notifications...');
        
        // Configure notification handler
        configureNotificationHandler();
        
        // Request permissions
        const hasPermission = await requestNotificationPermissions();
        setNotificationPermission(hasPermission);
        
        if (hasPermission) {
          console.log('✅ Notification permissions granted');
          
          // Setup notification handlers
          notificationListener.current = setupNotificationReceivedHandler();
          responseListener.current = setupNotificationResponseHandler();
        } else {
          console.warn('⚠️ Notification permissions denied');
        }
      } catch (error) {
        console.error('❌ Error initializing push notifications:', error);
      }
    };

    initializePushNotifications();

    // Cleanup
    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    setLoading(true);
    
    // Filter goals where current user is a participant
    const colRef = collection(db, path);
    const q = query(colRef, where("participants", "array-contains", user.uid));

    const unsub = onSnapshot(
      q,
      async (snap) => {
        try {
          const list = await Promise.all(
            snap.docs.map(async (d) => {
              const data = d.data();
              const hasPending = !!d.metadata?.hasPendingWrites;

              if (!data.participantDetails && data.participants) {
                const details = await Promise.all(
                  (data.participants || []).map(async (uid) => {
                    try {
                      const ud = await getDoc(doc(db, "users", uid));
                      if (ud.exists()) {
                        const u = ud.data();
                        return {
                          uid: ud.id,
                          displayName: u.displayName || u.username || u.email,
                          email: u.email,
                          photoURL: u.photoURL || null,
                          role: (data.roles || {})[ud.id] || "member",
                        };
                      }
                    } catch (e) {
                      console.warn("Error fetching user details:", e);
                    }
                    return {
                      uid,
                      displayName: uid.slice(0, 6),
                      email: "",
                      photoURL: null,
                      role: (data.roles || {})[uid] || "member",
                    };
                  })
                );
                data.participantDetails = details;
              }

              // FIX: Calculate progress using helper function
              const prog = computeProgress(data);
              const daysRemaining = getDaysRemaining(data.dueDate);

              return { 
                id: d.id, 
                ...data, 
                progress: prog, 
                daysRemaining,
                _hasPending: hasPending 
              };
            })
          );

          setGoals(list);
        } catch (error) {
          console.error("Error processing goals:", error);
        } finally {
          setLoading(false);
          setRefreshing(false);
        }
      },
      (err) => {
        console.warn("Shared goals snapshot error:", err);
        setLoading(false);
        setRefreshing(false);
      }
    );

    return () => unsub();
  }, [user, appId]);

  /* -------------------- Real-time Goal Updates -------------------- */
  useEffect(() => {
    if (!selectedGoal?.id) return;

    const goalRef = doc(db, path, selectedGoal.id);
    const unsub = onSnapshot(goalRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setGoalRealTimeData(data);
        
        // Update comments and milestones from real-time data
        if (data.comments) {
          setComments([...data.comments].reverse()); // Show newest first
        }
        if (data.milestones) {
          setMilestones(data.milestones);
        }
        
        // Also update the selected goal with latest data
        const prog = computeProgress(data);
        const daysRemaining = getDaysRemaining(data.dueDate);
        
        setSelectedGoal(prev => prev ? {
          ...prev,
          ...data,
          progress: prog,
          daysRemaining,
          id: snap.id
        } : null);
      }
    });

    return () => unsub();
  }, [selectedGoal?.id, path]);

  /* -------------------- Collaborator Functions -------------------- */
  const resolveEmailToUser = async (email) => {
    try {
      const q = query(
        collection(db, "users"),
        where("email", "==", email.trim().toLowerCase())
      );
      const snap = await getDocs(q);
      if (snap.empty) return null;
      const uDoc = snap.docs[0];
      const data = uDoc.data();
      return {
        uid: uDoc.id,
        email: data.email,
        displayName: data.displayName || data.username || data.email.split("@")[0],
        photoURL: data.photoURL || null,
      };
    } catch (e) {
      console.error("resolveEmail error", e);
      return null;
    }
  };

  const handleAddCollaboratorEmail = async () => {
    const email = collabEmail.trim().toLowerCase();
    if (!email) return;
    if (collaborators.some((c) => c.email === email)) {
      Alert.alert("Already added");
      return;
    }
    setCollabLoading(true);
    const resolved = await resolveEmailToUser(email);
    if (!resolved) {
      Alert.alert("No user found", `User with email ${email} not found in users collection.`);
      setCollabLoading(false);
      return;
    }
    setCollaborators((s) => [...s, { ...resolved, role: "editor" }]);
    setCollabEmail("");
    setCollabLoading(false);
  };

  const handleAddCollaboratorToExistingGoal = async () => {
    if (!selectedGoal) return;
    
    const email = editCollabEmail.trim().toLowerCase();
    if (!email) return;
    
    if (selectedGoal.participants?.some((uid) => {
      const participant = selectedGoal.participantDetails?.find(p => p.uid === uid);
      return participant?.email === email;
    })) {
      Alert.alert("Already added", "This user is already a participant.");
      return;
    }

    setEditCollabLoading(true);
    try {
      const resolved = await resolveEmailToUser(email);
      if (!resolved) {
        Alert.alert("No user found", `User with email ${email} not found.`);
        setEditCollabLoading(false);
        return;
      }

      const newParticipant = { 
        uid: resolved.uid, 
        displayName: resolved.displayName, 
        email: resolved.email, 
        photoURL: resolved.photoURL, 
        role: "editor" 
      };

      // Update Firestore
      await updateDoc(doc(db, path, selectedGoal.id), {
        participants: arrayUnion(resolved.uid),
        participantDetails: arrayUnion(newParticipant),
        updatedAt: serverTimestamp(),
        activity: arrayUnion({
          type: "participant_added",
          actorId: user.uid,
          message: `${user.displayName || user.email} added ${resolved.displayName} to the goal`,
          timestamp: new Date()
        })
      });

      // ENHANCED: Send better notifications
      await sendEnhancedGoalInvite(
        selectedGoal,
        {
          uid: resolved.uid,
          displayName: resolved.displayName,
          email: resolved.email
        },
        {
          uid: user.uid,
          displayName: user.displayName || user.email,
          email: user.email
        }
      );

      setEditCollabEmail("");
      Alert.alert(
        "Invitation Sent!",
        `${resolved.displayName} has been invited to the goal! They'll receive a notification.`
      );
    } catch (error) {
      console.error("Error adding collaborator:", error);
      Alert.alert("Error", "Failed to add collaborator");
    } finally {
      setEditCollabLoading(false);
    }
  };

  const handleRemoveCollaboratorLocal = (uidOrEmail) => {
    setCollaborators((s) => s.filter((c) => c.uid !== uidOrEmail && c.email !== uidOrEmail));
  };

  /* -------------------- Create Goal Functions -------------------- */
  const handleCreateSharedGoal = async () => {
    if (!title.trim()) return Alert.alert("Title required");
    if (!collaborators.length) return Alert.alert("Add at least one collaborator");

    setLoading(true);
    try {
      const participantUids = [...new Set([user.uid, ...collaborators.map((c) => c.uid)])];
      const participantDetails = [
        { uid: user.uid, displayName: user.displayName || user.email, email: user.email, photoURL: user.photoURL || null, role: "owner" },
        ...collaborators.map((c) => ({ uid: c.uid, displayName: c.displayName, email: c.email, photoURL: c.photoURL || null, role: c.role || "editor" })),
      ];
      const roles = {};
      participantDetails.forEach((p) => (roles[p.uid] = p.role));

      const payload = {
        title: title.trim(),
        description: description.trim(),
        ownerId: user.uid,
        participants: participantUids,
        participantDetails,
        roles,
        milestones: [],
        comments: [],
        contributions: { [user.uid]: 0 },
        currentValue: 0,
        targetValue: parseInt(targetValue) || 0,
        unit,
        priority,
        category,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        dueDate: dueDate || null,
        activity: [{ type: "created", actorId: user.uid, message: `${user.displayName || user.email} created this goal`, timestamp: new Date() }],
      };

      const col = collection(db, path);
      const docRef = await addDoc(col, payload);

      // Enhanced notifications for all invited collaborators
      const others = participantUids.filter((uid) => uid !== user.uid);
      if (others.length) {
        try {
          await Promise.all(others.map(async (uid) => {
            const collab = participantDetails.find(p => p.uid === uid);
            if (collab && sendNotification) {
              await sendNotification(
                [uid],
                `${user.displayName || user.email} invited you to join "${title.trim()}"`,
                { 
                  goalId: docRef.id,
                  goalTitle: title.trim(),
                  inviterId: user.uid,
                  inviterName: user.displayName || user.email
                },
                {
                  type: NOTIFICATION_TYPES.GOAL_INVITE,
                  priority: "high",
                  actionRequired: true,
                  pushTitle: '🎯 New Goal Invitation',
                  pushBody: `${user.displayName || user.email} invited you to join "${title.trim()}"`,
                  sendPush: notificationPermission,
                }
              );
            }
          }));
        } catch (e) {
          console.error("Notification error:", e);
        }
      }

      setCreateVisible(false);
      resetCreateForm();
      Alert.alert("Success!", "Goal created and invitations sent!");
    } catch (e) {
      console.error("createSharedGoal error", e);
      Alert.alert("Create failed");
    } finally {
      setLoading(false);
    }
  };

  const resetCreateForm = () => {
    setTitle("");
    setDescription("");
    setDueDate(new Date());
    setTargetValue("");
    setUnit("");
    setPriority("medium");
    setCategory("other");
    setCollaborators([]);
    setCollabEmail("");
  };

  /* -------------------- Progress Functions -------------------- */
  const handleAddProgress = async () => {
    if (!selectedGoal || !progressInput.trim()) return;
    const v = parseInt(progressInput);
    if (isNaN(v) || v <= 0) return Alert.alert("Enter a valid positive number");

    setLoading(true);
    try {
      const docRef = doc(db, path, selectedGoal.id);
      const updates = {
        currentValue: (selectedGoal.currentValue || 0) + v,
        [`contributions.${user.uid}`]: (selectedGoal.contributions?.[user.uid] || 0) + v,
        updatedAt: serverTimestamp(),
      };
      await updateDoc(docRef, updates);

      // activity entry
      await updateDoc(docRef, { 
        activity: arrayUnion({ 
          type: "progress", 
          actorId: user.uid, 
          message: `${user.displayName || user.email} added ${v} ${selectedGoal.unit || ""}`, 
          timestamp: new Date() 
        }) 
      });

      // ENHANCED: Send progress celebration
      await sendProgressCelebration(
        selectedGoal,
        v,
        {
          uid: user.uid,
          displayName: user.displayName || user.email,
          email: user.email
        }
      );

      setProgressInput("");
      Alert.alert("Success!", `Added ${v} ${selectedGoal.unit || ""} to the goal!`);
    } catch (e) {
      console.error("addProgress error", e);
      Alert.alert("Failed to update progress");
    } finally {
      setLoading(false);
    }
  };

  /* -------------------- Enhanced Comment Functions with Optimistic Updates -------------------- */
  const handleAddComment = async () => {
    if (!selectedGoal || !commentInput.trim()) return;

    const tempComment = {
      id: `temp-${Date.now()}`,
      authorId: user.uid,
      authorName: user.displayName || user.email,
      text: commentInput.trim(),
      timestamp: new Date(),
      authorPhotoURL: user.photoURL || null,
      _pending: true
    };

    // Optimistic update
    setOptimisticComments(prev => [tempComment, ...prev]);
    setCommentInput("");

    try {
      const comment = { 
        authorId: user.uid, 
        authorName: user.displayName || user.email, 
        text: commentInput.trim(), 
        timestamp: new Date(),
        authorPhotoURL: user.photoURL || null
      };
      
      await updateDoc(doc(db, path, selectedGoal.id), {
        comments: arrayUnion(comment),
        updatedAt: serverTimestamp(),
        activity: arrayUnion({ 
          type: "comment", 
          actorId: user.uid, 
          message: `${user.displayName || user.email} commented`, 
          timestamp: new Date() 
        }),
      });

      // Remove optimistic comment after successful update
      setOptimisticComments(prev => prev.filter(c => c.id !== tempComment.id));

      // Notify other participants
      const others = (selectedGoal.participants || []).filter((uid) => uid !== user.uid);
      if (others.length && sendNotification) {
        try {
          await sendNotification(
            others, 
            `${user.displayName || user.email} commented on "${selectedGoal.title}"`, 
            { 
              goalId: selectedGoal.id,
              goalTitle: selectedGoal.title,
              comment: commentInput.trim().substring(0, 50) + (commentInput.trim().length > 50 ? "..." : "")
            },
            {
              type: NOTIFICATION_TYPES.COMMENT,
              pushTitle: '💬 New Comment',
              pushBody: `${user.displayName || user.email}: ${commentInput.trim().substring(0, 50)}...`,
              sendPush: notificationPermission,
            }
          );
        } catch (e) {
          console.error("Comment notification error:", e);
        }
      }

    } catch (e) {
      console.error("addComment error", e);
      // Remove optimistic comment on error
      setOptimisticComments(prev => prev.filter(c => c.id !== tempComment.id));
      Alert.alert("Error", "Failed to add comment");
    }
  };

  /* -------------------- Enhanced Milestone Functions with Due Dates -------------------- */
  const handleAddMilestone = async () => {
    if (!selectedGoal || !milestoneInput.trim()) return;

    const tempMilestone = {
      id: `temp-${Date.now()}`,
      title: milestoneInput.trim(),
      completed: false,
      createdAt: new Date(),
      dueDate: milestoneDueDate,
      completedBy: null,
      _pending: true
    };

    // Optimistic update
    setOptimisticMilestones(prev => [...prev, tempMilestone]);
    
    const originalInput = milestoneInput;
    const originalDueDate = milestoneDueDate;
    
    setMilestoneInput("");
    setMilestoneDueDate(null);

    try {
      const milestone = { 
        title: originalInput.trim(), 
        completed: false, 
        createdAt: new Date(), 
        dueDate: originalDueDate,
        completedBy: null 
      };
      
      await updateDoc(doc(db, path, selectedGoal.id), {
        milestones: arrayUnion(milestone),
        updatedAt: serverTimestamp(),
        activity: arrayUnion({ 
          type: "milestone_added", 
          actorId: user.uid, 
          message: `${user.displayName || user.email} added a milestone`, 
          timestamp: new Date() 
        }),
      });

      // Remove optimistic milestone after successful update
      setOptimisticMilestones(prev => prev.filter(m => m.id !== tempMilestone.id));

      // Enhanced notification for new milestone
      await sendMilestoneNotification(
        selectedGoal,
        { title: originalInput.trim(), index: (selectedGoal.milestones?.length || 0) },
        "added",
        {
          uid: user.uid,
          displayName: user.displayName || user.email,
          email: user.email
        }
      );

      Alert.alert("Success", "Milestone added!");
    } catch (e) {
      console.error("addMilestone error", e);
      // Remove optimistic milestone on error
      setOptimisticMilestones(prev => prev.filter(m => m.id !== tempMilestone.id));
      Alert.alert("Error", "Failed to add milestone");
    }
  };

  const handleToggleMilestone = async (mIndex) => {
    if (!selectedGoal) return;
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, path, selectedGoal.id));
      if (!snap.exists()) throw new Error("Goal gone");
      const data = snap.data();
      const milestoneList = data.milestones || [];
      if (!milestoneList[mIndex]) throw new Error("Milestone missing");

      const updated = milestoneList.slice();
      updated[mIndex] = {
        ...updated[mIndex],
        completed: !updated[mIndex].completed,
        completedBy: !updated[mIndex].completed ? user.uid : null,
        completedAt: !updated[mIndex].completed ? new Date() : null,
      };

      await updateDoc(doc(db, path, selectedGoal.id), {
        milestones: updated,
        updatedAt: serverTimestamp(),
        activity: arrayUnion({ 
          type: "milestone_toggle", 
          actorId: user.uid, 
          message: `${user.displayName || user.email} ${updated[mIndex].completed ? "completed" : "uncompleted"} a milestone`, 
          timestamp: new Date() 
        }),
      });

      // Enhanced notification for milestone completion
      if (updated[mIndex].completed && sendNotification) {
        await sendMilestoneNotification(
          data,
          { title: updated[mIndex].title, index: mIndex },
          "completed",
          {
            uid: user.uid,
            displayName: user.displayName || user.email,
            email: user.email
          }
        );
      }
    } catch (e) {
      console.error("toggleMilestone error", e);
      Alert.alert("Error", "Failed to update milestone");
    } finally {
      setLoading(false);
    }
  };

  /* -------------------- Participant Management -------------------- */
  const canManageRoles = (goalDoc) => {
    if (!goalDoc) return false;
    const role = (goalDoc.roles || {})[user.uid] || (goalDoc.ownerId === user.uid ? "owner" : "member");
    return role === "owner" || role === "admin";
  };

  const handleRemoveParticipant = async (uid) => {
    if (!selectedGoal) return;
    if (!canManageRoles(selectedGoal)) return Alert.alert("Unauthorized");
    if (uid === selectedGoal.ownerId) return Alert.alert("Cannot remove owner");
    
    Alert.alert("Remove Participant", "Are you sure you want to remove this participant?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await updateDoc(doc(db, path, selectedGoal.id), {
              participants: arrayRemove(uid),
              participantDetails: (selectedGoal.participantDetails || []).filter((p) => p.uid !== uid),
              updatedAt: serverTimestamp(),
              activity: arrayUnion({ 
                type: "participant_removed", 
                actorId: user.uid, 
                message: `${user.displayName || user.email} removed a participant`, 
                timestamp: new Date() 
              }),
            });
            
            // Send notification to removed participant
            if (sendNotification) {
              await sendNotification(
                [uid],
                `You were removed from the goal "${selectedGoal.title}"`,
                { 
                  goalId: selectedGoal.id,
                  goalTitle: selectedGoal.title
                },
                {
                  type: NOTIFICATION_TYPES.PARTICIPANT_REMOVED,
                  pushTitle: '👋 Removed from Goal',
                  pushBody: `You were removed from "${selectedGoal.title}"`,
                  sendPush: notificationPermission,
                }
              );
            }
            
            Alert.alert("Success", "Participant removed");
          } catch (e) {
            console.error("remove participant", e);
            Alert.alert("Error", "Failed to remove participant");
          }
        }
      }
    ]);
  };

  /* -------------------- Delete Goal -------------------- */
  const handleDeleteGoal = async () => {
    if (!selectedGoal) return;
    if (selectedGoal.ownerId !== user.uid) return Alert.alert("Only owner can delete");
    
    Alert.alert("Delete Goal", "Are you sure? This action cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            // Notify all participants before deletion
            const participants = selectedGoal.participants || [];
            if (sendNotification) {
              await Promise.all(participants.map(async (uid) => {
                if (uid !== user.uid) {
                  await sendNotification(
                    [uid],
                    `The goal "${selectedGoal.title}" was deleted by ${user.displayName || user.email}`,
                    { 
                      goalId: selectedGoal.id,
                      goalTitle: selectedGoal.title
                    },
                    {
                      type: NOTIFICATION_TYPES.GOAL_DELETED,
                      pushTitle: '🗑️ Goal Deleted',
                      pushBody: `"${selectedGoal.title}" was deleted`,
                      sendPush: notificationPermission,
                    }
                  );
                }
              }));
            }
            
            await deleteDoc(doc(db, path, selectedGoal.id));
            setDetailVisible(false);
            setSelectedGoal(null);
            Alert.alert("Success", "Goal deleted successfully");
          } catch (e) {
            console.error("delete goal", e);
            Alert.alert("Error", "Delete failed");
          }
        }
      }
    ]);
  };

  /* -------------------- Enhanced Edit Functionality -------------------- */
  const openGoalDetail = (goal) => {
    setSelectedGoal(goal);
    setEditTitle(goal.title);
    setEditDescription(goal.description || "");
    setEditDueDate(goal.dueDate ? (goal.dueDate.seconds ? new Date(goal.dueDate.seconds * 1000) : new Date(goal.dueDate)) : new Date());
    setEditTargetValue(goal.targetValue?.toString() || "");
    setEditUnit(goal.unit || "");
    setEditPriority(goal.priority || "medium");
    setEditCategory(goal.category || "other");
    setIsEditing(false);
    setActiveTab('overview');
    setOptimisticComments([]);
    setOptimisticMilestones([]);
    
    // Initialize comments and milestones from the goal
    setComments(goal.comments ? [...goal.comments].reverse() : []);
    setMilestones(goal.milestones || []);
    
    setDetailVisible(true);
  };

  const handleEditToggle = () => {
    setIsEditing(!isEditing);
    Animated.timing(slideAnim, {
      toValue: isEditing ? 0 : 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const handleSaveEdit = async () => {
    if (!selectedGoal || !editTitle.trim()) {
      Alert.alert("Error", "Title is required");
      return;
    }

    setLoading(true);
    try {
      const changes = {};
      if (editTitle !== selectedGoal.title) changes.title = editTitle;
      if (editDescription !== selectedGoal.description) changes.description = editDescription;
      if (editDueDate !== selectedGoal.dueDate) changes.dueDate = editDueDate;
      if (editPriority !== selectedGoal.priority) changes.priority = editPriority;
      if (editCategory !== selectedGoal.category) changes.category = editCategory;

      const updates = {
        title: editTitle.trim(),
        description: editDescription.trim(),
        dueDate: editDueDate,
        targetValue: parseInt(editTargetValue) || 0,
        unit: editUnit,
        priority: editPriority,
        category: editCategory,
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, path, selectedGoal.id), updates);

      // Add to activity log
      await updateDoc(doc(db, path, selectedGoal.id), {
        activity: arrayUnion({ 
          type: "goal_updated", 
          actorId: user.uid, 
          message: `${user.displayName || user.email} updated goal details`, 
          timestamp: new Date() 
        })
      });

      // Send update notification if there are changes
      if (Object.keys(changes).length > 0 && sendNotification) {
        await sendGoalUpdateNotification(
          selectedGoal,
          {
            uid: user.uid,
            displayName: user.displayName || user.email,
            email: user.email
          },
          changes
        );
      }

      setIsEditing(false);
      Alert.alert("Success", "Goal updated successfully");
    } catch (error) {
      console.error("Error updating goal:", error);
      Alert.alert("Error", "Failed to update goal");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEdit = () => {
    if (selectedGoal) {
      setEditTitle(selectedGoal.title);
      setEditDescription(selectedGoal.description || "");
      setEditDueDate(selectedGoal.dueDate ? (selectedGoal.dueDate.seconds ? new Date(selectedGoal.dueDate.seconds * 1000) : new Date(selectedGoal.dueDate)) : new Date());
      setEditTargetValue(selectedGoal.targetValue?.toString() || "");
      setEditUnit(selectedGoal.unit || "");
      setEditPriority(selectedGoal.priority || "medium");
      setEditCategory(selectedGoal.category || "other");
    }
    setIsEditing(false);
  };

  /* -------------------- Enhanced UI Components -------------------- */
  const AvatarsInline = ({ details, max = 4, size = 28 }) => {
    const arr = details || [];
    const show = arr.slice(0, max);
    const remaining = arr.length - max;
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
              backgroundColor: COLORS.blush,
              width: size,
              height: size,
              borderRadius: size / 2
            }
          ]}>
            <Text style={{ color: "#fff", fontSize: size * 0.3 }}>+{remaining}</Text>
          </View>
        )}
      </View>
    );
  };

  const GoalCard = ({ item }) => {
    if (!animValues.current[item.id]) animValues.current[item.id] = new Animated.Value(0);
    
    React.useEffect(() => {
      Animated.timing(animValues.current[item.id], { 
        toValue: 1, 
        duration: 360, 
        useNativeDriver: true 
      }).start();
    }, []);

    const daysRemaining = item.daysRemaining;
    const isOverdue = daysRemaining !== null && daysRemaining < 0;
    const isDueSoon = daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= 7;

    return (
      <Animated.View style={{ 
        opacity: animValues.current[item.id], 
        transform: [{ 
          translateY: animValues.current[item.id].interpolate({ 
            inputRange: [0,1], 
            outputRange: [8,0] 
          }) 
        }] 
      }}>
        <TouchableOpacity 
          style={[
            styles.card,
            isOverdue && styles.overdueCard,
            isDueSoon && styles.dueSoonCard
          ]} 
          activeOpacity={0.9} 
          onPress={() => openGoalDetail(item)}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                <PriorityBadge priority={item.priority} />
              </View>
              
              {item.description ? (
                <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
              ) : null}

              <View style={styles.cardMeta}>
                <View style={styles.metaItem}>
                  <Ionicons name="people" size={14} color={COLORS.softText} />
                  <Text style={styles.metaText}>{item.participants?.length || 1}</Text>
                </View>
                
                {item.dueDate && (
                  <View style={styles.metaItem}>
                    <Ionicons 
                      name="calendar" 
                      size={14} 
                      color={isOverdue ? COLORS.error : isDueSoon ? COLORS.warning : COLORS.softText} 
                    />
                    <Text style={[
                      styles.metaText,
                      isOverdue && { color: COLORS.error },
                      isDueSoon && { color: COLORS.warning }
                    ]}>
                      {formatDate(item.dueDate)}
                    </Text>
                  </View>
                )}

                {item.category && item.category !== 'other' && (
                  <View style={styles.metaItem}>
                    <Ionicons name={getCategoryIcon(item.category)} size={14} color={COLORS.softText} />
                    <Text style={styles.metaText}>{item.category}</Text>
                  </View>
                )}
              </View>

              <View style={styles.cardFooter}>
                <AvatarsInline details={item.participantDetails || []} />
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ color: COLORS.softText, fontSize: 12 }}>
                    {item.participants?.length || 1} members
                  </Text>
                  {item._hasPending && (
                    <Text style={{ color: COLORS.softText, fontSize: 11 }}>Syncing…</Text>
                  )}
                </View>
              </View>
            </View>
            
            {/* FIX: Show progress ring with calculated progress */}
            <ProgressRing size={64} progress={item.progress || 0} />
          </View>

          {item.milestones?.length > 0 && (
            <View style={styles.milestoneProgress}>
              <Text style={styles.milestoneProgressText}>
                {item.milestones.filter(m => m && m.completed).length}/{item.milestones.length} milestones
              </Text>
              <View style={styles.milestoneBar}>
                <View 
                  style={[
                    styles.milestoneProgressFill,
                    { 
                      width: `${(item.milestones.filter(m => m && m.completed).length / item.milestones.length) * 100}%` 
                    }
                  ]} 
                />
              </View>
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderEditForm = () => (
    <Animated.View 
      style={[
        styles.editForm,
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
      <Text style={styles.sectionTitle}>Edit Goal Details</Text>
      
      <Text style={styles.label}>Title *</Text>
      <TextInput 
        style={styles.input} 
        value={editTitle} 
        onChangeText={setEditTitle} 
        placeholder="Goal title" 
      />

      <Text style={styles.label}>Description</Text>
      <TextInput 
        style={[styles.input, {height: 80}]} 
        value={editDescription} 
        onChangeText={setEditDescription} 
        multiline 
        placeholder="Describe your goal..." 
      />

      <View style={styles.row}>
        <View style={{flex: 1}}>
          <Text style={styles.label}>Target</Text>
          <TextInput 
            style={styles.input} 
            value={editTargetValue} 
            onChangeText={setEditTargetValue} 
            keyboardType="numeric" 
            placeholder="100" 
          />
        </View>
        <View style={{flex: 1}}>
          <Text style={styles.label}>Unit</Text>
          <TextInput 
            style={styles.input} 
            value={editUnit} 
            onChangeText={setEditUnit} 
            placeholder="km, books..." 
          />
        </View>
      </View>

      {/* FIX: Use CustomDateTimePicker for better UX */}
      <Text style={styles.label}>Due Date</Text>
      <CustomDateTimePicker 
        value={editDueDate} 
        onChange={setEditDueDate}
        minimumDate={new Date()}
      />

      <Text style={styles.label}>Priority</Text>
      <View style={styles.priorityOptions}>
        {['low', 'medium', 'high', 'urgent'].map((p) => (
          <TouchableOpacity
            key={p}
            style={[
              styles.priorityOption,
              editPriority === p && styles.priorityOptionSelected
            ]}
            onPress={() => setEditPriority(p)}
          >
            <Text style={[
              styles.priorityOptionText,
              editPriority === p && styles.priorityOptionTextSelected
            ]}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Category</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoriesScroll}>
        <View style={styles.categoriesContainer}>
          {['health', 'work', 'education', 'personal', 'financial', 'social', 'other'].map((cat) => (
            <CategoryChip
              key={cat}
              category={cat}
              selected={editCategory === cat}
              onPress={() => setEditCategory(cat)}
            />
          ))}
        </View>
      </ScrollView>

      {/* Add Collaborators Section in Edit Form */}
      {canManageRoles(selectedGoal) && (
        <>
          <Text style={styles.sectionTitle}>Add Collaborators</Text>
          <Text style={styles.label}>Invite by Email</Text>
          <View style={styles.inputGroup}>
            <TextInput 
              style={[styles.input, {flex: 1}]} 
              value={editCollabEmail} 
              onChangeText={setEditCollabEmail}
              placeholder="friend@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TouchableOpacity 
              style={[
                styles.addBtn,
                (!editCollabEmail.trim() || editCollabLoading) && { opacity: 0.5 }
              ]}
              onPress={handleAddCollaboratorToExistingGoal}
              disabled={!editCollabEmail.trim() || editCollabLoading}
            >
              {editCollabLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="person-add" size={20} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        </>
      )}

      <View style={styles.editActions}>
        <TouchableOpacity 
          style={[styles.btn, styles.cancelBtn]} 
          onPress={handleCancelEdit}
        >
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.btn, styles.saveBtn]} 
          onPress={handleSaveEdit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>Save Changes</Text>
          )}
        </TouchableOpacity>
      </View>
    </Animated.View>
  );

  const renderProgressSection = () => (
    <View>
      {/* Progress Input Card */}
      <View style={styles.progressInputCard}>
        <Text style={styles.sectionTitle}>Add Progress</Text>
        <Text style={styles.progressHelpText}>
          Current: {selectedGoal?.currentValue || 0} {selectedGoal?.unit} • 
          Target: {selectedGoal?.targetValue || 0} {selectedGoal?.unit}
        </Text>
        
        <View style={styles.progressInputContainer}>
          <View style={styles.progressInputWrapper}>
            <TextInput 
              style={styles.progressInput} 
              value={progressInput} 
              onChangeText={setProgressInput} 
              placeholder="Enter amount" 
              keyboardType="numeric" 
            />
            <Text style={styles.unitText}>{selectedGoal?.unit}</Text>
          </View>
          <TouchableOpacity 
            style={[
              styles.progressAddButton,
              (!progressInput.trim() || isNaN(parseInt(progressInput))) && styles.progressAddButtonDisabled
            ]} 
            onPress={handleAddProgress}
            disabled={!progressInput.trim() || isNaN(parseInt(progressInput))}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Ionicons name="add-circle" size={24} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Milestones Section */}
      <View style={styles.milestonesCard}>
        <Text style={styles.sectionTitle}>Milestones</Text>
        <Text style={styles.progressHelpText}>
          Track smaller achievements towards your goal
        </Text>
        
        <View style={styles.milestoneInputContainer}>
          <TextInput 
            style={styles.milestoneInput} 
            value={milestoneInput} 
            onChangeText={setMilestoneInput} 
            placeholder="Add a new milestone..." 
          />
          {/* FIX: Use CustomDateTimePicker for milestone due date */}
          <CustomDateTimePicker 
            value={milestoneDueDate || new Date()}
            onChange={setMilestoneDueDate}
            minimumDate={new Date()}
            style={styles.milestoneDateButton}
          />
          <TouchableOpacity 
            style={[
              styles.milestoneAddButton,
              !milestoneInput.trim() && styles.milestoneAddButtonDisabled
            ]} 
            onPress={handleAddMilestone}
            disabled={!milestoneInput.trim()}
          >
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {milestoneDueDate && (
          <Text style={styles.milestoneDueDateText}>
            Due: {milestoneDueDate.toLocaleDateString()}
          </Text>
        )}

        <View style={styles.milestonesList}>
          {/* Optimistic milestones */}
          {optimisticMilestones.map((m, index) => (
            <View key={m.id} style={[styles.milestoneItem, styles.milestoneItemPending]}>
              <View style={styles.milestoneCheckbox}>
                <ActivityIndicator size="small" color={COLORS.softText} />
              </View>
              <View style={styles.milestoneContent}>
                <Text style={styles.milestoneText}>{m.title}</Text>
                {m.dueDate && (
                  <Text style={styles.milestoneDate}>
                    Due: {m.dueDate.toLocaleDateString()}
                  </Text>
                )}
                <Text style={styles.pendingText}>Adding...</Text>
              </View>
            </View>
          ))}
          
          {/* Actual milestones from real-time data */}
          {milestones.map((m, index) => (
            <TouchableOpacity 
              key={index} 
              style={[
                styles.milestoneItem,
                m && m.completed && styles.milestoneItemCompleted
              ]} 
              onPress={() => handleToggleMilestone(index)}
            >
              <View style={styles.milestoneCheckbox}>
                <Ionicons 
                  name={m && m.completed ? "checkmark-circle" : "ellipse-outline"} 
                  size={24} 
                  color={m && m.completed ? COLORS.success : COLORS.softText} 
                />
              </View>
              <View style={styles.milestoneContent}>
                <Text style={[
                  styles.milestoneText,
                  m && m.completed && styles.milestoneTextCompleted
                ]}>
                  {m?.title || 'Unnamed Milestone'}
                </Text>
                <View style={styles.milestoneMeta}>
                  {m?.dueDate && (
                    <Text style={styles.milestoneDate}>
                      Due: {formatDate(m.dueDate)}
                    </Text>
                  )}
                  {m?.completedAt && (
                    <Text style={styles.milestoneDate}>
                      Completed {formatCommentDate(m.completedAt)}
                    </Text>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );

  const renderDiscussionSection = () => (
    <View>
      <View style={styles.commentInputCard}>
        <Text style={styles.sectionTitle}>Discussion</Text>
        <View style={styles.commentInputContainer}>
          <UserAvatar user={user} size={36} />
          <View style={styles.commentInputWrapper}>
            <TextInput 
              ref={commentInputRef}
              style={styles.commentInput} 
              value={commentInput} 
              onChangeText={setCommentInput} 
              placeholder="Write a comment..." 
              multiline
              onSubmitEditing={handleAddComment}
            />
            <TouchableOpacity 
              style={[
                styles.commentSendButton,
                !commentInput.trim() && styles.commentSendButtonDisabled
              ]} 
              onPress={handleAddComment}
              disabled={!commentInput.trim()}
            >
              <Ionicons name="send" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.commentsList}>
        {/* Optimistic comments */}
        {optimisticComments.map((comment) => (
          <View key={comment.id} style={[styles.commentItem, styles.commentItemPending]}>
            <UserAvatar user={comment} size={40} />
            <View style={styles.commentContent}>
              <View style={styles.commentHeader}>
                <Text style={styles.commentAuthor}>{comment.authorName}</Text>
                <Text style={styles.commentTime}>Sending...</Text>
              </View>
              <Text style={styles.commentText}>{comment.text}</Text>
              <ActivityIndicator size="small" color={COLORS.softText} style={styles.pendingIndicator} />
            </View>
          </View>
        ))}
        
        {/* Actual comments from real-time data */}
        {comments.map((c, idx) => (
          <View key={idx} style={styles.commentItem}>
            <UserAvatar user={c} size={40} />
            <View style={styles.commentContent}>
              <View style={styles.commentHeader}>
                <Text style={styles.commentAuthor}>{c.authorName}</Text>
                <Text style={styles.commentTime}>
                  {formatCommentDate(c.timestamp)}
                </Text>
              </View>
              <Text style={styles.commentText}>{c.text}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );

  const renderOverview = () => (
    <View>
      {/* Progress & Summary */}
      <View style={styles.summaryCard}>
        <ProgressRing size={80} progress={selectedGoal ? computeProgress(selectedGoal) : 0} />
        <View style={styles.summaryContent}>
          <Text style={styles.summaryTitle}>Progress Overview</Text>
          <Text style={styles.summaryValue}>
            {selectedGoal?.currentValue || 0} / {selectedGoal?.targetValue || 0} {selectedGoal?.unit}
          </Text>
          <Text style={styles.summaryDescription}>{selectedGoal?.description}</Text>
          
          <View style={styles.summaryMeta}>
            <View style={styles.metaItem}>
              <Ionicons name="calendar-outline" size={16} color={COLORS.softText} />
              <Text style={styles.metaText}>
                {selectedGoal?.dueDate ? formatDate(selectedGoal.dueDate) : 'No deadline'}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="flag-outline" size={16} color={COLORS.softText} />
              <Text style={styles.metaText}>{selectedGoal?.priority}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity style={styles.quickAction} onPress={() => setActiveTab('progress')}>
          <Ionicons name="trending-up" size={24} color={COLORS.warm} />
          <Text style={styles.quickActionText}>Add Progress</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickAction} onPress={() => setActiveTab('discussion')}>
          <Ionicons name="chatbubble-outline" size={24} color={COLORS.warm} />
          <Text style={styles.quickActionText}>Discussion</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickAction} onPress={handleEditToggle}>
          <Ionicons name="create-outline" size={24} color={COLORS.warm} />
          <Text style={styles.quickActionText}>Edit Goal</Text>
        </TouchableOpacity>
      </View>

      {/* Participants Section */}
      <Text style={styles.sectionTitle}>Participants</Text>
      <View style={styles.participantsList}>
        {(selectedGoal?.participantDetails || []).map((p, idx) => (
          <View key={idx} style={styles.participantItem}>
            <UserAvatar user={p} size={44} />
            <View style={styles.participantInfo}>
              <Text style={styles.participantName}>{p.displayName}</Text>
              <Text style={styles.participantEmail}>{p.email}</Text>
            </View>
            <View style={styles.participantRole}>
              <Text style={[
                styles.roleText,
                p.role === 'owner' && { color: COLORS.warm },
                p.role === 'admin' && { color: COLORS.info }
              ]}>
                {p.role}
              </Text>
            </View>
            {canManageRoles(selectedGoal) && p.uid !== selectedGoal.ownerId && (
              <TouchableOpacity 
                style={styles.removeParticipantBtn}
                onPress={() => handleRemoveParticipant(p.uid)}
              >
                <Ionicons name="close-circle" size={20} color={COLORS.error} />
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>
    </View>
  );

  /* -------------------- Render -------------------- */
  return (
    <SafeAreaView style={styles.screen}>
      {/* Offline banner */}
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline" size={16} color="#9A4B00" />
          <Text style={styles.offlineText}>
            {isOffline ? "You are offline — changes will sync when you're back online" : "Back online - syncing changes"}
          </Text>
        </View>
      )}

      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Group Goals</Text>
          <Text style={styles.subtitle}>Collaborate and achieve together</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <NotificationCenter />
          <TouchableOpacity style={styles.plus} onPress={() => setCreateVisible(true)}>
            <Ionicons name="add" size={22} color={COLORS.card} />
          </TouchableOpacity>
        </View>
      </View>

      {loading && !refreshing ? (
        <ActivityIndicator style={{ marginTop: 28 }} size="large" color={COLORS.warm} />
      ) : (
        <FlatList 
          data={goals.slice().sort((a,b) => (b.updatedAt?.seconds||0) - (a.updatedAt?.seconds||0))}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({item}) => <GoalCard item={item} />}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={64} color={COLORS.border} />
              <Text style={styles.emptyTitle}>No shared goals yet</Text>
              <Text style={styles.emptyText}>
                {collaborators.length > 0 
                  ? "Create or get invited to a shared goal to start collaborating!" 
                  : "Create your first shared goal or ask to join an existing one!"}
              </Text>
              <TouchableOpacity 
                style={styles.createFirstButton}
                onPress={() => setCreateVisible(true)}
              >
                <Text style={styles.createFirstButtonText}>Create Shared Goal</Text>
              </TouchableOpacity>
            </View>
          }
          refreshing={refreshing}
          onRefresh={() => setRefreshing(true)}
        />
      )}

      {/* Enhanced Detail Modal */}
      <Modal visible={detailVisible} animationType="slide" onRequestClose={() => setDetailVisible(false)}>
        <SafeAreaView style={{flex: 1, backgroundColor: COLORS.background}}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setDetailVisible(false)}>
              <Ionicons name="arrow-back" size={24} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle} numberOfLines={1}>
              {isEditing ? 'Edit Goal' : selectedGoal?.title}
            </Text>
            <View style={{flexDirection: 'row', gap: 12}}>
              {!isEditing && selectedGoal?.ownerId === user.uid && (
                <TouchableOpacity onPress={handleEditToggle}>
                  <Ionicons name="create-outline" size={22} color={COLORS.warm} />
                </TouchableOpacity>
              )}
              {!isEditing && selectedGoal?.ownerId === user.uid && (
                <TouchableOpacity onPress={handleDeleteGoal}>
                  <Ionicons name="trash-outline" size={22} color={COLORS.error} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          <ScrollView 
            contentContainerStyle={styles.modalContent}
            showsVerticalScrollIndicator={false}
          >
            {isEditing ? (
              renderEditForm()
            ) : (
              <>
                {/* Tab Navigation */}
                <View style={styles.tabContainer}>
                  {['overview', 'progress', 'discussion'].map((tab) => (
                    <TouchableOpacity
                      key={tab}
                      style={[
                        styles.tab,
                        activeTab === tab && styles.tabActive
                      ]}
                      onPress={() => setActiveTab(tab)}
                    >
                      <Text style={[
                        styles.tabText,
                        activeTab === tab && styles.tabTextActive
                      ]}>
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Tab Content */}
                {activeTab === 'overview' && renderOverview()}
                {activeTab === 'progress' && renderProgressSection()}
                {activeTab === 'discussion' && renderDiscussionSection()}
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Create Modal */}
      <Modal visible={createVisible} animationType="slide" onRequestClose={() => setCreateVisible(false)}>
        <SafeAreaView style={{flex:1, backgroundColor:COLORS.background}}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Create Group Goal</Text>
            <TouchableOpacity onPress={() => setCreateVisible(false)}>
              <Ionicons name="close" size={26} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.label}>Title *</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Run 100km together" />

            <Text style={styles.label}>Description</Text>
            <TextInput style={[styles.input, {height:80}]} value={description} onChangeText={setDescription} multiline placeholder="Describe goal..." />

            <View style={{flexDirection:'row', gap:12, marginTop:8}}>
              <View style={{flex:1}}>
                <Text style={styles.label}>Target</Text>
                <TextInput style={styles.input} value={targetValue} onChangeText={setTargetValue} keyboardType="numeric" placeholder="100" />
              </View>
              <View style={{flex:1}}>
                <Text style={styles.label}>Unit</Text>
                <TextInput style={styles.input} value={unit} onChangeText={setUnit} placeholder="km, books..." />
              </View>
            </View>

            {/* FIX: Use CustomDateTimePicker in create modal */}
            <Text style={styles.label}>Due date</Text>
            <CustomDateTimePicker 
              value={dueDate} 
              onChange={setDueDate}
              minimumDate={new Date()}
            />

            <Text style={styles.label}>Add collaborators (email)</Text>
            <View style={{flexDirection:'row', alignItems:'center', gap:8}}>
              <TextInput style={[styles.input,{flex:1}]} placeholder="person@example.com" value={collabEmail} onChangeText={setCollabEmail} autoCapitalize="none" />
              <TouchableOpacity style={styles.addBtn} onPress={handleAddCollaboratorEmail}>
                {collabLoading ? <ActivityIndicator color="#fff" /> : <Ionicons name="add" size={20} color="#fff" />}
              </TouchableOpacity>
            </View>

            <ScrollView horizontal style={{marginTop:12}}>
              {collaborators.map(c=>(
                <View key={c.uid} style={{alignItems:'center', marginRight:8}}>
                  <UserAvatar user={c} size={36} />
                  <Text style={{fontSize:12, marginTop: 4}} numberOfLines={1}>{c.displayName}</Text>
                  <TouchableOpacity onPress={()=>handleRemoveCollaboratorLocal(c.uid)} style={{marginTop:4}}>
                    <Ionicons name="close-circle" size={18} color={COLORS.error} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>

            <View style={{flexDirection:'row', justifyContent:'space-between', marginTop:20}}>
              <TouchableOpacity style={[styles.btn,{backgroundColor:COLORS.border}]} onPress={()=>{setCreateVisible(false); resetCreateForm();}}>
                <Text>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn,{backgroundColor:COLORS.warm}]} onPress={handleCreateSharedGoal}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={{color:'#fff'}}>Create</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

/* -------------------- Enhanced Styles -------------------- */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  offlineBanner: { 
    backgroundColor: "#FFF3E5", 
    padding: 12, 
    alignItems: "center",
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8
  },
  offlineText: { color: "#9A4B00", fontWeight: "600", fontSize: 14 },
  headerRow: { 
    paddingHorizontal: 16, 
    paddingTop: 20, 
    paddingBottom: 8, 
    flexDirection: "row", 
    justifyContent: "space-between", 
    alignItems: "center" 
  },
  title: { fontSize: 28, fontWeight: "800", color: COLORS.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 16, color: COLORS.softText, marginTop: 4 },
  plus: { 
    backgroundColor: COLORS.warm, 
    padding: 12, 
    borderRadius: 20,
    shadowColor: COLORS.warm,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4
  },
  
  // Card Styles
  card: { 
    backgroundColor: COLORS.card, 
    borderRadius: 16, 
    padding: 16, 
    marginBottom: 12, 
    borderWidth: 1, 
    borderColor: COLORS.border, 
    shadowColor: "#000", 
    shadowOpacity: 0.08, 
    shadowOffset: { width: 0, height: 4 }, 
    shadowRadius: 12, 
    elevation: 3 
  },
  overdueCard: {
    borderLeftWidth: 4,
    borderLeftColor: COLORS.error,
  },
  dueSoonCard: {
    borderLeftWidth: 4,
    borderLeftColor: COLORS.warning,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  cardTitle: { fontSize: 17, fontWeight: "700", color: COLORS.text, flex: 1, marginRight: 8 },
  cardDesc: { fontSize: 14, color: COLORS.softText, marginBottom: 12, lineHeight: 20 },
  cardMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: { fontSize: 12, color: COLORS.softText },
  
  // Avatar
  avatar: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: COLORS.card,
  },
  
  // Priority & Category
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  priorityText: { fontSize: 11, fontWeight: '600' },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: 6,
    marginRight: 8,
  },
  categoryText: { fontSize: 12, fontWeight: '600' },
  
  // Milestone Progress
  milestoneProgress: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  milestoneProgressText: {
    fontSize: 12,
    color: COLORS.softText,
    marginBottom: 6,
  },
  milestoneBar: {
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  milestoneProgressFill: {
    height: '100%',
    backgroundColor: COLORS.warm,
    borderRadius: 2,
  },
  
  // Modal Styles
  modalHeader: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: COLORS.text, flex: 1, textAlign: 'center' },
  modalContent: { padding: 16, paddingBottom: 40 },
  
  // Edit Form
  editForm: {
    backgroundColor: COLORS.card,
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  priorityOptions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  priorityOption: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  priorityOptionSelected: {
    backgroundColor: COLORS.warm,
    borderColor: COLORS.warm,
  },
  priorityOptionText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
  priorityOptionTextSelected: {
    color: COLORS.card,
  },
  categoriesScroll: {
    marginTop: 8,
  },
  categoriesContainer: {
    flexDirection: 'row',
    paddingVertical: 4,
  },
  editActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  inputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  
  // Tab Styles
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: COLORS.warm,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.softText,
  },
  tabTextActive: {
    color: COLORS.card,
  },
  
  // Summary Card
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.card,
    padding: 16,
    borderRadius: 16,
    marginBottom: 20,
  },
  summaryContent: {
    flex: 1,
    marginLeft: 16,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.warm,
    marginBottom: 8,
  },
  summaryDescription: {
    fontSize: 14,
    color: COLORS.softText,
    marginBottom: 12,
    lineHeight: 20,
  },
  summaryMeta: {
    flexDirection: 'row',
    gap: 16,
  },
  
  // Quick Actions
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  quickAction: {
    alignItems: 'center',
    backgroundColor: COLORS.card,
    padding: 16,
    borderRadius: 12,
    flex: 1,
    marginHorizontal: 6,
  },
  quickActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 8,
    textAlign: 'center',
  },

  // Progress Section
  progressInputCard: {
    backgroundColor: COLORS.card,
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  progressHelpText: {
    fontSize: 13,
    color: COLORS.softText,
    marginBottom: 16,
  },
  progressInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.background,
    overflow: 'hidden',
  },
  progressInput: {
    flex: 1,
    padding: 12,
    fontSize: 16,
    color: COLORS.text,
  },
  unitText: {
    paddingHorizontal: 12,
    fontSize: 14,
    color: COLORS.softText,
    fontWeight: '600',
  },
  progressAddButton: {
    backgroundColor: COLORS.warm,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressAddButtonDisabled: {
    backgroundColor: COLORS.softText,
    opacity: 0.5,
  },

  // Milestones Section
  milestonesCard: {
    backgroundColor: COLORS.card,
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  milestoneInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  milestoneInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    backgroundColor: COLORS.background,
  },
  milestoneDateButton: {
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: COLORS.background,
  },
  milestoneAddButton: {
    backgroundColor: COLORS.warm,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  milestoneAddButtonDisabled: {
    backgroundColor: COLORS.softText,
    opacity: 0.5,
  },
  milestoneDueDateText: {
    fontSize: 13,
    color: COLORS.warm,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  milestonesList: {
    gap: 8,
  },
  milestoneItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: COLORS.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  milestoneItemCompleted: {
    backgroundColor: COLORS.success + '10',
    borderColor: COLORS.success + '30',
  },
  milestoneItemPending: {
    opacity: 0.7,
    backgroundColor: COLORS.background + '80',
  },
  milestoneCheckbox: {
    marginRight: 12,
  },
  milestoneContent: {
    flex: 1,
  },
  milestoneText: {
    fontSize: 15,
    color: COLORS.text,
    fontWeight: '500',
  },
  milestoneTextCompleted: {
    textDecorationLine: 'line-through',
    color: COLORS.softText,
  },
  milestoneMeta: {
    marginTop: 4,
  },
  milestoneDate: {
    fontSize: 12,
    color: COLORS.softText,
  },
  pendingText: {
    fontSize: 11,
    color: COLORS.softText,
    fontStyle: 'italic',
    marginTop: 2,
  },

  // Discussion Section
  commentInputCard: {
    backgroundColor: COLORS.card,
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
  },
  commentInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  commentInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    backgroundColor: COLORS.background,
    overflow: 'hidden',
  },
  commentInput: {
    flex: 1,
    padding: 12,
    fontSize: 15,
    color: COLORS.text,
    maxHeight: 100,
  },
  commentSendButton: {
    backgroundColor: COLORS.warm,
    padding: 10,
    margin: 6,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentSendButtonDisabled: {
    backgroundColor: COLORS.softText,
    opacity: 0.5,
  },
  commentsList: {
    gap: 12,
  },
  commentItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  commentItemPending: {
    opacity: 0.7,
  },
  commentContent: {
    flex: 1,
    backgroundColor: COLORS.card,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  commentAuthor: {
    fontWeight: '700',
    color: COLORS.text,
    fontSize: 14,
  },
  commentTime: {
    fontSize: 11,
    color: COLORS.softText,
  },
  commentText: {
    color: COLORS.text,
    fontSize: 14,
    lineHeight: 20,
  },
  pendingIndicator: {
    marginTop: 4,
  },

  // Participants
  participantsList: {
    marginBottom: 20,
  },
  participantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  participantInfo: {
    flex: 1,
    marginLeft: 12,
  },
  participantName: {
    fontWeight: '600',
    color: COLORS.text,
    fontSize: 15,
  },
  participantEmail: {
    fontSize: 13,
    color: COLORS.softText,
    marginTop: 2,
  },
  participantRole: {
    marginRight: 12,
  },
  roleText: {
    fontSize: 12,
    color: COLORS.warm,
    fontWeight: '600',
  },
  removeParticipantBtn: {
    padding: 4,
  },
  
  // Notification Styles
  notificationButton: {
    position: 'relative',
    padding: 8,
    marginRight: 12,
  },
  notificationBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: COLORS.error,
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
  notificationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  notificationTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  notificationSubtitle: {
    fontSize: 14,
    color: COLORS.softText,
    marginTop: 2,
  },
  markAllReadText: {
    color: COLORS.warm,
    fontSize: 14,
    fontWeight: '600',
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  notificationItemUnread: {
    backgroundColor: COLORS.accent,
  },
  notificationIcon: {
    marginRight: 12,
  },
  notificationIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationContent: {
    flex: 1,
  },
  notificationMessage: {
    fontSize: 14,
    color: COLORS.text,
    marginBottom: 4,
  },
  notificationTime: {
    fontSize: 12,
    color: COLORS.softText,
  },
  notificationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.warm,
  },
  emptyNotifications: {
    alignItems: 'center',
    padding: 40,
  },
  emptyNotificationText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 16,
  },
  emptyNotificationSubtext: {
    fontSize: 14,
    color: COLORS.softText,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  
  // Common Elements
  label: { fontWeight: "700", color: COLORS.text, marginTop: 16, marginBottom: 6 },
  input: { backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 12, fontSize: 16 },
  dateButton: { 
    flexDirection: "row", 
    alignItems: "center", 
    padding: 12, 
    borderRadius: 10, 
    borderWidth: 1, 
    borderColor: COLORS.border, 
    backgroundColor: COLORS.card 
  },
  addBtn: { backgroundColor: COLORS.warm, padding: 12, borderRadius: 10 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  cancelBtn: { backgroundColor: COLORS.border },
  cancelBtnText: { color: COLORS.text, fontWeight: '600' },
  saveBtn: { backgroundColor: COLORS.warm },
  saveBtnText: { color: COLORS.card, fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 12 },
  
  // Empty State
  emptyState: { alignItems: 'center', padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginTop: 16 },
  emptyText: { fontSize: 14, color: COLORS.softText, marginTop: 8, textAlign: 'center' },
  createFirstButton: {
    backgroundColor: COLORS.warm,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 16,
  },
  createFirstButtonText: {
    color: COLORS.card,
    fontWeight: '600',
    fontSize: 16,
  },
});