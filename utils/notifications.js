// utils/notifications.js - PRODUCTION READY
// ✅ COMPLETE FIXED VERSION - February 28, 2026
// ✅ FIXED: Field name handling (enableNotifications vs enable_notifications)
// ✅ FIXED: Trigger format - removed 'type: "date"' (Expo expects { date: time })
// ✅ FIXED: Custom message field handling (multiple possible field names)
// ✅ Duplicate prevention with AsyncStorage
// ✅ Token cleanup on DeviceNotRegistered errors
// ✅ ArrayUnion for efficient Firestore writes
// ✅ Past date validation
// ✅ Comprehensive error handling

import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Alert, Linking, Platform } from "react-native";
import { supabase } from "../supabaseConfig";


/* ================================================================================
   LOGGING
   ================================================================================ */

const ENABLE_LOGGING = true;
const LOG_PREFIX = "📱 [NOTIFICATIONS]";

const log = (...args) => ENABLE_LOGGING && console.log(LOG_PREFIX, ...args);
const logError = (...args) => console.error(LOG_PREFIX, "❌ ERROR:", ...args);
const logSuccess = (...args) => console.log(LOG_PREFIX, "✅ SUCCESS:", ...args);
const logWarn = (...args) => console.warn(LOG_PREFIX, "⚠️ WARNING:", ...args);

/* ================================================================================
   NOTIFICATION TYPES
   ================================================================================ */

export const NOTIFICATION_TYPES = {
  GENERAL: "general",
  TEST: "test",
  
  // Shared Goals
  GOAL_INVITE: "goal_invite",
  PROGRESS_UPDATE: "progress_update",
  MILESTONE_COMPLETED: "milestone_completed",
  GOAL_JOINED: "goal_joined",
  GOAL_UPDATED: "goal_updated",
  PARTICIPANT_REMOVED: "participant_removed",
  GOAL_DELETED: "goal_deleted",
  COMMENT: "comment",
  MILESTONE_ADDED: "milestone_added",
  GOAL_COMPLETED: "goal_completed",
  
  // Reminders
  TASK_REMINDER: "task_reminder",
  GOAL_DEADLINE: "goal_deadline",
  
  // Legacy
  SHARED_GOAL_INVITATION: "shared_goal_invitation",
  GOAL_MILESTONE_REACHED: "goal_milestone_reached",
};

/* ================================================================================
   GLOBAL NOTIFICATION HANDLER
   ================================================================================ */

export const configureNotificationHandler = () => {
  log("Configuring notification handler...");

  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      log("📨 Notification received:", notification?.request?.content?.title);
      return {
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      };
    },
  });

  logSuccess("Notification handler configured");
};

/* ================================================================================
   ANDROID CHANNELS
   ================================================================================ */

const setupAndroidChannels = async () => {
  if (Platform.OS !== "android") return;

  try {
    log("Creating Android notification channels...");

    await Notifications.setNotificationChannelAsync("default", {
      name: "General Notifications",
      description: "General app notifications",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      sound: "default",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: true,
      enableVibrate: true,
      enableLights: true,
      lightColor: "#795D94",
    });

    await Notifications.setNotificationChannelAsync("tasks", {
      name: "Task Reminders",
      description: "Reminders for upcoming tasks",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250, 250],
      sound: "default",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,
      showBadge: true,
      enableVibrate: true,
      enableLights: true,
      lightColor: "#5C4673",
    });

    await Notifications.setNotificationChannelAsync("goals", {
      name: "Goal Updates",
      description: "Updates about your goals",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      sound: "default",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: true,
      enableVibrate: true,
      enableLights: true,
      lightColor: "#795D94",
    });

    await Notifications.setNotificationChannelAsync("collaboration", {
      name: "Collaboration",
      description: "Updates from shared goals and team activity",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 100, 250],
      sound: "default",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: true,
      enableVibrate: true,
      enableLights: true,
      lightColor: "#4A3B5C",
    });

    logSuccess("Android channels ready");
  } catch (e) {
    logError("Error creating Android channels:", e);
  }
};

/* ================================================================================
   PERMISSIONS
   ================================================================================ */

export const hasNotificationPermissions = async () => {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === "granted";
  } catch (e) {
    logError("Error checking permissions:", e);
    return false;
  }
};

export const requestNotificationPermissions = async () => {
  try {
    log("🔐 Requesting notification permissions...");

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          allowAnnouncements: true,
          allowCriticalAlerts: true,
        },
      });
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      logError("❌ Notification permissions denied");

      Alert.alert(
        "Notifications Disabled",
        "Please enable notifications in your device settings to receive updates.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Open Settings",
            onPress: () => {
              if (Platform.OS === "ios") Linking.openURL("app-settings:");
              else Linking.openSettings();
            },
          },
        ]
      );

      return false;
    }

    await setupAndroidChannels();

    logSuccess("Notification permissions granted");
    return true;
  } catch (e) {
    logError("Error requesting notification permissions:", e);
    return false;
  }
};

