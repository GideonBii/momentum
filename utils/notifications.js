// utils/notificationUtils.js
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowAlert: true,
  }),
});

// Request notification permissions
export const requestNotificationPermissions = async () => {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.log('Notification permissions not granted');
      return false;
    }
    
    // Get push token (for push notifications if needed)
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }
    
    return true;
  } catch (error) {
    console.error('Error requesting notification permissions:', error);
    return false;
  }
};

// Get push notification token (for server-side push notifications)
export const getPushNotificationToken = async () => {
  try {
    const projectId = "YOUR_EXPO_PROJECT_ID"; // Get from Expo
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data;
  } catch (error) {
    console.error('Error getting push token:', error);
    return null;
  }
};

// Schedule a single notification
export const scheduleNotification = async (task) => {
  try {
    const { id, title, dueDate, customNotificationMessage, notificationTime } = task;
    
    // Calculate when to send the notification
    let triggerDate = notificationTime || new Date(dueDate);
    
    // Don't schedule if in the past
    if (triggerDate <= new Date()) {
      console.log('Notification time is in the past, skipping');
      return null;
    }
    
    // Cancel any existing notification for this task
    await cancelTaskNotification(id);
    
    // Generate unique identifier
    const notificationId = `task_${id}_${Date.now()}`;
    
    // Schedule the notification
    await Notifications.scheduleNotificationAsync({
      identifier: notificationId,
      content: {
        title: `📅 Task Reminder: ${title}`,
        body: customNotificationMessage || `"${title}" is due soon!`,
        data: { 
          taskId: id, 
          type: 'task_reminder',
          screen: 'Planner',
          dueDate: dueDate.toISOString()
        },
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        badge: 1,
      },
      trigger: {
        date: triggerDate,
      },
    });
    
    // Store notification ID for later cancellation
    await AsyncStorage.setItem(`notification_${id}`, notificationId);
    
    console.log(`Scheduled notification: ${notificationId} for ${triggerDate}`);
    return notificationId;
  } catch (error) {
    console.error('Error scheduling notification:', error);
    return null;
  }
};

// Cancel a specific task notification
export const cancelTaskNotification = async (taskId) => {
  try {
    // Get the stored notification ID
    const notificationId = await AsyncStorage.getItem(`notification_${taskId}`);
    
    if (notificationId) {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
      await AsyncStorage.removeItem(`notification_${taskId}`);
      console.log(`Cancelled notification: ${notificationId}`);
    }
    
    // Also try to cancel by identifier pattern
    const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
    const taskNotifications = scheduledNotifications.filter(
      notification => notification.identifier?.includes(`task_${taskId}`)
    );
    
    for (const notification of taskNotifications) {
      await Notifications.cancelScheduledNotificationAsync(notification.identifier);
    }
    
    return true;
  } catch (error) {
    console.error('Error cancelling notification:', error);
    return false;
  }
};

// Cancel all scheduled notifications
export const cancelAllNotifications = async () => {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    
    // Clear all stored notification IDs
    const keys = await AsyncStorage.getAllKeys();
    const notificationKeys = keys.filter(key => key.startsWith('notification_'));
    await AsyncStorage.multiRemove(notificationKeys);
    
    console.log('Cancelled all notifications');
    return true;
  } catch (error) {
    console.error('Error cancelling all notifications:', error);
    return false;
  }
};

// Get all scheduled notifications
export const getAllScheduledNotifications = async () => {
  try {
    return await Notifications.getAllScheduledNotificationsAsync();
  } catch (error) {
    console.error('Error getting scheduled notifications:', error);
    return [];
  }
};

// Check if a task has a scheduled notification
export const hasScheduledNotification = async (taskId) => {
  try {
    const notifications = await getAllScheduledNotifications();
    return notifications.some(notification => 
      notification.identifier?.includes(`task_${taskId}`)
    );
  } catch (error) {
    console.error('Error checking notification:', error);
    return false;
  }
};

// Handle notification response (when user taps on notification)
export const setupNotificationResponseHandler = (navigation) => {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const { taskId, screen } = response.notification.request.content.data;
    
    if (taskId && screen === 'Planner') {
      // Navigate to the task or planner screen
      navigation.navigate('Planner', { 
        screen: 'Planner',
        params: { focusTaskId: taskId }
      });
    }
  });
  
  return subscription;
};

// Test notification (for debugging)
export const sendTestNotification = async (title = 'Test Notification', body = 'This is a test notification') => {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
        data: { type: 'test' },
      },
      trigger: { seconds: 2 },
    });
    return true;
  } catch (error) {
    console.error('Error sending test notification:', error);
    return false;
  }
};