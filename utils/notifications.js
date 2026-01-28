// utils/notifications.js
import * as Notifications from 'expo-notifications';
import { Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { 
  doc, 
  updateDoc, 
  arrayUnion, 
  getDoc, 
  arrayRemove,
  writeBatch,
  serverTimestamp
} from "firebase/firestore";
import { db } from "../firebaseConfig";

// Notification Types Constants
export const NOTIFICATION_TYPES = {
  TASK_REMINDER: 'task_reminder',
  GOAL_REMINDER: 'goal_reminder', // ADDED: Missing type
  GOAL_INVITATION: 'goal_invitation',
  GOAL_PROGRESS: 'goal_progress',
  GOAL_DEADLINE: 'goal_deadline',
  GOAL_COMPLETED: 'goal_completed',
  SHARED_GOAL_UPDATE: 'shared_goal_update',
  SHARED_GOAL_INVITATION: 'shared_goal_invitation',
  SHARED_GOAL_NEW_MEMBER: 'shared_goal_new_member',
  SHARED_GOAL_MEMBER_LEFT: 'shared_goal_member_left',
  GOAL_MILESTONE_REACHED: 'goal_milestone_reached',
  GENERAL: 'general',
  SYSTEM_ALERT: 'system_alert',
  ACHIEVEMENT_UNLOCKED: 'achievement_unlocked',
  WEEKLY_SUMMARY: 'weekly_summary',
  GOAL_INVITE: 'goal_invite',
  PROGRESS_UPDATE: 'progress_update',
  MILESTONE_COMPLETED: 'milestone_completed',
  GOAL_JOINED: 'goal_joined',
  GOAL_UPDATED: 'goal_updated',
  PARTICIPANT_REMOVED: 'participant_removed',
  GOAL_DELETED: 'goal_deleted',
  COMMENT: 'comment',
  MILESTONE_ADDED: 'milestone_added',
};

// Notification Categories for Android
export const NOTIFICATION_CATEGORIES = {
  TASK: 'task',
  GOAL: 'goal',
  INVITATION: 'invitation',
  COLLABORATION: 'collaboration',
  ACHIEVEMENT: 'achievement',
  SYSTEM: 'system',
  REMINDER: 'reminder',
};

// Notification priority levels
export const NOTIFICATION_PRIORITY = {
  MIN: 'min',
  LOW: 'low',
  DEFAULT: 'default',
  HIGH: 'high',
  MAX: 'max',
};

// Configure notification behavior
export const configureNotificationHandler = () => {
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      priority: Notifications.AndroidNotificationPriority.HIGH,
    }),
  });
};

/* ================================================================================
   IN-APP NOTIFICATIONS FOR SHARED GOALS (Firestore-based)
   ================================================================================ */

/**
 * Send a notification to user(s) via Firestore (for in-app notifications)
 * @param {Array<string>} userIds - Array of user IDs to notify
 * @param {string} message - Notification message
 * @param {Object} data - Additional data to store with notification
 * @param {Object} options - Notification options
 * @returns {Promise<boolean>} - Success status
 */
export const sendNotification = async (userIds, message, data = {}, options = {}) => {
  try {
    if (!userIds || userIds.length === 0) {
      console.warn('No user IDs provided for notification');
      return false;
    }

    const notificationId = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // FIX: Extract goalId and goalTitle from data with proper fallbacks
    const { goalId, goalTitle, ...otherData } = data;
    
    const notification = {
      id: notificationId,
      message,
      data: otherData, // Store the rest of data without goalId/goalTitle
      type: options.type || NOTIFICATION_TYPES.GENERAL,
      priority: options.priority || NOTIFICATION_PRIORITY.DEFAULT,
      read: false,
      timestamp: new Date().toISOString(),
      actionRequired: options.actionRequired || false,
      // FIX: Only include if they exist
      ...(goalId && { goalId }),
      ...(goalTitle && { goalTitle }),
      ...options,
    };

    console.log(`📨 Sending notification: ${message} to ${userIds.length} user(s)`);

    // Check if db is initialized
    if (!db) {
      console.error('Firestore database not initialized');
      return false;
    }

    // FIX: Use arrayUnion for notifications instead of overwriting
    const batch = writeBatch(db);

    for (const userId of userIds) {
      try {
        const userRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          batch.update(userRef, {
            notifications: arrayUnion(notification),
            unreadNotifications: arrayUnion(notification.id),
            updatedAt: serverTimestamp(),
          });
        } else {
          // FIX: Create more complete user document
          batch.set(userRef, {
            notifications: [notification],
            unreadNotifications: [notification.id],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            notificationSettings: {
              enabled: true,
              pushEnabled: true,
              inAppEnabled: true,
            },
          });
        }
      } catch (userError) {
        console.error(`Error preparing notification for user ${userId}:`, userError);
        continue;
      }
    }

    // FIX: Add error handling for batch commit
    try {
      await batch.commit();
    } catch (batchError) {
      console.error('Error committing batch:', batchError);
      
      // FIX: Fallback - update users individually if batch fails
      console.log('Attempting individual updates as fallback...');
      let successCount = 0;
      
      for (const userId of userIds) {
        try {
          const userRef = doc(db, 'users', userId);
          const userSnap = await getDoc(userRef);
          
          if (userSnap.exists()) {
            await updateDoc(userRef, {
              notifications: arrayUnion(notification),
              unreadNotifications: arrayUnion(notification.id),
              updatedAt: serverTimestamp(),
            });
            successCount++;
          }
        } catch (error) {
          console.error(`Failed to update user ${userId}:`, error);
        }
      }
      
      if (successCount === 0) {
        throw new Error('All individual updates failed');
      }
      
      console.log(`✅ Sent to ${successCount}/${userIds.length} users via fallback`);
    }

    // Also send push notification if enabled in options
    if (options.sendPush !== false) {
      const pushTitle = options.pushTitle || getPushTitleFromType(notification.type);
      const pushBody = options.pushBody || message;

      try {
        await scheduleLocalPushNotification({
          identifier: `push_${notificationId}`,
          title: pushTitle,
          body: pushBody,
          data: {
            ...otherData,
            goalId, // Include goalId in push data
            goalTitle, // Include goalTitle in push data
            type: notification.type,
            notificationId: notification.id,
            actionRequired: notification.actionRequired,
          },
          trigger: { 
            type: 'timeInterval', 
            seconds: 2 
          }, // Immediate push notification
          sound: true,
          priority: getAndroidPriority(notification.priority),
          badge: 1,
          channelId: getChannelIdFromType(notification.type),
        });
      } catch (pushError) {
        console.error('Error sending push notification:', pushError);
        // Don't fail the whole operation if push fails
      }
    }

    console.log(`✅ Successfully sent notification to ${userIds.length} user(s)`);
    return true;
  } catch (error) {
    console.error('Error in sendNotification:', error);
    return false;
  }
};