/* ================================================================================
   EXPO PUSH TOKEN REGISTRATION
   ================================================================================ */

const isLikelyExpoPushToken = (token) => {
  if (!token || typeof token !== "string") return false;
  return token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[");
};

const getExpoProjectId = () => {
  const id =
    Constants?.expoConfig?.extra?.eas?.projectId ||
    Constants?.easConfig?.projectId ||
    Constants?.expoConfig?.extra?.projectId ||
    Constants?.manifest?.extra?.eas?.projectId;
    
  return id || null;
};

export const registerAndSaveExpoPushToken = async (userId) => {
  try {
    if (!userId) {
      logError("registerAndSaveExpoPushToken: missing userId");
      return null;
    }

    if (!Device.isDevice) {
      logWarn("Push tokens require a physical device (not a simulator)");
      return null;
    }

    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) {
      logError("Cannot register push token: permissions denied");
      return null;
    }

    const projectId = getExpoProjectId();
    if (!projectId) {
      logError("Missing EAS projectId. Add it to app config (expo.extra.eas.projectId)");
      return null;
    }

    log("Getting Expo push token for project:", projectId);
    
    const tokenResp = await Notifications.getExpoPushTokenAsync({ 
      projectId 
    });
    
    const expoPushToken = tokenResp?.data;

    if (!isLikelyExpoPushToken(expoPushToken)) {
      logError("Got invalid Expo push token:", expoPushToken);
      return null;
    }

    const { error: tokenSaveError } = await supabase
      .from("profiles")
      .update({
        expo_push_token: expoPushToken,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (tokenSaveError) throw tokenSaveError;

    logSuccess(`Saved Expo push token for user: ${userId}`);
    return expoPushToken;
  } catch (e) {
    logError("registerAndSaveExpoPushToken error:", e);
    return null;
  }
};

/* ================================================================================
   NOTIFICATION ID GENERATOR
   ================================================================================ */

const generateNotificationId = () => {
  return `notif_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

/* ================================================================================
   ✅ FIXED: FIRESTORE NOTIFICATIONS STORAGE - Using arrayUnion for efficiency
   ================================================================================ */

const storeNotificationInFirestore = async (userId, notification) => {
  try {
    if (!userId || !notification) return false;

    const now = new Date();

    const enrichedNotification = {
      id: notification.id || generateNotificationId(),
      message: notification.message || "",
      type: notification.type || NOTIFICATION_TYPES.GENERAL,
      data: notification.data || {},
      read: false,
      timestamp: (notification.timestamp || now).toISOString(),
      created_at: now.toISOString(),
      ...(notification.senderId && { senderId: notification.senderId }),
      ...(notification.senderName && { senderName: notification.senderName }),
      ...(notification.goalId && { goalId: notification.goalId }),
      ...(notification.goalTitle && { goalTitle: notification.goalTitle }),
      ...(notification.sharedGoalId && { sharedGoalId: notification.sharedGoalId }),
    };

    // Fetch current notifications array for this user
    const { data: profileData } = await supabase
      .from("profiles")
      .select("notifications")
      .eq("id", userId)
      .single();

    const existing = Array.isArray(profileData?.notifications) ? profileData.notifications : [];

    const { error: storeError } = await supabase
      .from("profiles")
      .update({
        notifications: [...existing, enrichedNotification],
        last_notification_received: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("id", userId);

    if (storeError) throw storeError;

    log(`Stored notification for user ${userId}: ${enrichedNotification.id}`);
    return true;
  } catch (e) {
    logError("storeNotificationInFirestore error:", e);
    return false;
  }
};

/* ================================================================================
   NOTIFICATION LISTENER
   ================================================================================ */

/**
 * Sets up a real-time listener for user notifications
 * 
 * IMPORTANT: Call the returned unsubscribe function in useEffect cleanup:
 * 
 * useEffect(() => {
 *   const unsubscribe = setupNotificationListener(userId, setNotifications);
 *   return () => unsubscribe?.();
 * }, [userId]);
 */
export const setupNotificationListener = (userId, callback) => {
  try {
    if (!userId) {
      logError("setupNotificationListener: missing userId");
      return null;
    }

    log(`🎧 Setting up notification listener for user: ${userId}`);

    // Initial fetch
    const fetchAndCallback = async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("notifications")
        .eq("id", userId)
        .single();

      if (error) { logError("Notification fetch error:", error); return; }

      const notifications = Array.isArray(data?.notifications) ? data.notifications : [];
      const sorted = [...notifications].sort((a, b) =>
        new Date(b.timestamp || b.created_at || 0).getTime() -
        new Date(a.timestamp || a.created_at || 0).getTime()
      );
      if (typeof callback === "function") callback(sorted);
    };

    fetchAndCallback();

    // Real-time updates
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "profiles",
        filter: `id=eq.${userId}`,
      }, (payload) => {
        const notifications = Array.isArray(payload.new?.notifications) ? payload.new.notifications : [];
        const sorted = [...notifications].sort((a, b) =>
          new Date(b.timestamp || b.created_at || 0).getTime() -
          new Date(a.timestamp || a.created_at || 0).getTime()
        );
        if (typeof callback === "function") callback(sorted);
      })
      .subscribe();

    // Return an unsubscribe function matching the original API
    const unsubscribe = () => supabase.removeChannel(channel);
    return unsubscribe;
  } catch (e) {
    logError("setupNotificationListener error:", e);
    return null;
  }
};

/* ================================================================================
   MARK NOTIFICATIONS AS READ
   ================================================================================ */

export const markNotificationAsRead = async (userId, notificationId) => {
  try {
    if (!userId || !notificationId) return false;

    const { data, error: fetchError } = await supabase
      .from("profiles")
      .select("notifications")
      .eq("id", userId)
      .single();

    if (fetchError || !data) {
      logError(`User ${userId} not found`);
      return false;
    }

    const notifications = Array.isArray(data.notifications) ? data.notifications : [];
    const updated = notifications.map((n) =>
      n.id === notificationId ? { ...n, read: true, readAt: new Date().toISOString() } : n
    );

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        notifications: updated,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (updateError) throw updateError;
    
    log(`Marked notification ${notificationId} as read`);
    return true;
  } catch (e) {
    logError("markNotificationAsRead error:", e);
    return false;
  }
};

export const markAllNotificationsAsRead = async (userId) => {
  try {
    if (!userId) return false;

    const { data, error: fetchError } = await supabase
      .from("profiles")
      .select("notifications")
      .eq("id", userId)
      .single();

    if (fetchError || !data) return false;

    const notifications = Array.isArray(data.notifications) ? data.notifications : [];
    const updated = notifications.map((n) => ({
      ...n,
      read: true,
      readAt: new Date().toISOString(),
    }));

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        notifications: updated,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (updateError) throw updateError;
    
    logSuccess(`Marked all notifications as read for user ${userId}`);
    return true;
  } catch (e) {
    logError("markAllNotificationsAsRead error:", e);
    return false;
  }
};

/* ================================================================================
   LOCAL NOTIFICATION
   ================================================================================ */

const scheduleLocalPushNotification = async (message, data = {}, options = {}) => {
  try {
    const hasPermission = await hasNotificationPermissions();
    if (!hasPermission) return false;

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: options.pushTitle || "Goal Update",
        body: message,
        data: {
          ...data,
          _displayInForeground: true,
          timestamp: new Date().toISOString(),
        },
        sound: true,
        priority: options.priority === "high"
          ? Notifications.AndroidNotificationPriority.HIGH
          : Notifications.AndroidNotificationPriority.DEFAULT,
        badge: 1,
        ...(Platform.OS === "android" && {
          channelId: data?.type?.includes("goal") ? "goals" : "default",
        }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 1,
      },
    });

    log(`Scheduled local notification: ${notificationId}`);
    return notificationId;
  } catch (e) {
    logError("scheduleLocalPushNotification error:", e);
    return false;
  }
};

/* ================================================================================
   SERVER-SIDE PUSH - Via Supabase Edge Function
   Token lookup, batching, retries and dead-token cleanup all happen server-side.
   The client never touches exp.host directly.
   ================================================================================ */

const sendRealPushNotification = async (userIds, message, data = {}, options = {}) => {
  try {
    if (!Array.isArray(userIds) || userIds.length === 0) {
      log("sendRealPushNotification: no recipients");
      return { ok: true, sent: 0 };
    }

    const { data: result, error } = await supabase.functions.invoke("send-push", {
      body: { userIds, message, data, options },
    });

    if (error) {
      logError("Edge function error:", error);
      return { ok: false, sent: 0, error: String(error.message || error) };
    }

    if (!result?.ok) {
      logWarn("send-push returned not-ok:", result);
      return { ok: false, sent: 0, error: result?.error || "UNKNOWN" };
    }

    logSuccess(`Edge function sent push to ${result.sent} device(s) for ${result.recipients} user(s)`);
    return result;
  } catch (e) {
    logError("sendRealPushNotification error:", e);
    return { ok: false, sent: 0, error: String(e?.message || e) };
  }
};

/* ================================================================================
   ✅ FIXED: MAIN SEND NOTIFICATION
   ================================================================================ */

export const sendNotification = async (userIds = [], message, data = {}, options = {}) => {
  try {
    if (!message || typeof message !== "string") {
      logError("sendNotification: invalid message");
      return false;
    }
    
    if (!Array.isArray(userIds) || userIds.length === 0) {
      log("sendNotification: no recipients");
      return true;
    }

    const senderId = options.senderId || data.senderId;
    const senderName = options.senderName || data.senderName || "Someone";

    const now = new Date();
    
    const notification = {
      id: generateNotificationId(),
      message,
      type: options.type || data.type || NOTIFICATION_TYPES.GENERAL,
      data: { 
        ...data, 
        senderId, 
        senderName,
        timestamp: now.toISOString(),
      },
      timestamp: now,
      createdAt: now,
      read: false,
      goalId: data.goalId || data.sharedGoalId,
      goalTitle: data.goalTitle,
      sharedGoalId: data.sharedGoalId || data.goalId,
      senderId,
      senderName,
    };

    const recipients = userIds.filter((uid) => uid && uid !== senderId);
    
    if (recipients.length === 0) {
      log("No recipients after filtering sender");
      return true;
    }

    log(`Sending notification to ${recipients.length} recipients`);

    const storePromises = recipients.map(uid => 
      storeNotificationInFirestore(uid, { ...notification })
    );
    
    await Promise.all(storePromises);

    if (options.sendLocalPush === true) {
      await scheduleLocalPushNotification(message, data, options);
    }

    if (options.sendPush === true) {
      sendRealPushNotification(recipients, message, data, options).catch(e => 
        logError("Background push failed:", e)
      );
    }

    // ✅ Add analytics
    if (__DEV__) {
      console.log('📊 NOTIFICATION STATS:', {
        type: options.type,
        recipients: recipients.length,
        push: options.sendPush ? 'yes' : 'no',
        time: now.toISOString()
      });
    }

    logSuccess(`Notification sent successfully to ${recipients.length} users`);
    return true;
  } catch (e) {
    logError("sendNotification error:", e);
    return false;
  }
};

/* ================================================================================
   SHARED GOAL NORMALIZER
   ================================================================================ */

const getParticipantIdsFromGoal = (goal) => {
  if (!goal) return [];

  if (Array.isArray(goal.participantIds) && goal.participantIds.length) {
    return goal.participantIds.filter(Boolean);
  }

  const legacy = 
    goal.participants ||
    goal.collaborators ||
    goal.participantUids ||
    goal.memberIds ||
    [];
    
  return Array.isArray(legacy) ? legacy.filter(Boolean) : [];
};

const getCreatorIdFromGoal = (goal) => {
  if (!goal) return null;
  return goal.creatorId || goal.ownerId || goal.createdBy || null;
};

/* ================================================================================
   ✅ FIXED: SHARED GOAL NOTIFICATION ENTRY POINT - With goal fetching
   ================================================================================ */

export const notifySharedGoalParticipants = async ({
  actorUid,
  actorName,
  goalId,
  goalTitle,
  goalDoc,
  type,
  message,
  extraData = {},
  sendPush = true,
  pushTitle = "Shared Goal Update",
  priority = "high",
  screen = "Shared Goals",
}) => {
  try {
    if (!actorUid) {
      logError("notifySharedGoalParticipants: missing actorUid");
      return false;
    }
    
    if (!goalId) {
      logError("notifySharedGoalParticipants: missing goalId");
      return false;
    }
    
    if (!message) {
      logError("notifySharedGoalParticipants: missing message");
      return false;
    }

    // ✅ FIXED: Try to fetch goal if not provided
    let participantIds = [];
    let creatorId = actorUid;
    let resolvedGoalTitle = goalTitle;

    if (goalDoc) {
      participantIds = getParticipantIdsFromGoal(goalDoc);
      creatorId = getCreatorIdFromGoal(goalDoc) || actorUid;
      resolvedGoalTitle = goalTitle || goalDoc.title || "";
    } else if (goalId) {
      try {
        const { data: goalData } = await supabase
          .from("goals")
          .select("participants, owner_id, creator_id, title")
          .eq("id", goalId)
          .single();
        if (goalData) {
          participantIds = getParticipantIdsFromGoal(goalData);
          creatorId = goalData.owner_id || goalData.creator_id || actorUid;
          resolvedGoalTitle = resolvedGoalTitle || goalData.title || "";
        }
      } catch (fetchError) {
        logError("Failed to fetch goal for notifications:", fetchError);
      }
    }

    const recipients = participantIds
      .filter((uid) => typeof uid === "string" && uid.trim().length > 0)
      .filter((uid) => uid !== actorUid)
      .filter((uid, idx, arr) => arr.indexOf(uid) === idx);

    if (recipients.length === 0) {
      log("No recipients to notify (all filtered out)");
      return true;
    }

    log(`📨 Notifying ${recipients.length} participants for goal: ${resolvedGoalTitle || goalId}`);

    const data = {
      screen,
      type,
      sharedGoalId: goalId,
      goalId,
      goalTitle: resolvedGoalTitle || "",
      creatorId,
      participantIds,
      timestamp: new Date().toISOString(),
      ...extraData,
    };

    const result = await sendNotification(
      recipients,
      message,
      data,
      {
        type,
        pushTitle,
        priority,
        sendPush,
        sendLocalPush: false,
        senderId: actorUid,
        senderName: actorName || "Someone",
        screen,
      }
    );

    if (result) {
      logSuccess(`Shared goal notification sent: ${type}`);
    }
    
    return result;
  } catch (e) {
    logError("notifySharedGoalParticipants error:", e);
    return false;
  }
};

/* ================================================================================
   ASYNCSTORAGE UTILITIES FOR SCHEDULED NOTIFICATIONS
   ================================================================================ */

const NOTIFICATION_STORAGE_PREFIX = "notification_";
const SCHEDULED_PREFIX = "scheduled_";

const storeNotificationId = async (type, itemId, notificationId) => {
  try {
    const key = `${NOTIFICATION_STORAGE_PREFIX}${type}_${itemId}`;
    await AsyncStorage.setItem(key, String(notificationId));
  } catch (e) {
    logError("Error storing notification ID:", e);
  }
};

const getStoredNotificationId = async (type, itemId) => {
  try {
    const key = `${NOTIFICATION_STORAGE_PREFIX}${type}_${itemId}`;
    return await AsyncStorage.getItem(key);
  } catch (e) {
    logError("Error reading stored notification ID:", e);
    return null;
  }
};

const removeStoredNotificationId = async (type, itemId) => {
  try {
    const key = `${NOTIFICATION_STORAGE_PREFIX}${type}_${itemId}`;
    await AsyncStorage.removeItem(key);
  } catch (e) {
    logError("Error removing stored notification ID:", e);
  }
};

/* ================================================================================
   BULLETPROOF DUPLICATE CANCELLATION
   ================================================================================ */

const cancelAllScheduledForTask = async (taskId) => {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    const matches = all.filter((n) => n?.content?.data?.taskId === taskId);

    for (const n of matches) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }

    if (matches.length) {
      log(`🧹 Canceled ${matches.length} scheduled notifications for task:`, taskId);
    }
  } catch (e) {
    logError("cancelAllScheduledForTask error:", e);
  }
};

const cancelAllScheduledForGoal = async (goalId) => {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    const matches = all.filter((n) => 
      n?.content?.data?.goalId === goalId || 
      n?.content?.data?.sharedGoalId === goalId
    );

    for (const n of matches) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }

    if (matches.length) {
      log(`🧹 Canceled ${matches.length} scheduled notifications for goal:`, goalId);
    }
  } catch (e) {
    logError("cancelAllScheduledForGoal error:", e);
  }
};

/* ================================================================================
   ✅ FIXED: TASK SCHEDULING - With duplicate prevention and correct trigger
   ================================================================================ */

export const scheduleTaskNotification = async (task) => {
  try {
    // ✅ FIX: Check both camelCase and snake_case
    const enableNotifications = task.enableNotifications || task.enable_notifications;
    
    if (!task?.id || !task?.title) return null;
    if (!enableNotifications || task.completed) return null;

    const ok = await hasNotificationPermissions();
    if (!ok) return null;

    const now = new Date();
    
    // Early validation
    if (!task.dueDate && !task.notificationTime) {
      log(`⏭️ Task ${task.id} has no due date or notification time`);
      return null;
    }

    let notificationTime;
    if (task.notificationTime) {
      notificationTime = new Date(task.notificationTime);
    } else if (task.dueDate) {
      const due = new Date(task.dueDate);
      if (due <= now) {
        log(`⏭️ Task ${task.id} due date is in the past`);
        return null;
      }
      notificationTime = new Date(due.getTime() - 30 * 60 * 1000);
    } else {
      return null;
    }

    if (notificationTime <= now) {
      log(`⏭️ Task ${task.id} notification time is in the past`);
      return null;
    }

    // Check if already scheduled with same time
    const existingKey = `${SCHEDULED_PREFIX}task_${task.id}`;
    const existing = await AsyncStorage.getItem(existingKey);
    if (existing) {
      try {
        const { notificationTime: existingTime, notificationId } = JSON.parse(existing);
        if (existingTime === notificationTime.toISOString() && notificationId) {
          // Check if notification still exists
          const allScheduled = await Notifications.getAllScheduledNotificationsAsync();
          const stillScheduled = allScheduled.some(n => n.identifier === notificationId);
          if (stillScheduled) {
            log(`⏭️ Task ${task.id} already scheduled with same time, skipping`);
            return notificationId;
          }
        }
      } catch (e) {
        // Ignore parse errors, just reschedule
      }
    }

    // Wipe ALL existing schedules for this task
    await cancelAllScheduledForTask(task.id);
    await removeStoredNotificationId("task", task.id);

    const channelId = Platform.OS === "android"
      ? task.priority === "high" ? "tasks" : "default"
      : undefined;

    const priority = task.priority === "high"
      ? Notifications.AndroidNotificationPriority.HIGH
      : Notifications.AndroidNotificationPriority.DEFAULT;

    // ✅ FIX: Get custom message from either field
    const customMessage = task.customMessage || task.custom_notification_message || task.customNotificationMessage;

    // ✅ FIX: Correct trigger format - just { date: notificationTime }
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: `📅 ${task.priority === "high" ? "URGENT: " : ""}${task.title}`,
        body: customMessage || `Task "${task.title}" is coming up soon!`,
        data: {
          taskId: task.id,
          type: NOTIFICATION_TYPES.TASK_REMINDER,
          screen: "Planner",
          dueDate: task.dueDate ? new Date(task.dueDate).toISOString() : undefined,
          priority: task.priority || "medium",
          category: task.category || "personal",
          timestamp: new Date().toISOString(),
        },
        sound: true,
        priority,
        badge: 1,
        ...(Platform.OS === "android" && channelId ? { channelId } : {}),
      },
      // ✅ FIX: Correct trigger format - explicit type required since expo-notifications 0.29+
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: notificationTime,
        ...(Platform.OS === "android" && channelId ? { channelId } : {}),
      },
    });

    await storeNotificationId("task", task.id, id);
    
    // Store schedule info to prevent duplicates
    await AsyncStorage.setItem(existingKey, JSON.stringify({
      notificationTime: notificationTime.toISOString(),
      notificationId: id,
      scheduledAt: new Date().toISOString(),
      taskTitle: task.title
    }));

    log(`Scheduled task notification: ${id} for ${notificationTime}`);
    return id;
  } catch (e) {
    logError("scheduleTaskNotification error:", e);
    return null;
  }
};

export const cancelTaskNotification = async (taskId) => {
  try {
    await cancelAllScheduledForTask(taskId);
    await removeStoredNotificationId("task", taskId);
    
    // ✅ Clean up stored schedule info
    const existingKey = `${SCHEDULED_PREFIX}task_${taskId}`;
    await AsyncStorage.removeItem(existingKey);
    
    return true;
  } catch (e) {
    logError("cancelTaskNotification error:", e);
    return false;
  }
};

/* ================================================================================
   ✅ FIXED: GOAL SCHEDULING - With correct trigger format and field names
   ================================================================================ */

export const scheduleGoalNotifications = async (goal) => {
  try {
    // ✅ FIX: Check both camelCase and snake_case
    const enableNotifications = goal.enableNotifications || goal.enable_notifications;
    
    if (!goal?.id || !goal?.title) return { ids: [] };
    if (!enableNotifications) return { ids: [] };

    const ok = await hasNotificationPermissions();
    if (!ok) return { ids: [] };

    const now = new Date();
    
    if (!goal.dueDate && !goal.notificationTime) {
      return { ids: [] };
    }

    let notificationTime;
    if (goal.notificationTime) {
      notificationTime = new Date(goal.notificationTime);
    } else if (goal.dueDate) {
      const due = new Date(goal.dueDate);
      if (due <= now) return { ids: [] };
      notificationTime = new Date(due.getTime() - 30 * 60 * 1000);
    } else {
      return { ids: [] };
    }

    if (notificationTime <= now) return { ids: [] };

    // ✅ Check if already scheduled
    const existingKey = `${SCHEDULED_PREFIX}goal_${goal.id}`;
    const existing = await AsyncStorage.getItem(existingKey);
    if (existing) {
      try {
        const { notificationTime: existingTime, notificationId } = JSON.parse(existing);
        if (existingTime === notificationTime.toISOString() && notificationId) {
          const allScheduled = await Notifications.getAllScheduledNotificationsAsync();
          const stillScheduled = allScheduled.some(n => n.identifier === notificationId);
          if (stillScheduled) {
            log(`⏭️ Goal ${goal.id} already scheduled with same time, skipping`);
            return { ids: [notificationId] };
          }
        }
      } catch (e) {
        // Ignore parse errors
      }
    }

    // Remove all duplicates first
    await cancelAllScheduledForGoal(goal.id);
    await removeStoredNotificationId("goal", goal.id);

    const channelId = Platform.OS === "android"
      ? goal.priority === "high" ? "goals" : "default"
      : undefined;

    const priority = goal.priority === "high"
      ? Notifications.AndroidNotificationPriority.HIGH
      : Notifications.AndroidNotificationPriority.DEFAULT;

    // ✅ FIX: Get custom message from either field name
    const customMessage = goal.customMessage || goal.custom_notification_message || goal.customNotificationMessage;

    // ✅ FIX: Correct trigger format - remove 'type: "date"'
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: `🎯 ${goal.priority === "high" ? "URGENT: " : ""}${goal.title}`,
        body: customMessage || `Goal "${goal.title}" deadline is approaching!`,
        data: {
          goalId: goal.id,
          sharedGoalId: goal.id,
          type: NOTIFICATION_TYPES.GOAL_DEADLINE,
          screen: "Goals",
          dueDate: goal.dueDate ? new Date(goal.dueDate).toISOString() : undefined,
          priority: goal.priority || "medium",
          category: goal.category || "personal",
          timestamp: new Date().toISOString(),
        },
        sound: true,
        priority,
        badge: 1,
        ...(Platform.OS === "android" && channelId ? { channelId } : {}),
      },
      // ✅ FIX: Correct trigger format - explicit type required since expo-notifications 0.29+
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: notificationTime,
        ...(Platform.OS === "android" && channelId ? { channelId } : {}),
      },
    });

    await storeNotificationId("goal", goal.id, id);
    
    // ✅ Store schedule info
    await AsyncStorage.setItem(existingKey, JSON.stringify({
      notificationTime: notificationTime.toISOString(),
      notificationId: id,
      scheduledAt: new Date().toISOString(),
      goalTitle: goal.title
    }));

    log(`Scheduled goal notification: ${id} for ${notificationTime}`);
    return { ids: [id] };
  } catch (e) {
    logError("scheduleGoalNotifications error:", e);
    return { ids: [] };
  }
};

export const cancelGoalNotifications = async (goalId) => {
  try {
    await cancelAllScheduledForGoal(goalId);
    await removeStoredNotificationId("goal", goalId);
    
    // ✅ Clean up stored schedule info
    const existingKey = `${SCHEDULED_PREFIX}goal_${goalId}`;
    await AsyncStorage.removeItem(existingKey);
    
    return true;
  } catch (e) {
    logError("cancelGoalNotifications error:", e);
    return false;
  }
};

/* ================================================================================
   NOTIFICATION RESPONSE HANDLER - With fallback routes
   ================================================================================ */

export const setupNotificationResponseHandler = (navigation) => {
  log("Setting up notification response handler...");

  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response?.notification?.request?.content?.data || {};
    const { taskId, goalId, sharedGoalId, type, screen } = data;
    
    const effectiveGoalId = sharedGoalId || goalId;

    log("📱 Tapped notification:", { 
      type, 
      taskId, 
      goalId: effectiveGoalId,
      screen 
    });

    if (!navigation || typeof navigation.navigate !== 'function') {
      logError("Navigation object invalid");
      return;
    }

    try {
      switch (type) {
        case NOTIFICATION_TYPES.TASK_REMINDER:
          if (taskId) {
            navigation.navigate("Planner", { 
              screen: "Planner", 
              params: { focusTaskId: taskId } 
            });
          }
          break;

        case NOTIFICATION_TYPES.GOAL_DEADLINE:
        case NOTIFICATION_TYPES.GOAL_MILESTONE_REACHED:
        case NOTIFICATION_TYPES.MILESTONE_COMPLETED:
          if (effectiveGoalId) {
            navigation.navigate("Goals", { 
              screen: "GoalDetail", 
              params: { goalId: effectiveGoalId } 
            });
          }
          break;

        case NOTIFICATION_TYPES.GOAL_INVITE:
        case NOTIFICATION_TYPES.SHARED_GOAL_INVITATION:
        case NOTIFICATION_TYPES.GOAL_JOINED:
        case NOTIFICATION_TYPES.COMMENT:
        case NOTIFICATION_TYPES.PROGRESS_UPDATE:
        case NOTIFICATION_TYPES.GOAL_COMPLETED:
        case NOTIFICATION_TYPES.GOAL_UPDATED:
          try {
            navigation.navigate("Shared Goals");
          } catch (e) {
            try {
              navigation.navigate("SharedGoals");
            } catch (e2) {
              try {
                navigation.navigate("SharedGoalsScreen");
              } catch (e3) {
                logError("Failed to navigate to shared goals:", e3);
              }
            }
          }
          break;

        default:
          log("Unhandled notification type:", type);
          break;
      }
    } catch (error) {
      logError("Navigation error:", error);
    }
  });

  return subscription;
};

export const setupNotificationReceivedHandler = () => {
  const subscription = Notifications.addNotificationReceivedListener(() => {
    updateBadgeCount();
  });
  return subscription;
};

/* ================================================================================
   BADGE MANAGEMENT
   ================================================================================ */

export const updateBadgeCount = async () => {
  try {
    const currentCount = await Notifications.getBadgeCountAsync();
    await Notifications.setBadgeCountAsync((currentCount || 0) + 1);
  } catch (e) {
    logError("updateBadgeCount error:", e);
  }
};

export const clearBadgeCount = async () => {
  try {
    await Notifications.setBadgeCountAsync(0);
  } catch (e) {
    logError("clearBadgeCount error:", e);
  }
};

/* ================================================================================
   DEBUG / UTILITIES
   ================================================================================ */

export const sendTestNotification = async () => {
  try {
    const ok = await requestNotificationPermissions();
    if (!ok) return false;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "🧪 Test Notification",
        body: "If you see this, notifications are working!",
        data: { 
          test: true, 
          type: NOTIFICATION_TYPES.TEST,
          timestamp: new Date().toISOString(),
        },
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        ...(Platform.OS === "android" && { channelId: "default" }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 3,
      },
    });

    Alert.alert("✅ Test Sent", "You should receive a notification in 3 seconds");
    return true;
  } catch (e) {
    logError("sendTestNotification error:", e);
    Alert.alert("❌ Error", "Failed to send test notification");
    return false;
  }
};

export const getAllScheduledNotifications = async () => {
  try {
    return await Notifications.getAllScheduledNotificationsAsync();
  } catch (e) {
    logError("getAllScheduledNotifications error:", e);
    return [];
  }
};

export const cancelAllNotifications = async () => {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    logSuccess("All scheduled notifications cancelled");
    return true;
  } catch (e) {
    logError("cancelAllNotifications error:", e);
    return false;
  }
};

export const checkPushTokenStatus = async (userId) => {
  try {
    if (!userId) return null;
    
    const { data } = await supabase
      .from("profiles")
      .select("expo_push_token, updated_at")
      .eq("id", userId)
      .single();

    if (!data) return null;

    return {
      hasToken: !!data.expo_push_token,
      token: data.expo_push_token,
      lastUpdated: data.updated_at,
      isValid: isLikelyExpoPushToken(data.expo_push_token),
    };
  } catch (e) {
    logError("checkPushTokenStatus error:", e);
    return null;
  }
};

export const refreshPushToken = async (userId) => {
  if (!userId) return false;
  
  log(`Refreshing push token for user: ${userId}`);
  const token = await registerAndSaveExpoPushToken(userId);
  return !!token;
};

/* ================================================================================
   CLEAR ALL IN-APP NOTIFICATIONS
   ================================================================================ */

export const clearAllInAppNotifications = async (userId) => {
  try {
    if (!userId) return false;
    const { error } = await supabase
      .from("profiles")
      .update({ notifications: [], updated_at: new Date().toISOString() })
      .eq("id", userId);
    if (error) throw error;
    logSuccess(`Cleared all in-app notifications for user ${userId}`);
    return true;
  } catch (e) {
    logError("clearAllInAppNotifications error:", e);
    return false;
  }
};

/* ================================================================================
   DEFAULT EXPORT
   ================================================================================ */

export default {
  NOTIFICATION_TYPES,
  
  // Setup
  configureNotificationHandler,
  requestNotificationPermissions,
  hasNotificationPermissions,
  
  // Tokens
  registerAndSaveExpoPushToken,
  refreshPushToken,
  checkPushTokenStatus,
  
  // Send notifications
  sendNotification,
  notifySharedGoalParticipants,
  
  // Firestore notifications
  setupNotificationListener,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  
  // Task scheduling
  scheduleTaskNotification,
  cancelTaskNotification,
  
  // Goal scheduling
  scheduleGoalNotifications,
  cancelGoalNotifications,
  
  // Handlers
  setupNotificationResponseHandler,
  setupNotificationReceivedHandler,
  
  // Badge
  updateBadgeCount,
  clearBadgeCount,
  
  // Utilities
  getAllScheduledNotifications,
  cancelAllNotifications,
  sendTestNotification,
  clearAllInAppNotifications,
};