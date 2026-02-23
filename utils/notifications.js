// utils/notifications.js - PRODUCTION READY
// ✅ COMPLETE FIXED VERSION - February 12, 2026
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

import {
  arrayUnion,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc
} from "firebase/firestore";
import { db } from "../firebaseConfig";

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
        shouldShowAlert: true,
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
    });

    await Notifications.setNotificationChannelAsync("collaboration", {
      name: "Collaboration",
      description: "Updates from shared goals",
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 100, 250],
      sound: "default",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: true,
      enableVibrate: true,
      enableLights: true,
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

    const userRef = doc(db, "users", userId);
    
    await setDoc(
      userRef,
      {
        expoPushToken,
        expoPushTokenUpdatedAt: serverTimestamp(),
        lastNotificationCheck: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

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

    const userRef = doc(db, "users", userId);
    
    const now = new Date();
    
    const enrichedNotification = {
      id: notification.id || generateNotificationId(),
      message: notification.message || "",
      type: notification.type || NOTIFICATION_TYPES.GENERAL,
      data: notification.data || {},
      read: false,
      timestamp: notification.timestamp || now,
      createdAt: now,
      ...(notification.senderId && { senderId: notification.senderId }),
      ...(notification.senderName && { senderName: notification.senderName }),
      ...(notification.goalId && { goalId: notification.goalId }),
      ...(notification.goalTitle && { goalTitle: notification.goalTitle }),
      ...(notification.sharedGoalId && { sharedGoalId: notification.sharedGoalId }),
    };

    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      // ✅ FIXED: Use arrayUnion - more efficient than spread
      await updateDoc(userRef, {
        notifications: arrayUnion(enrichedNotification),
        lastNotificationReceived: now,
        updatedAt: serverTimestamp(),
      });
    } else {
      // Create new document
      await setDoc(userRef, {
        notifications: [enrichedNotification],
        lastNotificationReceived: now,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

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
    
    const userRef = doc(db, "users", userId);

    const unsubscribe = onSnapshot(
      userRef,
      (docSnap) => {
        if (!docSnap.exists()) {
          log(`User document ${userId} does not exist yet`);
          return;
        }

        const userData = docSnap.data();
        const notifications = userData.notifications || [];

        const sorted = [...notifications].sort((a, b) => {
          const timeA = a.timestamp?.seconds
            ? a.timestamp.seconds * 1000
            : new Date(a.timestamp).getTime() || 0;
          const timeB = b.timestamp?.seconds
            ? b.timestamp.seconds * 1000
            : new Date(b.timestamp).getTime() || 0;
          return timeB - timeA;
        });

        if (typeof callback === "function") callback(sorted);
      },
      (err) => {
        logError("Notification listener error:", err);
      }
    );

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

    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      logError(`User ${userId} not found`);
      return false;
    }

    const notifications = userDoc.data().notifications || [];
    const updated = notifications.map((n) =>
      n.id === notificationId ? { ...n, read: true, readAt: new Date() } : n
    );

    await updateDoc(userRef, { 
      notifications: updated,
      lastNotificationRead: new Date(),
      updatedAt: serverTimestamp(),
    });
    
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

    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) return false;

    const notifications = userDoc.data().notifications || [];
    const updated = notifications.map((n) => ({ 
      ...n, 
      read: true,
      readAt: new Date() 
    }));

    await updateDoc(userRef, { 
      notifications: updated,
      lastNotificationRead: new Date(),
      updatedAt: serverTimestamp(),
    });
    
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
      trigger: { seconds: 1 },
    });

    log(`Scheduled local notification: ${notificationId}`);
    return notificationId;
  } catch (e) {
    logError("scheduleLocalPushNotification error:", e);
    return false;
  }
};

/* ================================================================================
   ✅ FIXED: REAL EXPO PUSH SENDER - With token cleanup
   ================================================================================ */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const loadUserExpoPushTokens = async (userId) => {
  try {
    const snap = await getDoc(doc(db, "users", userId));
    if (!snap.exists()) return [];

    const data = snap.data();
    const token = data.expoPushToken;

    const tokens = Array.isArray(token) ? token : token ? [token] : [];
    return tokens.filter(isLikelyExpoPushToken);
  } catch (e) {
    logError("loadUserExpoPushTokens error for user:", userId, e);
    return [];
  }
};

