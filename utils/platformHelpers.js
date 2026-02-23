// utils/platformHelpers.js
// Platform-safe wrappers for native modules
// Ensures cross-platform compatibility (web, iOS, Android)

import { Alert, Platform } from 'react-native';

const log = (...args) => console.log('[PLATFORM]', ...args);
const logError = (...args) => console.error('[PLATFORM ERROR]', ...args);

/* ================================================================================
   HAPTICS - Platform-Safe Wrapper
   ================================================================================ */

/**
 * Trigger haptic feedback safely across platforms
 * @param {string} style - 'light', 'medium', or 'heavy'
 */
export const triggerHaptic = async (style = 'light') => {
  // Skip on web - no haptic support
  if (Platform.OS === 'web') {
    return;
  }
  
  try {
    const Haptics = require('expo-haptics');
    
    const styleMap = {
      light: Haptics.ImpactFeedbackStyle.Light,
      medium: Haptics.ImpactFeedbackStyle.Medium,
      heavy: Haptics.ImpactFeedbackStyle.Heavy,
    };
    
    const feedbackStyle = styleMap[style] || styleMap.light;
    await Haptics.impactAsync(feedbackStyle);
    
  } catch (error) {
    logError('Haptics not available:', error.message);
  }
};

/**
 * Trigger notification haptic feedback
 * @param {string} type - 'success', 'warning', or 'error'
 */
export const triggerNotificationHaptic = async (type = 'success') => {
  if (Platform.OS === 'web') return;
  
  try {
    const Haptics = require('expo-haptics');
    
    const typeMap = {
      success: Haptics.NotificationFeedbackType.Success,
      warning: Haptics.NotificationFeedbackType.Warning,
      error: Haptics.NotificationFeedbackType.Error,
    };
    
    const feedbackType = typeMap[type] || typeMap.success;
    await Haptics.notificationAsync(feedbackType);
    
  } catch (error) {
    logError('Notification haptics not available:', error.message);
  }
};

/**
 * Trigger selection haptic feedback
 */
export const triggerSelectionHaptic = async () => {
  if (Platform.OS === 'web') return;
  
  try {
    const Haptics = require('expo-haptics');
    await Haptics.selectionAsync();
  } catch (error) {
    logError('Selection haptics not available:', error.message);
  }
};

/* ================================================================================
   FILE SYSTEM - Platform-Safe Export
   ================================================================================ */

/**
 * Export content to file with platform-specific handling
 * @param {string} filename - Name of file to export
 * @param {string} content - Content to export
 * @param {string} mimeType - MIME type (default: application/json)
 * @returns {Promise<boolean>} Success status
 */
export const exportToFile = async (filename, content, mimeType = 'application/json') => {
  try {
    log('Exporting file:', filename);
    
    if (Platform.OS === 'web') {
      // Web: Use browser download
      log('Using web download...');
      
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      log('✅ Web download successful');
      return true;
      
    } else {
      // Native: Use FileSystem and Sharing
      log('Using native file system...');
      
      const FileSystem = require('expo-file-system');
      const Sharing = require('expo-sharing');
      
      const fileUri = FileSystem.documentDirectory + filename;
      
      // Write file
      await FileSystem.writeAsStringAsync(fileUri, content, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      
      log('File written to:', fileUri);
      
      // Check if sharing is available
      const canShare = await Sharing.isAvailableAsync();
      
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType,
          dialogTitle: 'Export Data',
          UTI: mimeType,
        });
        log('✅ File shared successfully');
      } else {
        log('⚠️ Sharing not available, file saved to:', fileUri);
      }
      
      return true;
    }
    
  } catch (error) {
    logError('Export failed:', error);
    logError('Stack:', error.stack);
    
    Alert.alert(
      'Export Failed',
      'Could not export file. Please try again.',
      [{ text: 'OK' }]
    );
    
    return false;
  }
};

/**
 * Import file from filesystem (native only)
 * @returns {Promise<string|null>} File content or null
 */
export const importFromFile = async () => {
  if (Platform.OS === 'web') {
    log('File import not supported on web');
    Alert.alert('Not Supported', 'File import is only available on mobile devices.');
    return null;
  }
  
  try {
    const DocumentPicker = require('expo-document-picker');
    
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/json',
      copyToCacheDirectory: true,
    });
    
    if (result.type === 'cancel') {
      log('Import cancelled by user');
      return null;
    }
    
    const FileSystem = require('expo-file-system');
    const content = await FileSystem.readAsStringAsync(result.uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    
    log('✅ File imported successfully');
    return content;
    
  } catch (error) {
    logError('Import failed:', error);
    Alert.alert('Import Failed', 'Could not read file. Please try again.');
    return null;
  }
};

