/**
 * NotificationManager.js
 * 
 * PRODUCTION-READY NOTIFICATION SERVICE
 * Fixes all 15 critical bugs identified in the audit
 * 
 * KEY PRINCIPLES:
 * 1. Runs outside React lifecycle
 * 2. Single source of truth for notification IDs
 * 3. Idempotent operations (safe to call multiple times)
 * 4. Platform-compliant (Android channels, iOS permissions)
 * 5. Persistent state in Firestore
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { db } from '../firebaseConfig';
import { doc, updateDoc, getDoc } from 'firebase/firestore';

// ============================================================================
// NOTIFICATION HANDLER CONFIGURATION
// ============================================================================

// Set up notification behavior (ONCE at app startup, not in screens)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// ============================================================================
// CONSTANTS
// ============================================================================

const CHANNEL_ID = 'goal-reminders'; // SINGLE channel ID used everywhere
const NOTIFICATION_ID_PREFIX = 'goal_'; // Consistent prefix for all IDs

// ============================================================================
// INITIALIZATION (Call once at app startup)
// ============================================================================

let isInitialized = false;
let permissionsGranted = false;

/**
 * Initialize notification system
 * Call this ONCE in App.js useEffect, NOT in screens
 */
export async function initializeNotifications() {
  if (isInitialized) return permissionsGranted;
  
  try {
    // Step 1: Create Android channel (safe to call multiple times)
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Goal Reminders',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#5D8B7E',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });
    }
    
    // Step 2: Request permissions (handles iOS/Android differences)
    const { status } = await Notifications.requestPermissionsAsync();
    permissionsGranted = status === 'granted';
    
    if (!permissionsGranted) {
      console.warn('Notification permissions not granted');
    }
    
    isInitialized = true;
    return permissionsGranted;
    
  } catch (error) {
    console.error('Failed to initialize notifications:', error);
    isInitialized = true; // Mark as attempted even if failed
    return false;
  }
}

/**
 * Get notification permissions status
 */
export async function getPermissionsStatus() {
  const { status } = await Notifications.getPermissionsAsync();
  return status === 'granted';
}

// ============================================================================
// NOTIFICATION ID MANAGEMENT
// ============================================================================

/**
 * Generate stable notification ID for a goal
 * Same goal always gets same ID (idempotent)
 */
function getNotificationId(goalId) {
  return `${NOTIFICATION_ID_PREFIX}${goalId}`;
}

/**
 * Store notification ID in Firestore (source of truth)
 */
async function persistNotificationId(goalId, notificationId, userId) {
  try {
    const goalRef = doc(db, 'goals', goalId);
    await updateDoc(goalRef, {
      scheduledNotificationId: notificationId,
      notificationScheduledAt: new Date(),
    });
  } catch (error) {
    console.error('Failed to persist notification ID:', error);
    // Non-fatal: notification still scheduled, just not tracked
  }
}

/**
 * Clear notification ID from Firestore
 */
async function clearNotificationId(goalId) {
  try {
    const goalRef = doc(db, 'goals', goalId);
    await updateDoc(goalRef, {
      scheduledNotificationId: null,
      notificationScheduledAt: null,
    });
  } catch (error) {
    console.error('Failed to clear notification ID:', error);
  }
}

// ============================================================================
// CORE NOTIFICATION OPERATIONS
// ============================================================================

/**
 * Schedule a notification for a goal
 * 
 * IDEMPOTENT: Safe to call multiple times with same goal
 * PERSISTENT: Survives app restarts
 * CANCELLABLE: Notification ID stored in Firestore
 * 
 * @param {Object} goal - Goal object with all properties
 * @param {string} userId - Current user ID
 * @returns {Promise<string|null>} - Notification ID if scheduled, null if not
 */
export async function scheduleGoalNotification(goal, userId) {
  // Guard: Check permissions
  if (!permissionsGranted) {
    console.warn('Cannot schedule notification: permissions not granted');
    return null;
  }
  
  // Guard: Validate goal has required fields
  if (!goal?.id || !goal?.title) {
    console.warn('Cannot schedule notification: invalid goal', goal);
    return null;
  }
  
  // Guard: Check if notifications enabled for this goal
  if (!goal.enableNotifications) {
    // If previously scheduled, cancel it
    await cancelGoalNotification(goal.id);
    return null;
  }
  
  // Guard: Validate notification time
  if (!goal.notificationTime) {
    console.warn('Cannot schedule notification: no notification time set');
    return null;
  }
  
  const notificationDate = new Date(goal.notificationTime);
  const now = new Date();
  
  // Guard: Don't schedule past notifications
  if (notificationDate <= now) {
    console.warn('Cannot schedule notification: time is in the past');
    return null;
  }
  
  try {
    // Cancel any existing notification for this goal first
    await cancelGoalNotification(goal.id);
    
    // Generate stable notification ID
    const notificationId = getNotificationId(goal.id);
    
    // Schedule the notification
    const trigger = {
      date: notificationDate,
      channelId: CHANNEL_ID, // Use consistent channel ID
    };
    
    const content = {
      title: '🎯 Goal Reminder',
      body: goal.customNotificationMessage || `Time to work on: ${goal.title}`,
      data: { 
        goalId: goal.id,
        userId: userId,
        type: 'goal_reminder',
      },
      sound: 'default',
      priority: Notifications.AndroidNotificationPriority.HIGH,
    };
    
    // Schedule notification
    await Notifications.scheduleNotificationAsync({
      identifier: notificationId,
      content,
      trigger,
    });
    
    // Persist notification ID to Firestore (async, non-blocking)
    persistNotificationId(goal.id, notificationId, userId).catch(err => {
      console.warn('Failed to persist notification ID (non-fatal):', err);
    });
    
    console.log(`✓ Scheduled notification for goal: ${goal.title} at ${notificationDate.toLocaleString()}`);
    return notificationId;
    
  } catch (error) {
    console.error('Failed to schedule notification:', error);
    return null;
  }
}