// Helper function to get push notification title based on type
const getPushTitleFromType = (type) => {
  switch (type) {
    case NOTIFICATION_TYPES.GOAL_REMINDER:
      return '🎯 Goal Reminder';
    case NOTIFICATION_TYPES.GOAL_INVITATION:
    case NOTIFICATION_TYPES.SHARED_GOAL_INVITATION:
    case NOTIFICATION_TYPES.GOAL_INVITE:
      return '🎯 Goal Invitation';
    case NOTIFICATION_TYPES.GOAL_PROGRESS:
    case NOTIFICATION_TYPES.SHARED_GOAL_UPDATE:
    case NOTIFICATION_TYPES.PROGRESS_UPDATE:
      return '📈 Progress Update';
    case NOTIFICATION_TYPES.GOAL_COMPLETED:
      return '🏆 Goal Completed!';
    case NOTIFICATION_TYPES.GOAL_MILESTONE_REACHED:
    case NOTIFICATION_TYPES.MILESTONE_COMPLETED:
      return '✨ Milestone Reached!';
    case NOTIFICATION_TYPES.ACHIEVEMENT_UNLOCKED:
      return '🏅 Achievement Unlocked!';
    case NOTIFICATION_TYPES.SHARED_GOAL_NEW_MEMBER:
    case NOTIFICATION_TYPES.GOAL_JOINED:
      return '👥 New Collaborator';
    case NOTIFICATION_TYPES.GOAL_DEADLINE:
      return '⏰ Deadline Reminder';
    case NOTIFICATION_TYPES.GOAL_UPDATED:
      return '✏️ Goal Updated';
    case NOTIFICATION_TYPES.COMMENT:
      return '💬 New Comment';
    case NOTIFICATION_TYPES.MILESTONE_ADDED:
      return '🎯 New Milestone';
    default:
      return '🔔 Notification';
  }
};

// Helper function to get Android channel ID based on type
const getChannelIdFromType = (type) => {
  switch (type) {
    case NOTIFICATION_TYPES.GOAL_REMINDER:
    case NOTIFICATION_TYPES.GOAL_INVITATION:
    case NOTIFICATION_TYPES.SHARED_GOAL_INVITATION:
    case NOTIFICATION_TYPES.GOAL_INVITE:
    case NOTIFICATION_TYPES.SHARED_GOAL_NEW_MEMBER:
    case NOTIFICATION_TYPES.GOAL_JOINED:
      return 'invitations';
    case NOTIFICATION_TYPES.GOAL_PROGRESS:
    case NOTIFICATION_TYPES.SHARED_GOAL_UPDATE:
    case NOTIFICATION_TYPES.GOAL_COMPLETED:
    case NOTIFICATION_TYPES.GOAL_MILESTONE_REACHED:
    case NOTIFICATION_TYPES.GOAL_UPDATED:
    case NOTIFICATION_TYPES.PROGRESS_UPDATE:
    case NOTIFICATION_TYPES.MILESTONE_COMPLETED:
      return 'goals';
    case NOTIFICATION_TYPES.ACHIEVEMENT_UNLOCKED:
      return 'achievements';
    case NOTIFICATION_TYPES.TASK_REMINDER:
      return 'tasks';
    case NOTIFICATION_TYPES.COMMENT:
    case NOTIFICATION_TYPES.MILESTONE_ADDED:
      return 'collaboration';
    default:
      return 'default';
  }
};

/**
 * Mark a notification as read
 * @param {string} userId - User ID
 * @param {string} notificationId - Notification ID
 * @returns {Promise<boolean>} - Success status
 */
export const markNotificationAsRead = async (userId, notificationId) => {
  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const userData = userSnap.data();
      const notifications = userData.notifications || [];
      const unreadNotifications = userData.unreadNotifications || [];

      const updatedNotifications = notifications.map(notification => 
        notification.id === notificationId ? { ...notification, read: true } : notification
      );

      const updatedUnreadNotifications = unreadNotifications.filter(id => id !== notificationId);

      await updateDoc(userRef, {
        notifications: updatedNotifications,
        unreadNotifications: updatedUnreadNotifications,
        updatedAt: serverTimestamp(),
      });

      console.log(`✅ Marked notification ${notificationId} as read for user ${userId}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return false;
  }
};

/**
 * Mark all notifications as read for a user
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} - Success status
 */
export const markAllNotificationsAsRead = async (userId) => {
  try {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const userData = userSnap.data();
      const notifications = userData.notifications || [];

      const updatedNotifications = notifications.map(notification => ({
        ...notification,
        read: true
      }));

      await updateDoc(userRef, {
        notifications: updatedNotifications,
        unreadNotifications: [],
        updatedAt: serverTimestamp(),
      });

      console.log(`✅ Marked all notifications as read for user ${userId}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    return false;
  }
};