/* ================================================================================
   NOTIFICATIONS - Platform-Safe Permission Checks
   ================================================================================ */

/**
 * Check if notification permissions are granted
 * @returns {Promise<boolean>}
 */
export const checkNotificationPermissions = async () => {
  // Web doesn't support local notifications
  if (Platform.OS === 'web') {
    log('Notifications not supported on web');
    return false;
  }
  
  try {
    const Notifications = require('expo-notifications');
    const { status } = await Notifications.getPermissionsAsync();
    
    const granted = status === 'granted';
    log('Notification permissions:', status);
    
    return granted;
    
  } catch (error) {
    logError('Permission check failed:', error);
    return false;
  }
};

/**
 * Request notification permissions
 * @returns {Promise<boolean>}
 */
export const requestNotificationPermissions = async () => {
  if (Platform.OS === 'web') {
    log('Notifications not supported on web');
    return false;
  }
  
  try {
    log('Requesting notification permissions...');
    
    const Notifications = require('expo-notifications');
    
    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    
    if (existingStatus === 'granted') {
      log('✅ Permissions already granted');
      return true;
    }
    
    // Request permissions
    const { status } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
    
    if (status === 'granted') {
      log('✅ Permissions granted');
      return true;
    } else {
      log('⚠️ Permissions denied:', status);
      return false;
    }
    
  } catch (error) {
    logError('Permission request failed:', error);
    return false;
  }
};

/* ================================================================================
   DEVICE INFO - Platform-Safe Wrappers
   ================================================================================ */

/**
 * Get device information safely
 * @returns {Object} Device info
 */
export const getDeviceInfo = () => {
  const baseInfo = {
    platform: Platform.OS,
    version: Platform.Version,
  };
  
  if (Platform.OS === 'web') {
    return {
      ...baseInfo,
      isDevice: false,
      deviceName: 'Web Browser',
    };
  }
  
  try {
    const Device = require('expo-device');
    const Constants = require('expo-constants');
    
    return {
      ...baseInfo,
      isDevice: Device.isDevice,
      deviceName: Device.deviceName,
      brand: Device.brand,
      manufacturer: Device.manufacturer,
      modelName: Device.modelName,
      osName: Device.osName,
      osVersion: Device.osVersion,
      appVersion: Constants.expoConfig?.version || '1.0.0',
    };
    
  } catch (error) {
    logError('Could not get device info:', error);
    return baseInfo;
  }
};

/* ================================================================================
   CLIPBOARD - Platform-Safe Operations
   ================================================================================ */

/**
 * Copy text to clipboard safely
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} Success status
 */
export const copyToClipboard = async (text) => {
  try {
    if (Platform.OS === 'web') {
      // Web: Use navigator.clipboard
      await navigator.clipboard.writeText(text);
      log('✅ Copied to clipboard (web)');
      return true;
    } else {
      // Native: Use Expo Clipboard
      const Clipboard = require('expo-clipboard');
      await Clipboard.setStringAsync(text);
      log('✅ Copied to clipboard (native)');
      return true;
    }
  } catch (error) {
    logError('Clipboard copy failed:', error);
    return false;
  }
};

/**
 * Get text from clipboard safely
 * @returns {Promise<string|null>}
 */
export const getFromClipboard = async () => {
  try {
    if (Platform.OS === 'web') {
      // Web: Use navigator.clipboard
      const text = await navigator.clipboard.readText();
      log('✅ Read from clipboard (web)');
      return text;
    } else {
      // Native: Use Expo Clipboard
      const Clipboard = require('expo-clipboard');
      const text = await Clipboard.getStringAsync();
      log('✅ Read from clipboard (native)');
      return text;
    }
  } catch (error) {
    logError('Clipboard read failed:', error);
    return null;
  }
};

/* ================================================================================
   EXPORTS
   ================================================================================ */

export default {
  // Haptics
  triggerHaptic,
  triggerNotificationHaptic,
  triggerSelectionHaptic,
  
  // File System
  exportToFile,
  importFromFile,
  
  // Notifications
  checkNotificationPermissions,
  requestNotificationPermissions,
  
  // Device
  getDeviceInfo,
  
  // Clipboard
  copyToClipboard,
  getFromClipboard,
};