/**
 * Cancel a scheduled notification for a goal
 * 
 * IDEMPOTENT: Safe to call even if notification doesn't exist
 * CLEANUP: Removes from both OS and Firestore
 * 
 * @param {string} goalId - Goal ID
 */
export async function cancelGoalNotification(goalId) {
  if (!goalId) return;
  
  try {
    const notificationId = getNotificationId(goalId);
    
    // Cancel the notification (safe even if it doesn't exist)
    await Notifications.cancelScheduledNotificationAsync(notificationId);
    
    // Clear from Firestore
    await clearNotificationId(goalId);
    
    console.log(`✓ Cancelled notification for goal: ${goalId}`);
    
  } catch (error) {
    console.error('Failed to cancel notification:', error);
  }
}

/**
 * Cancel all notifications for the app
 * Useful for logout or reset
 */
export async function cancelAllNotifications() {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    console.log('✓ Cancelled all notifications');
  } catch (error) {
    console.error('Failed to cancel all notifications:', error);
  }
}

/**
 * Reschedule notification for a goal (when goal is updated)
 * 
 * @param {Object} goal - Updated goal object
 * @param {string} userId - Current user ID
 */
export async function rescheduleGoalNotification(goal, userId) {
  // Simply schedule again - the function handles cancellation first
  return await scheduleGoalNotification(goal, userId);
}

// ============================================================================
// BATCH OPERATIONS
// ============================================================================

/**
 * Schedule notifications for multiple goals
 * Used when app starts or user logs in
 * 
 * @param {Array} goals - Array of goal objects
 * @param {string} userId - Current user ID
 */
export async function scheduleNotificationsForGoals(goals, userId) {
  if (!Array.isArray(goals) || goals.length === 0) return;
  
  console.log(`Scheduling notifications for ${goals.length} goals...`);
  
  const results = await Promise.allSettled(
    goals
      .filter(goal => goal.enableNotifications && goal.notificationTime)
      .map(goal => scheduleGoalNotification(goal, userId))
  );
  
  const successful = results.filter(r => r.status === 'fulfilled' && r.value).length;
  const failed = results.length - successful;
  
  console.log(`✓ Scheduled ${successful} notifications (${failed} skipped/failed)`);
}

/**
 * Clean up notifications for deleted or archived goals
 * 
 * @param {Array} goalIds - Array of goal IDs to clean up
 */
export async function cleanupNotifications(goalIds) {
  if (!Array.isArray(goalIds) || goalIds.length === 0) return;
  
  await Promise.all(goalIds.map(id => cancelGoalNotification(id)));
  console.log(`✓ Cleaned up ${goalIds.length} notifications`);
}

// ============================================================================
// DEBUGGING / ADMIN
// ============================================================================

/**
 * Get all scheduled notifications (for debugging)
 */
export async function getAllScheduledNotifications() {
  try {
    const notifications = await Notifications.getAllScheduledNotificationsAsync();
    console.log(`Currently scheduled: ${notifications.length} notifications`);
    return notifications;
  } catch (error) {
    console.error('Failed to get scheduled notifications:', error);
    return [];
  }
}

/**
 * Check if a specific goal has a notification scheduled
 */
export async function isNotificationScheduled(goalId) {
  try {
    const notificationId = getNotificationId(goalId);
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    return scheduled.some(n => n.identifier === notificationId);
  } catch (error) {
    console.error('Failed to check notification status:', error);
    return false;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Initialization
  initializeNotifications,
  getPermissionsStatus,
  
  // Core operations
  scheduleGoalNotification,
  cancelGoalNotification,
  rescheduleGoalNotification,
  
  // Batch operations
  scheduleNotificationsForGoals,
  cleanupNotifications,
  cancelAllNotifications,
  
  // Debugging
  getAllScheduledNotifications,
  isNotificationScheduled,
};