/**
 * Clear all notifications for a user
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} - Success status
 */
export const clearAllUserNotifications = async (userId) => {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      notifications: [],
      unreadNotifications: [],
      updatedAt: serverTimestamp(),
    });
    
    console.log(`✅ Cleared all notifications for user ${userId}`);
    return true;
  } catch (error) {
    console.error('Error clearing all notifications:', error);
    return false;
  }
};

/* ================================================================================
   SCHEDULED NOTIFICATIONS MANAGEMENT (for Planner screen)
   ================================================================================ */

/**
 * Schedule task reminder with multiple options
 */
export const scheduleTaskNotification = async (task, userId = null) => {
  try {
    // Validate task
    if (!task || !task.id || !task.title) {
      throw new Error('Invalid task object');
    }

    if (!task.enableNotifications || task.completed) {
      console.log('Task notifications disabled or task completed');
      return null;
    }

    // Calculate notification time
    let notificationTime = new Date();
    if (task.dueDate) {
      notificationTime = new Date(task.dueDate);
      
      // Apply notification offset
      if (task.notificationOffset) {
        notificationTime = calculateNotificationTime(task.dueDate, task.notificationOffset);
      } else {
        // Default: 30 minutes before due time
        notificationTime.setMinutes(notificationTime.getMinutes() - 30);
      }
    } else if (task.scheduledDate) {
      notificationTime = new Date(task.scheduledDate);
    } else {
      // If no date, schedule for now (for testing)
      notificationTime = new Date(Date.now() + 10000); // 10 seconds from now
    }

    // Don't schedule if time is in the past
    if (notificationTime <= new Date()) {
      console.log('Notification time is in the past, skipping');
      return null;
    }

    // Cancel existing notification if any
    if (task.notificationId) {
      await cancelTaskNotification(task.id);
    }

    // Generate notification ID
    const notificationId = `task_${task.id}_${Date.now()}`;
    
    // Determine channel and priority
    const channelId = task.priority === 'high' ? 'tasks' : 'default';
    const priority = task.priority === 'high' ? 
      Notifications.AndroidNotificationPriority.HIGH : 
      Notifications.AndroidNotificationPriority.DEFAULT;

    // Schedule push notification
    await scheduleLocalPushNotification({
      identifier: notificationId,
      title: `📅 ${task.priority === 'high' ? 'URGENT: ' : ''}${task.title}`,
      body: task.customNotificationMessage || `"${task.title}" is due soon!`,
      data: {
        taskId: task.id,
        type: NOTIFICATION_TYPES.TASK_REMINDER,
        screen: 'Planner',
        dueDate: task.dueDate,
        priority: task.priority || 'medium',
        category: task.category,
      },
      trigger: { 
        type: 'date', 
        date: notificationTime 
      },
      sound: true,
      priority,
      badge: 1,
      channelId,
    });

    // Store notification ID
    await storeNotificationId('task', task.id, notificationId);
    
    console.log(`✅ Scheduled notification for task: ${task.title} at ${notificationTime}`);
    return notificationId;
    
  } catch (error) {
    console.error('Error scheduling task notification:', error);
    return null;
  }
};

/**
 * Calculate notification time based on offset
 */
const calculateNotificationTime = (dueDate, offset) => {
  const date = new Date(dueDate);
  
  switch (offset.unit) {
    case 'minutes':
      date.setMinutes(date.getMinutes() - offset.value);
      break;
    case 'hours':
      date.setHours(date.getHours() - offset.value);
      break;
    case 'days':
      date.setDate(date.getDate() - offset.value);
      break;
    case 'weeks':
      date.setDate(date.getDate() - (offset.value * 7));
      break;
    default:
      date.setMinutes(date.getMinutes() - 30); // Default fallback
  }
  
  return date;
};

/**
 * Cancel task notification
 */
export const cancelTaskNotification = async (taskId) => {
  try {
    // Get stored notification IDs
    const storedId = await getStoredNotificationId('task', taskId);
    
    if (storedId) {
      await Notifications.cancelScheduledNotificationAsync(storedId);
      await removeStoredNotificationId('task', taskId);
    }

    // Also cancel by identifier pattern
    const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
    const taskNotifications = scheduledNotifications.filter(
      notification => notification.identifier?.includes(`task_${taskId}`)
    );
    
    for (const notification of taskNotifications) {
      await Notifications.cancelScheduledNotificationAsync(notification.identifier);
    }
    
    console.log(`✅ Cancelled all notifications for task: ${taskId}`);
    return true;
  } catch (error) {
    console.error('Error cancelling task notification:', error);
    return false;
  }
};

/**
 * Schedule goal notifications with multiple reminders
 * FIXED: Now supports custom notification times and messages
 */