const sendRealPushNotification = async (userIds, message, data = {}, options = {}) => {
  try {
    if (!Array.isArray(userIds) || userIds.length === 0) {
      log("sendRealPushNotification: no recipients");
      return { ok: true, sent: 0, tickets: [] };
    }

    const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
    
    if (uniqueUserIds.length === 0) {
      return { ok: true, sent: 0, tickets: [] };
    }

    const tokenPairs = await Promise.all(
      uniqueUserIds.map(async (uid) => ({ 
        uid, 
        tokens: await loadUserExpoPushTokens(uid) 
      }))
    );

    const tokens = tokenPairs.flatMap((p) => p.tokens);

    if (tokens.length === 0) {
      logWarn("No Expo push tokens found for recipients");
      return { ok: false, sent: 0, tickets: [], error: "NO_TOKENS" };
    }

    let channelId = "default";
    if (data?.type?.includes("goal")) channelId = "goals";
    if (data?.type?.includes("task")) channelId = "tasks";
    if (data?.type?.includes("invite") || data?.type?.includes("joined")) {
      channelId = "collaboration";
    }

    const expoMessages = tokens.map((to) => ({
      to,
      sound: options.sound ?? "default",
      title: options.pushTitle || "Goal Update",
      body: message,
      data: {
        ...data,
        type: data?.type || options.type || NOTIFICATION_TYPES.GENERAL,
        screen: options.screen || data?.screen || "SharedGoals",
        timestamp: new Date().toISOString(),
      },
      priority: options.priority === "high" ? "high" : "default",
      channelId: Platform.OS === "android" ? channelId : undefined,
      badge: 1,
      ttl: 2419200,
      expiration: 2419200,
    }));

    const batches = chunk(expoMessages, 100);
    const allTickets = [];

    for (const batch of batches) {
      let retries = 0;
      let success = false;
      
      while (!success && retries < MAX_RETRIES) {
        try {
          const res = await fetch(EXPO_PUSH_URL, {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Accept-Encoding": "gzip, deflate",
              "Content-Type": "application/json",
            },
            body: JSON.stringify(batch),
          });

          const json = await res.json();

          if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${JSON.stringify(json)}`);
          }

          const tickets = json?.data || [];
          allTickets.push(...tickets);

          // ✅ FIXED: Clean up invalid tokens
          tickets.forEach((t, index) => {
            if (t?.status === "error") {
              logError("Expo ticket error:", t?.message, t?.details);
              
              // Clean up DeviceNotRegistered errors
              if (t?.details?.error === "DeviceNotRegistered" || 
                  t?.message?.includes("invalid credentials")) {
                const failedToken = batch[index]?.to;
                if (failedToken) {
                  const userWithToken = tokenPairs.find(p => p.tokens.includes(failedToken));
                  if (userWithToken) {
                    updateDoc(doc(db, "users", userWithToken.uid), {
                      expoPushToken: null,
                      tokenInvalidAt: serverTimestamp()
                    }).catch(e => logError("Failed to remove invalid token:", e));
                  }
                }
              }
            }
          });

          success = true;
          log(`Sent batch of ${batch.length} push notifications`);
        } catch (error) {
          retries++;
          logWarn(`Push send attempt ${retries} failed:`, error.message);
          
          if (retries < MAX_RETRIES) {
            await sleep(RETRY_DELAY * retries);
          } else {
            logError("Max retries reached for push batch");
          }
        }
      }
    }

    logSuccess(`Sent ${tokens.length} push notifications`);
    return { ok: true, sent: tokens.length, tickets: allTickets };
  } catch (e) {
    logError("sendRealPushNotification error:", e);
    return { ok: false, sent: 0, tickets: [], error: String(e?.message || e) };
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
        const goalRef = doc(db, "goals", goalId);
        const goalSnap = await getDoc(goalRef);
        if (goalSnap.exists()) {
          const fetchedGoal = goalSnap.data();
          participantIds = getParticipantIdsFromGoal(fetchedGoal);
          creatorId = getCreatorIdFromGoal(fetchedGoal) || actorUid;
          resolvedGoalTitle = resolvedGoalTitle || fetchedGoal.title || "";
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
   ✅ FIXED: TASK SCHEDULING - With duplicate prevention
   ================================================================================ */

export const scheduleTaskNotification = async (task) => {
  try {
    if (!task?.id || !task?.title) return null;
    if (!task.enableNotifications || task.completed) return null;

    const ok = await hasNotificationPermissions();
    if (!ok) return null;

    const now = new Date();
    
    // ✅ Early validation
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

    // ✅ Check if already scheduled with same time
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

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: `📅 ${task.priority === "high" ? "URGENT: " : ""}${task.title}`,
        body: task.customNotificationMessage || `Task "${task.title}" is coming up soon!`,
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
      trigger: { type: "date", date: notificationTime },
    });

    await storeNotificationId("task", task.id, id);
    
    // ✅ Store schedule info to prevent duplicates
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
   ✅ FIXED: GOAL SCHEDULING - With duplicate prevention
   ================================================================================ */

export const scheduleGoalNotifications = async (goal) => {
  try {
    if (!goal?.id || !goal?.title) return { ids: [] };
    if (!goal.enableNotifications) return { ids: [] };

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

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: `🎯 ${goal.priority === "high" ? "URGENT: " : ""}${goal.title}`,
        body: goal.customNotificationMessage || `Goal "${goal.title}" deadline is approaching!`,
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
      trigger: { type: "date", date: notificationTime },
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
      trigger: { seconds: 3 },
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
    
    const userDoc = await getDoc(doc(db, "users", userId));
    if (!userDoc.exists()) return null;
    
    const data = userDoc.data();
    return {
      hasToken: !!data.expoPushToken,
      token: data.expoPushToken,
      lastUpdated: data.expoPushTokenUpdatedAt,
      isValid: isLikelyExpoPushToken(data.expoPushToken),
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
};