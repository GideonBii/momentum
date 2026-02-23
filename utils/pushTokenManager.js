// utils/pushTokenManager.js
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { Alert, Platform } from 'react-native';
import { db } from '../firebaseConfig';

export const registerForPushNotificationsAsync = async (userId) => {
  try {
    if (!Device.isDevice) {
      console.log('Must use physical device for push notifications');
      return null;
    }

    // Request permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      Alert.alert('Failed to get push token for push notification!');
      return null;
    }

    // Get project ID
    const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? 
                      Constants?.easConfig?.projectId;
    
    if (!projectId) {
      console.error('Project ID not found');
      return null;
    }

    // Get push token
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    console.log('Expo push token:', token);

    // Save to Firestore
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      expoPushToken: token,
      pushTokenUpdatedAt: new Date().toISOString(),
    });

    // Set up Android channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
      await Notifications.setNotificationChannelAsync('high-priority', {
        name: 'High Priority',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    return token;
  } catch (error) {
    console.error('Error getting push token:', error);
    return null;
  }
};

// Call this when app starts or user logs in
export const setupPushToken = async (user) => {
  if (!user) return;
  
  try {
    // Check if token exists and is valid
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    const userData = userDoc.data();
    
    // Refresh token if older than 30 days or missing
    const tokenAge = userData?.pushTokenUpdatedAt 
      ? (new Date() - new Date(userData.pushTokenUpdatedAt)) / (1000 * 60 * 60 * 24)
      : Infinity;
    
    if (!userData?.expoPushToken || tokenAge > 30) {
      await registerForPushNotificationsAsync(user.uid);
    }
  } catch (error) {
    console.error('Error setting up push token:', error);
  }
};