export const scheduleGoalNotifications = async (goal, userIds = [], isShared = false) => {
  try {
    // FIX: Add validation for goal structure
    if (!goal || !goal.id || !goal.title) {
      console.log('Goal not valid for notifications - missing required fields');
      return [];
    }

    // Don't schedule if goal is completed
    if (goal.completed) {
      console.log('Goal is already completed, skipping notifications');
      return [];
    }

    // Check if we have a deadline
    if (!goal.deadline) {
      console.log('Goal has no deadline, cannot schedule notifications');
      return [];
    }

    const deadline = new Date(goal.deadline);
    const now = new Date();
    
    // Validate deadline date
    if (isNaN(deadline.getTime())) {
      console.error('Invalid deadline date format');
      return [];
    }
    
    // Don't schedule if deadline is in the past
    if (deadline <= now) {
      console.log('Goal deadline is in the past');
      return [];
    }

    const notifications = [];
    
    // FIX: Check custom notification time with better validation
    if (goal.notificationTime) {
      const customTime = new Date(goal.notificationTime);
      
      // Validate custom time
      if (isNaN(customTime.getTime())) {
        console.warn('Invalid custom notification time format');
      } else if (customTime > now && customTime < deadline) {
        const customNotificationId = `goal_${goal.id}_custom_${Date.now()}`;
        
        await scheduleLocalPushNotification({
          identifier: customNotificationId,
          title: `🎯 ${goal.title}`,
          body: goal.customNotificationMessage || `Reminder: Your goal "${goal.title}" is coming up`,
          data: {
            goalId: goal.id,
            type: NOTIFICATION_TYPES.GOAL_REMINDER,
            screen: 'Goals',
            isShared,
            priority: 'high',
          },
          trigger: { 
            type: 'date', 
            date: customTime 
          },
          sound: true,
          priority: Notifications.AndroidNotificationPriority.HIGH,
          badge: 1,
          channelId: 'goals',
        });
        
        notifications.push(customNotificationId);
        console.log(`📅 Scheduled custom notification at ${customTime.toLocaleString()}`);
      }
    }
    
    // Schedule default reminders (only if not already covered by custom time)
    const reminderConfigs = [
      { days: 7, message: `Goal "${goal.title}" due in 1 week`, priority: 'low' },
      { days: 3, message: `Goal "${goal.title}" due in 3 days`, priority: 'medium' },
      { days: 1, message: `Goal "${goal.title}" due tomorrow`, priority: 'high' },
      { hours: 12, message: `Goal "${goal.title}" due in 12 hours`, priority: 'high' },
      { hours: 1, message: `Goal "${goal.title}" due in 1 hour`, priority: 'max' },
    ];

    for (const config of reminderConfigs) {
      const notificationTime = new Date(deadline);
      
      if (config.days !== undefined) {
        notificationTime.setDate(deadline.getDate() - config.days);
      } else if (config.hours !== undefined) {
        notificationTime.setHours(deadline.getHours() - config.hours);
      }

      // Only schedule if notification time is in the future and not too close to custom time
      if (notificationTime > now) {
        // Check if this conflicts with custom notification time
        const hasCustomTime = goal.notificationTime && new Date(goal.notificationTime);
        if (hasCustomTime) {
          const timeDiff = Math.abs(notificationTime - hasCustomTime);
          const timeDiffMinutes = timeDiff / (1000 * 60);
          
          // Skip if too close to custom time (within 30 minutes)
          if (timeDiffMinutes < 30) {
            console.log(`Skipping ${config.days || config.hours} reminder - too close to custom time`);
            continue;
          }
        }
        
        const notificationId = `goal_${goal.id}_${config.days !== undefined ? config.days + 'd' : config.hours + 'h'}_${Date.now()}`;
        
        await scheduleLocalPushNotification({
          identifier: notificationId,
          title: `🎯 Goal Reminder`,
          body: config.message,
          data: {
            goalId: goal.id,
            type: NOTIFICATION_TYPES.GOAL_DEADLINE,
            screen: 'Goals',
            isShared,
            priority: config.priority,
          },
          trigger: { 
            type: 'date', 
            date: notificationTime 
          },
          sound: true,
          priority: getAndroidPriority(config.priority),
          badge: 1,
          channelId: 'goals',
        });

        notifications.push(notificationId);
      }
    }

    // FIX: Also store in Firestore if it's a shared goal
    if (isShared && goal.id) {
      try {
        const goalRef = doc(db, "goals", goal.id);
        await updateDoc(goalRef, {
          notificationIds: notifications,
          lastNotificationUpdate: serverTimestamp(),
        });
      } catch (firestoreError) {
        console.error('Error storing notification IDs in Firestore:', firestoreError);
      }
    }

    // Store in AsyncStorage for backward compatibility
    if (notifications.length > 0) {
      await storeNotificationId('goal', goal.id, notifications);
    }

    console.log(`✅ Scheduled ${notifications.length} notifications for goal: ${goal.title}`);
    return notifications;
  } catch (error) {
    console.error('Error scheduling goal notifications:', error);
    return [];
  }
};

/**
 * Cancel goal notifications
 * FIXED: Now checks Firestore first, then falls back to AsyncStorage
 */
