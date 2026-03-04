// utils/pushTokenManager.js
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Alert, Platform } from 'react-native';
import { supabase } from '../supabaseConfig';

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

    // Save to Supabase
    await supabase
      .from('profiles')
      .update({
        expo_push_token: token,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

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
    const { data } = await supabase
      .from('profiles')
      .select('expo_push_token, updated_at')
      .eq('id', user.id)
      .single();

    // Refresh token if older than 30 days or missing
    const tokenAge = data?.updated_at
      ? (new Date() - new Date(data.updated_at)) / (1000 * 60 * 60 * 24)
      : Infinity;

    if (!data?.expo_push_token || tokenAge > 30) {
      await registerForPushNotificationsAsync(user.id);
    }
  } catch (error) {
    console.error('Error setting up push token:', error);
  }
};