export const cancelGoalNotifications = async (goalId) => {
  try {
    if (!goalId) {
      console.error('No goalId provided for cancellation');
      return false;
    }

    let storedIds = [];
    let cancelledCount = 0;
    
    // Try Firestore first
    try {
      const goalRef = doc(db, "goals", goalId);
      const goalSnap = await getDoc(goalRef);
      
      if (goalSnap.exists()) {
        const data = goalSnap.data();
        storedIds = data.notificationIds || [];
        
        // Clear from Firestore
        if (storedIds.length > 0) {
          await updateDoc(goalRef, {
            notificationIds: [],
            lastNotificationUpdate: serverTimestamp(),
          });
        }
      }
    } catch (firestoreError) {
      console.log('Could not fetch from Firestore:', firestoreError.message);
    }
    
    // Always check AsyncStorage as fallback
    try {
      const asyncStorageIds = await getStoredNotificationId('goal', goalId);
      if (asyncStorageIds) {
        if (Array.isArray(asyncStorageIds)) {
          // Merge with Firestore IDs, removing duplicates
          storedIds = [...new Set([...storedIds, ...asyncStorageIds])];
        } else {
          storedIds.push(asyncStorageIds);
        }
      }
    } catch (asyncError) {
      console.log('Error reading from AsyncStorage:', asyncError.message);
    }
    
    // Cancel all stored notification IDs
    for (const notificationId of storedIds) {
      try {
        await Notifications.cancelScheduledNotificationAsync(notificationId);
        cancelledCount++;
        console.log(`✅ Cancelled notification: ${notificationId}`);
      } catch (error) {
        console.log(`ℹ️ Notification ${notificationId} not found or already fired`);
      }
    }
    
    // Cancel by pattern as safety net
    const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
    const goalNotifications = scheduledNotifications.filter(
      notification => notification.identifier?.includes(`goal_${goalId}`)
    );
    
    for (const notification of goalNotifications) {
      try {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
        cancelledCount++;
        console.log(`✅ Cancelled pattern-matched notification: ${notification.identifier}`);
      } catch (error) {
        console.log(`ℹ️ Could not cancel ${notification.identifier}`);
      }
    }
    
    // Clean up AsyncStorage
    await removeStoredNotificationId('goal', goalId);
    
    console.log(`✅ Cancelled ${cancelledCount} notifications for goal: ${goalId}`);
    return cancelledCount > 0;
  } catch (error) {
    console.error('Error cancelling goal notifications:', error);
    return false;
  }
};

/**
 * Cancel all scheduled notifications
 */
export const cancelAllNotifications = async () => {
  try {
    // Cancel all scheduled notifications
    await Notifications.cancelAllScheduledNotificationsAsync();
    
    // Clear all stored notification IDs
    const keys = await AsyncStorage.getAllKeys();
    const notificationKeys = keys.filter(key => 
      key.startsWith('notification_') || 
      key.startsWith('recurring_')
    );
    await AsyncStorage.multiRemove(notificationKeys);
    
    console.log('✅ Cancelled all notifications');
    return true;
  } catch (error) {
    console.error('Error cancelling all notifications:', error);
    return false;
  }
};

/* ================================================================================
   NOTIFICATION STORAGE HELPERS
   ================================================================================ */

/**
 * Store notification ID
 */
const storeNotificationId = async (type, itemId, notificationId) => {
  try {
    const key = `notification_${type}_${itemId}`;
    
    if (Array.isArray(notificationId)) {
      await AsyncStorage.setItem(key, JSON.stringify(notificationId));
    } else {
      await AsyncStorage.setItem(key, notificationId);
    }
  } catch (error) {
    console.error('Error storing notification ID:', error);
  }
};

/**
 * Get stored notification ID
 */
const getStoredNotificationId = async (type, itemId) => {
  try {
    const key = `notification_${type}_${itemId}`;
    const value = await AsyncStorage.getItem(key);
    
    if (!value) return null;
    
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  } catch (error) {
    console.error('Error getting stored notification ID:', error);
    return null;
  }
};

/**
 * Remove stored notification ID
 */
const removeStoredNotificationId = async (type, itemId) => {
  try {
    const key = `notification_${type}_${itemId}`;
    await AsyncStorage.removeItem(key);
  } catch (error) {
    console.error('Error removing stored notification ID:', error);
  }
};

/**
 * Remove notification ID
 */
const removeNotificationId = async (notificationId) => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    for (const key of keys) {
      if (key.startsWith('notification_')) {
        const value = await AsyncStorage.getItem(key);
        if (value) {
          try {
            const ids = JSON.parse(value);
            if (Array.isArray(ids)) {
              if (ids.includes(notificationId)) {
                await AsyncStorage.removeItem(key);
                break;
              }
            } else if (value === notificationId) {
              await AsyncStorage.removeItem(key);
              break;
            }
          } catch {
            if (value === notificationId) {
              await AsyncStorage.removeItem(key);
              break;
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error removing notification ID:', error);
  }
};

/**
 * Store recurring notification
 */
const storeRecurringNotification = async (notificationId, config) => {
  try {
    const key = `recurring_${notificationId}`;
    await AsyncStorage.setItem(key, JSON.stringify(config));
  } catch (error) {
    console.error('Error storing recurring notification:', error);
  }
};

/**
 * Get recurring notification config
 */
const getRecurringNotificationConfig = async (notificationId) => {
  try {
    const key = `recurring_${notificationId}`;
    const config = await AsyncStorage.getItem(key);
    return config ? JSON.parse(config) : null;
  } catch (error) {
    console.error('Error getting recurring notification config:', error);
    return null;
  }
};

/* ================================================================================
   PUSH NOTIFICATIONS MANAGEMENT
   ================================================================================ */

// Request notification permissions
export const requestNotificationPermissions = async () => {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          allowAnnouncements: true,
        },
      });
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.warn('Notification permissions not granted');
      Alert.alert(
        'Notifications Disabled',
        'Please enable notifications in settings to receive reminders and updates.',
        [{ text: 'OK' }]
      );
      return false;
    }
    
    // Setup notification channels for Android
    if (Platform.OS === 'android') {
      // Default channel
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
        sound: 'default',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: false,
        showBadge: true,
        enableVibrate: true,
        enableLights: true,
      });
      
      // Goal notifications channel
      await Notifications.setNotificationChannelAsync('goals', {
        name: 'Goals',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#4CAF50',
        sound: 'goal_notification.wav',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: false,
        showBadge: true,
        enableVibrate: true,
        enableLights: true,
      });
      
      // Task notifications channel
      await Notifications.setNotificationChannelAsync('tasks', {
        name: 'Tasks',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250, 250],
        lightColor: '#2196F3',
        sound: 'task_notification.wav',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: true,
        showBadge: true,
        enableVibrate: true,
        enableLights: true,
      });
      
      // Achievement notifications channel
      await Notifications.setNotificationChannelAsync('achievements', {
        name: 'Achievements',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 250, 500],
        lightColor: '#FF9800',
        sound: 'achievement_notification.wav',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: true,
        showBadge: true,
        enableVibrate: true,
        enableLights: true,
      });

      // Collaboration channel
      await Notifications.setNotificationChannelAsync('collaboration', {
        name: 'Collaboration',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 100, 250],
        lightColor: '#9C27B0',
        sound: 'message_notification.wav',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: false,
        showBadge: true,
        enableVibrate: true,
        enableLights: true,
      });

      // Invitations channel
      await Notifications.setNotificationChannelAsync('invitations', {
        name: 'Invitations',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 300, 100, 300],
        lightColor: '#FF5722',
        sound: 'invitation_notification.wav',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: false,
        showBadge: true,
        enableVibrate: true,
        enableLights: true,
      });
    }
    
    // Store permission status
    await AsyncStorage.setItem('notificationPermissionsGranted', 'true');
    console.log('✅ Notification permissions granted');
    return true;
  } catch (error) {
    console.error('Error requesting notification permissions:', error);
    return false;
  }
};

/**
 * Get push notification token
 */
export const getPushNotificationToken = async () => {
  try {
    if (!await hasNotificationPermissions()) {
      await requestNotificationPermissions();
    }
    
    const projectId = process.env.EXPO_PUBLIC_PROJECT_ID;
    if (!projectId) {
      console.warn('EXPO_PUBLIC_PROJECT_ID not set');
      return null;
    }
    
    const token = await Notifications.getExpoPushTokenAsync({ 
      projectId,
      experienceId: '@your-username/your-app-slug', // Update with your experience ID
    });
    
    // Store token for later use
    await AsyncStorage.setItem('expoPushToken', token.data);
    console.log('✅ Expo push token:', token.data);
    
    return token.data;
  } catch (error) {
    console.error('Error getting push token:', error);
    return null;
  }
};

/**
 * Check if notification permissions are granted
 */
export const hasNotificationPermissions = async () => {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('Error checking notification permissions:', error);
    return false;
  }
};

/* ================================================================================
   SCHEDULED NOTIFICATIONS
   ================================================================================ */

/**
 * Schedule local push notification
 */
export const scheduleLocalPushNotification = async (notificationConfig) => {
  try {
    const {
      title,
      body,
      data = {},
      trigger,
      identifier,
      sound = true,
      priority = Notifications.AndroidNotificationPriority.DEFAULT,
      badge = 1,
      channelId = Platform.OS === 'android' ? 'default' : undefined,
      categoryIdentifier,
      subtitle,
      launchImageName,
      attachments,
    } = notificationConfig;

    if (!trigger) {
      throw new Error('Trigger is required for scheduling notifications');
    }

    // Validate trigger object
    if (!trigger.type && !trigger.channelId) {
      console.warn('Trigger object missing type or channelId, defaulting to timeInterval');
      // Auto-correct common trigger formats
      if (trigger.seconds !== undefined) {
        trigger.type = 'timeInterval';
      } else if (trigger.date !== undefined) {
        trigger.type = 'date';
      } else if (trigger.weekday !== undefined || trigger.hour !== undefined || trigger.minute !== undefined) {
        trigger.type = 'daily';
      } else {
        // Default to immediate notification
        trigger.type = 'timeInterval';
        trigger.seconds = 1;
      }
    }

    const notificationId = identifier || `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Build content object with only defined values to avoid iOS casting errors
    const content = {
      title,
      body,
      data,
      sound,
      priority,
      badge,
    };
    
    // Only add optional fields if they have valid values
    if (subtitle !== undefined && subtitle !== null) {
      content.subtitle = subtitle;
    }
    if (launchImageName !== undefined && launchImageName !== null) {
      content.launchImageName = launchImageName;
    }
    if (attachments !== undefined && attachments !== null) {
      content.attachments = attachments;
    }
    if (categoryIdentifier !== undefined && categoryIdentifier !== null) {
      content.categoryIdentifier = categoryIdentifier;
    }
    
    await Notifications.scheduleNotificationAsync({
      identifier: notificationId,
      content,
      trigger,
    });

    console.log(`✅ Scheduled push notification: ${notificationId}`);
    return notificationId;
  } catch (error) {
    console.error('Error scheduling push notification:', error);
    throw error;
  }
};

/**
 * Get Android priority from string
 */
const getAndroidPriority = (priority) => {
  switch (priority) {
    case 'max': return Notifications.AndroidNotificationPriority.MAX;
    case 'high': return Notifications.AndroidNotificationPriority.HIGH;
    case 'medium': return Notifications.AndroidNotificationPriority.DEFAULT;
    case 'low': return Notifications.AndroidNotificationPriority.LOW;
    case 'min': return Notifications.AndroidNotificationPriority.MIN;
    default: return Notifications.AndroidNotificationPriority.DEFAULT;
  }
};

/**
 * Schedule recurring notifications
 */
export const scheduleRecurringNotification = async (config) => {
  try {
    const {
      type,
      title,
      body,
      data,
      trigger,
      identifier,
      userId,
    } = config;

    const notificationId = identifier || `recurring_${type}_${Date.now()}`;

    // Validate trigger for recurring notifications
    const validatedTrigger = { ...trigger };
    if (!validatedTrigger.type) {
      if (validatedTrigger.seconds !== undefined) {
        validatedTrigger.type = 'timeInterval';
      } else if (validatedTrigger.date !== undefined) {
        validatedTrigger.type = 'date';
      } else if (validatedTrigger.weekday !== undefined || validatedTrigger.hour !== undefined || validatedTrigger.minute !== undefined) {
        validatedTrigger.type = 'daily';
      }
    }

    // Schedule push notification
    await scheduleLocalPushNotification({
      identifier: notificationId,
      title,
      body,
      data: {
        ...data,
        type,
        recurring: true,
      },
      trigger: validatedTrigger,
      sound: true,
      priority: Notifications.AndroidNotificationPriority.DEFAULT,
      badge: 1,
    });

    // Store recurring notification info
    await storeRecurringNotification(notificationId, config);

    return notificationId;
  } catch (error) {
    console.error('Error scheduling recurring notification:', error);
    return null;
  }
};

/**
 * Cancel notification by ID
 */
export const cancelNotificationById = async (notificationId) => {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
    
    // Remove from stored IDs
    await removeNotificationId(notificationId);
    
    console.log(`✅ Cancelled push notification: ${notificationId}`);
    return true;
  } catch (error) {
    console.error(`Error cancelling push notification ${notificationId}:`, error);
    return false;
  }
};

/* ================================================================================
   NOTIFICATION UTILITIES
   ================================================================================ */

/**
 * Get all scheduled notifications
 */
export const getAllScheduledNotifications = async () => {
  try {
    return await Notifications.getAllScheduledNotificationsAsync();
  } catch (error) {
    console.error('Error getting scheduled notifications:', error);
    return [];
  }
};

/**
 * Check if a task has a scheduled notification
 */
export const hasScheduledNotification = async (taskId) => {
  try {
    const storedId = await getStoredNotificationId('task', taskId);
    if (storedId) return true;
    
    const notifications = await getAllScheduledNotifications();
    return notifications.some(notification => 
      notification.identifier?.includes(`task_${taskId}`)
    );
  } catch (error) {
    console.error('Error checking notification:', error);
    return false;
  }
};

/**
 * Check if a goal has scheduled notifications
 */
export const hasScheduledGoalNotifications = async (goalId) => {
  try {
    const storedIds = await getStoredNotificationId('goal', goalId);
    if (storedIds && storedIds.length > 0) return true;
    
    const notifications = await getAllScheduledNotifications();
    return notifications.some(notification => 
      notification.identifier?.includes(`goal_${goalId}`)
    );
  } catch (error) {
    console.error('Error checking goal notifications:', error);
    return false;
  }
};

/**
 * Setup notification response handler (when user taps on notification)
 */
export const setupNotificationResponseHandler = (navigation) => {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const { taskId, goalId, screen, type, isShared, category } = response.notification.request.content.data;
    
    // Handle based on notification type
    switch (type) {
      case NOTIFICATION_TYPES.TASK_REMINDER:
        navigation.navigate('Planner', { 
          screen: 'Planner',
          params: { focusTaskId: taskId }
        });
        break;
        
      case NOTIFICATION_TYPES.GOAL_REMINDER:
      case NOTIFICATION_TYPES.GOAL_DEADLINE:
      case NOTIFICATION_TYPES.GOAL_PROGRESS:
      case NOTIFICATION_TYPES.GOAL_COMPLETED:
        navigation.navigate('Goals', { 
          screen: isShared ? 'SharedGoalDetail' : 'GoalDetail',
          params: { goalId: goalId }
        });
        break;

      case NOTIFICATION_TYPES.GOAL_INVITE:
      case NOTIFICATION_TYPES.SHARED_GOAL_INVITATION:
        navigation.navigate('Goals', {
          screen: 'SharedGoals',
          params: { notificationGoalId: goalId }
        });
        break;

      case NOTIFICATION_TYPES.COMMENT:
      case NOTIFICATION_TYPES.PROGRESS_UPDATE:
      case NOTIFICATION_TYPES.GOAL_UPDATED:
        if (goalId) {
          navigation.navigate('Goals', {
            screen: 'SharedGoalDetail',
            params: { goalId: goalId }
          });
        }
        break;
        
      default:
        // Navigate to notifications screen
        navigation.navigate('Notifications');
    }
  });
  
  return subscription;
};

/**
 * Setup notification received handler (when notification arrives while app is foreground)
 */
export const setupNotificationReceivedHandler = () => {
  const subscription = Notifications.addNotificationReceivedListener((notification) => {
    // Handle notification received while app is in foreground
    const { title, body, data } = notification.request.content;
    
    // You can show a custom alert or update UI here
    console.log('Notification received in foreground:', { title, body, data });
    
    // Update badge count
    updateBadgeCount();
  });
  
  return subscription;
};

/**
 * Update badge count
 */
export const updateBadgeCount = async () => {
  try {
    // Get unread notifications count from Firestore
    // This would typically be fetched from your backend
    const badgeCount = 1; // Placeholder - implement your logic here
    await Notifications.setBadgeCountAsync(badgeCount);
  } catch (error) {
    console.error('Error updating badge count:', error);
  }
};

/**
 * Clear badge count
 */
export const clearBadgeCount = async () => {
  try {
    await Notifications.setBadgeCountAsync(0);
  } catch (error) {
    console.error('Error clearing badge count:', error);
  }
};

/**
 * Send test notification (for debugging)
 */
export const sendTestNotification = async (title = 'Test Notification', body = 'This is a test notification') => {
  try {
    await scheduleLocalPushNotification({
      title,
      body,
      data: { type: 'test' },
      trigger: { 
        type: 'timeInterval', 
        seconds: 2 
      },
    });
    return true;
  } catch (error) {
    console.error('Error sending test notification:', error);
    return false;
  }
};

/* ================================================================================
   NOTIFICATION SETTINGS
   ================================================================================ */

/**
 * Get notification settings for a user
 */
export const getNotificationSettings = async (userId) => {
  try {
    const defaultSettings = {
      enabled: true,
      pushEnabled: true,
      inAppEnabled: true,
      soundEnabled: true,
      vibrationEnabled: true,
      taskReminders: true,
      goalReminders: true,
      goalProgressUpdates: true,
      goalDeadlineReminders: true,
      goalMilestoneNotifications: true,
      goalCompletedNotifications: true,
      sharedGoalUpdates: true,
      sharedGoalInvitations: true,
      achievementNotifications: true,
      weeklySummary: true,
      quietHours: {
        enabled: false,
        startTime: '22:00',
        endTime: '08:00',
      },
      notificationPreferences: {
        taskPriorityHigh: true,
        taskPriorityMedium: true,
        taskPriorityLow: false,
        goalDeadline7Days: true,
        goalDeadline3Days: true,
        goalDeadline1Day: true,
        goalDeadline12Hours: true,
        goalDeadline1Hour: true,
      },
    };
    
    const settings = await AsyncStorage.getItem(`notification_settings_${userId}`);
    return settings ? JSON.parse(settings) : defaultSettings;
  } catch (error) {
    console.error('Error getting notification settings:', error);
    return null;
  }
};

/**
 * Save notification settings for a user
 */
export const saveNotificationSettings = async (userId, settings) => {
  try {
    await AsyncStorage.setItem(`notification_settings_${userId}`, JSON.stringify(settings));
    return true;
  } catch (error) {
    console.error('Error saving notification settings:', error);
    return false;
  }
};

/**
 * Check if notifications are allowed based on quiet hours
 */
export const isNotificationAllowed = async (userId) => {
  try {
    const settings = await getNotificationSettings(userId);
    
    if (!settings || !settings.enabled) {
      return false;
    }
    
    // Check quiet hours
    if (settings.quietHours?.enabled) {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      
      const [startHour, startMinute] = settings.quietHours.startTime.split(':').map(Number);
      const [endHour, endMinute] = settings.quietHours.endTime.split(':').map(Number);
      
      const startTime = new Date();
      startTime.setHours(startHour, startMinute, 0, 0);
      
      const endTime = new Date();
      endTime.setHours(endHour, endMinute, 0, 0);
      
      // Handle overnight quiet hours
      if (startTime > endTime) {
        // Quiet hours span midnight (e.g., 22:00 to 08:00)
        if (now >= startTime || now < endTime) {
          return false;
        }
      } else {
        // Quiet hours within the same day
        if (now >= startTime && now < endTime) {
          return false;
        }
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error checking notification allowance:', error);
    return true; // Default to allowing notifications on error
  }
};

/**
 * Helper to check if notification type is enabled for user
 */
export const isNotificationTypeEnabled = async (userId, notificationType) => {
  try {
    const settings = await getNotificationSettings(userId);
    
    if (!settings || !settings.enabled) {
      return false;
    }
    
    // Map notification types to settings
    const typeMap = {
      [NOTIFICATION_TYPES.TASK_REMINDER]: 'taskReminders',
      [NOTIFICATION_TYPES.GOAL_REMINDER]: 'goalReminders',
      [NOTIFICATION_TYPES.GOAL_DEADLINE]: 'goalDeadlineReminders',
      [NOTIFICATION_TYPES.GOAL_PROGRESS]: 'goalProgressUpdates',
      [NOTIFICATION_TYPES.GOAL_COMPLETED]: 'goalCompletedNotifications',
      [NOTIFICATION_TYPES.GOAL_MILESTONE_REACHED]: 'goalMilestoneNotifications',
      [NOTIFICATION_TYPES.SHARED_GOAL_UPDATE]: 'sharedGoalUpdates',
      [NOTIFICATION_TYPES.SHARED_GOAL_INVITATION]: 'sharedGoalInvitations',
      [NOTIFICATION_TYPES.ACHIEVEMENT_UNLOCKED]: 'achievementNotifications',
      [NOTIFICATION_TYPES.WEEKLY_SUMMARY]: 'weeklySummary',
    };
    
    const settingKey = typeMap[notificationType];
    return settingKey ? settings[settingKey] !== false : true;
  } catch (error) {
    console.error('Error checking notification type:', error);
    return true; // Default to enabled on error
  }
};

/* ================================================================================
   EXPORTS
   ================================================================================ */

export default {
  // Constants
  NOTIFICATION_TYPES,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_PRIORITY,
  
  // In-App Notifications (for SharedGoalsScreen)
  sendNotification,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  clearAllUserNotifications,
  
  // Configuration
  configureNotificationHandler,
  requestNotificationPermissions,
  hasNotificationPermissions,
  getPushNotificationToken,
  
  // Scheduling (for Planner screen)
  scheduleLocalPushNotification,
  scheduleTaskNotification,
  scheduleGoalNotifications,
  scheduleRecurringNotification,
  
  // Cancellation (for Planner screen)
  cancelNotificationById,
  cancelTaskNotification,
  cancelGoalNotifications,
  cancelAllNotifications,
  
  // Utilities
  getAllScheduledNotifications,
  hasScheduledNotification,
  hasScheduledGoalNotifications,
  setupNotificationResponseHandler,
  setupNotificationReceivedHandler,
  updateBadgeCount,
  clearBadgeCount,
  
  // Test functions
  sendTestNotification,
  
  // Settings
  getNotificationSettings,
  saveNotificationSettings,
  isNotificationAllowed,
  isNotificationTypeEnabled,
};