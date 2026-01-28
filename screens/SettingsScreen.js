// SettingsScreen.js
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  EmailAuthProvider,
  getAuth,
  reauthenticateWithCredential,
  signOut,
  updatePassword,
  deleteUser,
} from "firebase/auth";
import { doc, getDoc, setDoc, deleteDoc, collection, writeBatch, getDocs, query, where } from "firebase/firestore";
import React, { useEffect, useCallback, useMemo, useState, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
  Keyboard,
  TouchableWithoutFeedback,
  Animated,
} from "react-native";
import { useApp } from "../context/AppContext";
import { db } from "../firebaseConfig";
import NetInfo from '@react-native-community/netinfo';
import * as Notifications from 'expo-notifications';
import { 
  cancelAllNotifications, 
  requestNotificationPermissions,
  clearAllInAppNotifications
} from '../utils/notifications';

// Constants in a separate file would be better, but keeping here for simplicity
const COLORS = {
  backgroundBase: "#FAFAFA",
  card: "#FFFFFF",
  textPrimary: "#4A3228",
  textSecondary: "#A98467",
  accentBlush: "#D8A39D",
  accentSage: "#8FBC8F",
  accentDark: "#7E6B5A",
  nudeShadow: "rgba(216,163,157,0.35)",
  error: "#D64545",
  success: "#5D8B7E",
  warning: "#F39C12",
  lightBorder: "#E8E8E8",
  disabled: "#CCCCCC",
  destructive: "#E74C3C",
};

// Error messages constants
const ERROR_MESSAGES = {
  NETWORK_ERROR: "Please check your internet connection and try again.",
  PASSWORD_REQUIREMENTS: "Password must be at least 6 characters.",
  PASSWORD_MISMATCH: "New passwords do not match.",
  CURRENT_PASSWORD_INCORRECT: "Current password is incorrect.",
  PASSWORD_WEAK: "New password is too weak.",
  UPDATE_FAILED: "Failed to update password. Please try again.",
  LOGOUT_FAILED: "Logout failed. Please try again.",
  SETTINGS_LOAD_FAILED: "Failed to load settings. Please restart the app.",
  SETTINGS_SAVE_FAILED: "Failed to save settings. Please try again.",
  NOTIFICATIONS_PERMISSION_DENIED: "Notification permissions denied. Please enable in settings.",
  DELETE_ACCOUNT_FAILED: "Failed to delete account. Please try again later.",
  DELETE_ACCOUNT_CONFIRMATION: "Please enter DELETE to confirm account deletion.",
  DELETE_ACCOUNT_CONFIRMATION_MISMATCH: "Confirmation text does not match.",
};

// Validation functions
const validatePassword = (password) => password.length >= 6;
const validatePasswordsMatch = (password, confirmPassword) => password === confirmPassword;

export default function SettingsScreen() {
  const { user, appId, profile, setUser } = useApp();
  const auth = getAuth();

  // Settings State
  const [notifications, setNotifications] = useState(true);
  const [reminderTime, setReminderTime] = useState(() => {
    const date = new Date();
    date.setHours(9, 0, 0, 0);
    return date;
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(true);

  // Time Picker
  const [showTimePicker, setShowTimePicker] = useState(false);

  // Password Modal State
  const [isPasswordModalVisible, setIsPasswordModalVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [isPasswordUpdating, setIsPasswordUpdating] = useState(false);

  // Delete Account Modal State
  const [isDeleteAccountModalVisible, setIsDeleteAccountModalVisible] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState("");

  // Toast
  const [showMessage, setShowMessage] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success"); // 'success', 'error', 'warning'
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Network connection monitoring
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected);
      if (!state.isConnected) {
        showToast(ERROR_MESSAGES.NETWORK_ERROR, 'warning');
      }
    });

    return () => unsubscribe();
  }, []);

  // Toast animation
  useEffect(() => {
    if (showMessage) {
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.delay(2500),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => setShowMessage(false));
    }
  }, [showMessage, fadeAnim]);

  const settingsDocRef = useCallback(
    (uid, appid) => doc(db, `artifacts/${appid}/users/${uid}/settings/preferences`),
    []
  );

  // Load settings with error handling and retry logic
  useEffect(() => {
    if (!user || !appId) {
      setIsLoading(false);
      return;
    }

    const loadSettings = async (retryCount = 0) => {
      try {
        const docRef = settingsDocRef(user.uid, appId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const settings = docSnap.data();
          setNotifications(settings.notifications ?? true);

          if (settings.reminderTime) {
            const [hours, minutes] = settings.reminderTime.split(":").map(Number);
            const timeDate = new Date();
            timeDate.setHours(hours, minutes, 0, 0);
            setReminderTime(timeDate);
          }
        }
      } catch (error) {
        console.error("Failed to load settings:", error);
        
        if (retryCount < 3) {
          // Retry after delay
          setTimeout(() => loadSettings(retryCount + 1), 1000 * (retryCount + 1));
        } else {
          showToast(ERROR_MESSAGES.SETTINGS_LOAD_FAILED, 'error');
        }
      } finally {
        if (retryCount === 0) {
          setIsLoading(false);
        }
      }
    };
    
    loadSettings();
  }, [user, appId, settingsDocRef]);

  const saveSettings = useCallback(async (updates) => {
    if (!user || !appId || !isConnected) {
      showToast(ERROR_MESSAGES.NETWORK_ERROR, 'warning');
      return false;
    }
    
    try {
      await setDoc(settingsDocRef(user.uid, appId), updates, { merge: true });
      return true;
    } catch (error) {
      console.error("Failed to save settings:", error);
      showToast(ERROR_MESSAGES.SETTINGS_SAVE_FAILED, 'error');
      return false;
    }
  }, [user, appId, isConnected, settingsDocRef]);

  // Handle notification toggle
  const handleNotificationsToggle = useCallback(async (value) => {
    if (!isConnected) {
      showToast(ERROR_MESSAGES.NETWORK_ERROR, 'warning');
      return;
    }

    try {
      if (value) {
        // When enabling notifications, request permissions
        const hasPermission = await requestNotificationPermissions();
        if (!hasPermission) {
          showToast(ERROR_MESSAGES.NOTIFICATIONS_PERMISSION_DENIED, 'error');
          return;
        }
        
        // Save notification setting
        await saveSettings({ notifications: value });
        setNotifications(value);
        showToast("Notifications enabled", 'success');
        
      } else {
        // When disabling notifications, cancel all scheduled notifications
        await cancelAllNotifications();
        
        // Save notification setting
        await saveSettings({ notifications: value });
        setNotifications(value);
        showToast("Notifications disabled", 'warning');
      }
    } catch (error) {
      console.error("Error handling notification toggle:", error);
      showToast("Failed to update notification settings", 'error');
    }
  }, [isConnected, saveSettings, showToast]);

  const showToast = useCallback((msg, type = 'success') => {
    setMessage(msg);
    setMessageType(type);
    setShowMessage(true);
  }, []);

  const handleLogout = useCallback(async () => {
    Alert.alert(
      "Log Out",
      "Are you sure you want to log out?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Yes, Log Out",
          style: "destructive",
          onPress: async () => {
            try {
              // Cancel all notifications on logout (optional)
              await cancelAllNotifications();
              await signOut(auth);
            } catch (error) {
              console.error("Logout error:", error);
              showToast(ERROR_MESSAGES.LOGOUT_FAILED, 'error');
            }
          },
        },
      ],
      { cancelable: true }
    );
  }, [auth, showToast]);

  const handleTimeChange = useCallback((event, selectedDate) => {
    if (Platform.OS === "android" && event.type === "set") {
      setShowTimePicker(false);
    }
    if (selectedDate) {
      setReminderTime(selectedDate);
      const timeString = `${String(selectedDate.getHours()).padStart(2, "0")}:${String(
        selectedDate.getMinutes()
      ).padStart(2, "0")}`;
      saveSettings({ reminderTime: timeString });
    }
  }, [saveSettings]);

  const formatTimeDisplay = useCallback((date) =>
    date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }), []);

  const handleChangePassword = useCallback(async () => {
    // Client-side validation
    if (!validatePassword(newPassword)) {
      setPasswordError(ERROR_MESSAGES.PASSWORD_REQUIREMENTS);
      return;
    }
    
    if (!validatePasswordsMatch(newPassword, confirmNewPassword)) {
      setPasswordError(ERROR_MESSAGES.PASSWORD_MISMATCH);
      return;
    }

    if (!isConnected) {
      setPasswordError(ERROR_MESSAGES.NETWORK_ERROR);
      return;
    }

    setIsPasswordUpdating(true);
    setPasswordError("");

    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);

      setIsPasswordModalVisible(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      showToast("Password updated successfully!");
    } catch (error) {
      console.error("Password update error:", error);
      
      // Handle specific Firebase errors
      switch (error.code) {
        case "auth/wrong-password":
          setPasswordError(ERROR_MESSAGES.CURRENT_PASSWORD_INCORRECT);
          break;
        case "auth/weak-password":
          setPasswordError(ERROR_MESSAGES.PASSWORD_WEAK);
          break;
        case "auth/requires-recent-login":
          setPasswordError("For security, please log out and log in again before changing password.");
          break;
        case "auth/network-request-failed":
          setPasswordError(ERROR_MESSAGES.NETWORK_ERROR);
          break;
        default:
          setPasswordError(ERROR_MESSAGES.UPDATE_FAILED);
      }
    } finally {
      setIsPasswordUpdating(false);
    }
  }, [user, currentPassword, newPassword, confirmNewPassword, isConnected, showToast]);

  const resetPasswordModal = useCallback(() => {
    setIsPasswordModalVisible(false);
    setPasswordError("");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  }, []);

  const resetDeleteAccountModal = useCallback(() => {
    setIsDeleteAccountModalVisible(false);
    setDeleteConfirmation("");
    setDeleteAccountError("");
    setIsDeletingAccount(false);
  }, []);

  /**
   * Delete user data from Firestore
   * This function deletes all user-related data including:
   * - User profile
   * - User settings
   * - Tasks
   * - Goals (both personal and shared)
   * - Shared goal memberships
   */
  const deleteUserDataFromFirestore = useCallback(async (userId, appId) => {
    try {
      const batch = writeBatch(db);
      
      // 1. Delete user profile
      const userRef = doc(db, `artifacts/${appId}/users/${userId}`);
      batch.delete(userRef);
      
      // 2. Delete user settings
      const settingsRef = doc(db, `artifacts/${appId}/users/${userId}/settings/preferences`);
      batch.delete(settingsRef);
      
      // 3. Delete user tasks
      const tasksRef = collection(db, `artifacts/${appId}/users/${userId}/tasks`);
      const tasksSnapshot = await getDocs(tasksRef);
      tasksSnapshot.forEach((taskDoc) => {
        batch.delete(taskDoc.ref);
      });
      
      // 4. Delete user goals
      const goalsRef = collection(db, `artifacts/${appId}/users/${userId}/goals`);
      const goalsSnapshot = await getDocs(goalsRef);
      goalsSnapshot.forEach((goalDoc) => {
        batch.delete(goalDoc.ref);
      });
      
      // 5. Remove user from shared goals
      // First, get all shared goals where user is a member
      const sharedGoalsQuery = query(
        collection(db, `artifacts/${appId}/sharedGoals`),
        where("members", "array-contains", userId)
      );
      const sharedGoalsSnapshot = await getDocs(sharedGoalsQuery);
      
      sharedGoalsSnapshot.forEach((sharedGoalDoc) => {
        const sharedGoalData = sharedGoalDoc.data();
        const updatedMembers = sharedGoalData.members.filter(memberId => memberId !== userId);
        
        // If no members left, delete the shared goal
        if (updatedMembers.length === 0) {
          batch.delete(sharedGoalDoc.ref);
        } else {
          // Otherwise, remove user from members array
          batch.update(sharedGoalDoc.ref, { 
            members: updatedMembers,
            lastUpdated: new Date().toISOString(),
            lastUpdatedBy: "System (Account Deletion)"
          });
        }
      });
      
      // Commit all deletions/updates
      await batch.commit();
      console.log("✅ Successfully deleted user data from Firestore");
      
      return true;
    } catch (error) {
      console.error("❌ Error deleting user data from Firestore:", error);
      throw error;
    }
  }, []);

  /**
   * Handle account deletion
   * This performs the following steps:
   * 1. Validate confirmation text
   * 2. Reauthenticate user
   * 3. Delete user data from Firestore
   * 4. Clear notifications
   * 5. Delete user from Firebase Authentication
   */
  const handleDeleteAccount = useCallback(async () => {
    // Validate confirmation text
    if (deleteConfirmation.trim().toUpperCase() !== "DELETE") {
      setDeleteAccountError(ERROR_MESSAGES.DELETE_ACCOUNT_CONFIRMATION_MISMATCH);
      return;
    }

    if (!isConnected) {
      setDeleteAccountError(ERROR_MESSAGES.NETWORK_ERROR);
      return;
    }

    setIsDeletingAccount(true);
    setDeleteAccountError("");

    try {
      // 1. First, ask for password for reauthentication
      Alert.prompt(
        "Confirm Account Deletion",
        "For security, please enter your password to confirm account deletion:",
        [
          { text: "Cancel", style: "cancel", onPress: () => {
            setIsDeletingAccount(false);
          }},
          { text: "Delete Account", style: "destructive", onPress: async (password) => {
            if (!password || password.length < 6) {
              setDeleteAccountError("Please enter your current password.");
              setIsDeletingAccount(false);
              return;
            }

            try {
              // 2. Reauthenticate user
              const credential = EmailAuthProvider.credential(user.email, password);
              await reauthenticateWithCredential(user, credential);
              
              // 3. Show final warning
              Alert.alert(
                "⚠️ Final Warning: Irreversible Action",
                "Are you absolutely sure? This will:\n\n• Permanently delete all your data\n• Remove you from shared goals\n• Cannot be undone\n\nType CONFIRM to proceed:",
                [
                  { text: "Cancel", style: "cancel", onPress: () => {
                    setIsDeletingAccount(false);
                  }},
                  { text: "I understand, delete", style: "destructive", onPress: async () => {
                    try {
                      // 4. Delete user data from Firestore
                      await deleteUserDataFromFirestore(user.uid, appId);
                      
                      // 5. Clear all notifications
                      await cancelAllNotifications();
                      await clearAllInAppNotifications(user.uid);
                      
                      // 6. Delete user from Firebase Authentication
                      await deleteUser(user);
                      
                      // 7. Show success message
                      showToast("Account successfully deleted. Goodbye!", 'success');
                      
                      // 8. Reset app state (AppContext should handle logout)
                      setUser(null);
                      
                    } catch (deleteError) {
                      console.error("Error during final deletion:", deleteError);
                      setDeleteAccountError(ERROR_MESSAGES.DELETE_ACCOUNT_FAILED);
                      setIsDeletingAccount(false);
                    }
                  }},
                ]
              );
              
            } catch (authError) {
              console.error("Authentication error:", authError);
              if (authError.code === "auth/wrong-password") {
                setDeleteAccountError("Incorrect password. Please try again.");
              } else {
                setDeleteAccountError(ERROR_MESSAGES.DELETE_ACCOUNT_FAILED);
              }
              setIsDeletingAccount(false);
            }
          }},
        ],
        "secure-text"
      );

    } catch (error) {
      console.error("Account deletion error:", error);
      setDeleteAccountError(ERROR_MESSAGES.DELETE_ACCOUNT_FAILED);
      setIsDeletingAccount(false);
    }
  }, [user, appId, deleteConfirmation, isConnected, deleteUserDataFromFirestore, showToast, setUser]);

  const isPasswordValid = useMemo(() => {
    return validatePassword(newPassword) && 
           validatePasswordsMatch(newPassword, confirmNewPassword) && 
           currentPassword.length > 0;
  }, [currentPassword, newPassword, confirmNewPassword]);

  const isDeleteConfirmationValid = useMemo(() => {
    return deleteConfirmation.trim().toUpperCase() === "DELETE";
  }, [deleteConfirmation]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.accentBlush} />
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView 
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView 
            contentContainerStyle={styles.container}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Header */}
            <View style={styles.headerSection}>
              <Text style={styles.headerTitle}>Settings</Text>
              <Text style={styles.headerSubtitle}>Customize your experience</Text>
            </View>

            {/* Profile Card */}
            <View style={styles.profileCard}>
              <View style={styles.avatarContainer}>
                <View style={styles.avatarGradient}>
                  <Ionicons name="person" size={32} color={COLORS.card} />
                </View>
              </View>
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{profile?.username || "Momentum User"}</Text>
                <Text style={styles.profileEmail} numberOfLines={1}>
                  {user?.email || "user@momentum.com"}
                </Text>
                {!isConnected && (
                  <View style={styles.offlineBadge}>
                    <Ionicons name="cloud-offline" size={12} color={COLORS.card} />
                    <Text style={styles.offlineText}>Offline</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Account Section */}
            <Text style={styles.sectionHeader}>
              Account
            </Text>
            <View style={styles.card}>
              <View style={styles.row}>
                <View style={styles.iconContainer}>
                  <Ionicons name="finger-print-outline" size={20} color={COLORS.accentBlush} />
                </View>
                <View style={styles.rowContent}>
                  <Text style={styles.optionLabel}>User ID</Text>
                  <Text style={styles.optionDescription}>Unique identifier</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    if (user?.uid) {
                      Alert.alert(
                        "User ID",
                        user.uid,
                        [{ text: "Copy", onPress: () => {
                          // Implement clipboard copy here
                          showToast("User ID copied to clipboard");
                        }}, { text: "OK" }]
                      );
                    }
                  }}
                >
                  <Text style={styles.optionValue}>
                    {user?.uid ? user.uid.substring(0, 8) + "..." : "N/A"}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.separator} />

              <TouchableOpacity
                style={[styles.row, !isConnected && styles.disabledRow]}
                onPress={() => isConnected && setIsPasswordModalVisible(true)}
                activeOpacity={0.7}
                disabled={!isConnected}
              >
                <View style={styles.iconContainer}>
                  <Ionicons 
                    name="lock-closed-outline" 
                    size={20} 
                    color={isConnected ? COLORS.accentBlush : COLORS.disabled} 
                  />
                </View>
                <View style={styles.rowContent}>
                  <Text style={[styles.optionLabel, !isConnected && styles.disabledText]}>
                    Change Password
                  </Text>
                  <Text style={[styles.optionDescription, !isConnected && styles.disabledText]}>
                    {isConnected ? "Update your password" : "Offline - unavailable"}
                  </Text>
                </View>
                <Ionicons 
                  name="chevron-forward" 
                  size={20} 
                  color={isConnected ? COLORS.textSecondary : COLORS.disabled} 
                />
              </TouchableOpacity>
            </View>

            {/* Preferences Section */}
            <Text style={styles.sectionHeader}>
              Preferences
            </Text>
            <View style={styles.card}>
              <View style={styles.row}>
                <View style={styles.iconContainer}>
                  <Ionicons 
                    name="notifications-outline" 
                    size={20} 
                    color={isConnected ? COLORS.accentBlush : COLORS.disabled} 
                  />
                </View>
                <View style={styles.rowContent}>
                  <Text style={[styles.optionLabel, !isConnected && styles.disabledText]}>
                    Push Notifications
                  </Text>
                  <Text style={[styles.optionDescription, !isConnected && styles.disabledText]}>
                    {isConnected ? 
                      (notifications ? "All notifications enabled" : "All notifications disabled") 
                      : "Offline - unavailable"}
                  </Text>
                </View>
                <Switch
                  trackColor={{ false: COLORS.lightBorder, true: COLORS.accentSage }}
                  thumbColor={COLORS.card}
                  ios_backgroundColor={COLORS.lightBorder}
                  onValueChange={handleNotificationsToggle}
                  value={notifications}
                  disabled={!isConnected}
                />
              </View>

              <View style={styles.separator} />

              <TouchableOpacity
                style={[styles.row, (!notifications || !isConnected) && styles.disabledRow]}
                onPress={() => notifications && isConnected && setShowTimePicker(true)}
                disabled={!notifications || !isConnected}
                activeOpacity={0.7}
              >
                <View style={styles.iconContainer}>
                  <Ionicons
                    name="time-outline"
                    size={20}
                    color={notifications && isConnected ? COLORS.accentBlush : COLORS.disabled}
                  />
                </View>
                <View style={styles.rowContent}>
                  <Text style={[
                    styles.optionLabel, 
                    (!notifications || !isConnected) && styles.disabledText
                  ]}>
                    Daily Reminder Time
                  </Text>
                  <Text style={styles.optionDescription}>
                    {!isConnected ? "Offline - unavailable" : 
                     !notifications ? "Enable notifications first" : "Tap to change"}
                  </Text>
                </View>
                <View style={styles.timeDisplay}>
                  <Text style={[
                    styles.timeText, 
                    (!notifications || !isConnected) && styles.disabledText
                  ]}>
                    {formatTimeDisplay(reminderTime)}
                  </Text>
                </View>
              </TouchableOpacity>

              {showTimePicker && (
                <DateTimePicker
                  value={reminderTime}
                  mode="time"
                  is24Hour={false}
                  display="default"
                  onChange={handleTimeChange}
                />
              )}
            </View>

           
            {/* Delete Account Button */}
            <TouchableOpacity 
              style={[styles.deleteAccountButton, !isConnected && styles.disabledButton]} 
              onPress={() => isConnected && setIsDeleteAccountModalVisible(true)}
              activeOpacity={0.8}
              disabled={!isConnected}
            >
              <Ionicons name="trash-outline" size={22} color={COLORS.card} />
              <Text style={styles.deleteAccountButtonText}>Delete Account</Text>
            </TouchableOpacity>

            {/* Logout */}
            <TouchableOpacity 
              style={styles.logoutButton} 
              onPress={handleLogout} 
              activeOpacity={0.8}
              disabled={!isConnected}
            >
              <Ionicons name="log-out-outline" size={22} color={COLORS.card} />
              <Text style={styles.logoutButtonText}>Log Out</Text>
            </TouchableOpacity>

            <Text style={styles.footer}>© 2025 Momentum - All Rights Reserved</Text>
            <Text style={styles.version}>v1.0.0</Text>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      {/* Toast Message */}
      {showMessage && (
        <Animated.View
          style={[
            styles.messageBox,
            { 
              opacity: fadeAnim,
              backgroundColor: messageType === 'error' 
                ? COLORS.error 
                : messageType === 'warning' 
                ? COLORS.warning 
                : messageType === 'info'
                ? COLORS.accentSage
                : COLORS.success 
            },
          ]}
        >
          <Ionicons
            name={
              messageType === 'error' 
                ? "close-circle" 
                : messageType === 'warning' 
                ? "warning" 
                : messageType === 'info'
                ? "information-circle"
                : "checkmark-circle"
            }
            size={20}
            color="#fff"
          />
          <Text style={styles.messageText} numberOfLines={2}>{message}</Text>
        </Animated.View>
      )}

      {/* Change Password Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isPasswordModalVisible}
        onRequestClose={resetPasswordModal}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalContent}>
              <View style={styles.passwordModalCard}>
                <TouchableOpacity 
                  style={styles.modalCloseButton}
                  onPress={resetPasswordModal}
                >
                  <Ionicons name="close" size={24} color={COLORS.textSecondary} />
                </TouchableOpacity>

                <View style={styles.modalIconContainer}>
                  <Ionicons name="lock-closed" size={40} color={COLORS.accentBlush} />
                </View>

                <Text style={styles.modalTitle}>Change Password</Text>
                <Text style={styles.modalText}>
                  Enter your current password and choose a new secure one.
                </Text>

                {/* Current Password */}
                <View style={styles.passwordInputContainer}>
                  <TextInput
                    style={styles.input}
                    placeholder="Current Password"
                    placeholderTextColor={COLORS.textSecondary}
                    secureTextEntry={!showCurrentPassword}
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!isPasswordUpdating}
                    returnKeyType="next"
                  />
                  <TouchableOpacity
                    style={styles.eyeIcon}
                    onPress={() => setShowCurrentPassword(!showCurrentPassword)}
                    disabled={isPasswordUpdating}
                  >
                    <Ionicons
                      name={showCurrentPassword ? "eye-off-outline" : "eye-outline"}
                      size={22}
                      color={COLORS.textSecondary}
                    />
                  </TouchableOpacity>
                </View>

                {/* New Password */}
                <View style={styles.passwordInputContainer}>
                  <TextInput
                    style={styles.input}
                    placeholder="New Password (min. 6 characters)"
                    placeholderTextColor={COLORS.textSecondary}
                    secureTextEntry={!showNewPassword}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!isPasswordUpdating}
                    returnKeyType="next"
                  />
                  <TouchableOpacity
                    style={styles.eyeIcon}
                    onPress={() => setShowNewPassword(!showNewPassword)}
                    disabled={isPasswordUpdating}
                  >
                    <Ionicons
                      name={showNewPassword ? "eye-off-outline" : "eye-outline"}
                      size={22}
                      color={COLORS.textSecondary}
                    />
                  </TouchableOpacity>
                </View>

                {/* Confirm New Password */}
                <View style={styles.passwordInputContainer}>
                  <TextInput
                    style={styles.input}
                    placeholder="Confirm New Password"
                    placeholderTextColor={COLORS.textSecondary}
                    secureTextEntry={!showConfirmPassword}
                    value={confirmNewPassword}
                    onChangeText={setConfirmNewPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!isPasswordUpdating}
                    returnKeyType="done"
                    onSubmitEditing={handleChangePassword}
                  />
                  <TouchableOpacity
                    style={styles.eyeIcon}
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                    disabled={isPasswordUpdating}
                  >
                    <Ionicons
                      name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
                      size={22}
                      color={COLORS.textSecondary}
                    />
                  </TouchableOpacity>
                </View>

                {passwordError ? (
                  <View style={styles.errorContainer}>
                    <Ionicons name="alert-circle" size={16} color={COLORS.error} />
                    <Text style={styles.errorText}>{passwordError}</Text>
                  </View>
                ) : null}

                <View style={styles.modalButtonContainer}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={resetPasswordModal}
                    disabled={isPasswordUpdating}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.saveButton,
                      (!isPasswordValid || isPasswordUpdating) && styles.saveButtonDisabled,
                    ]}
                    onPress={handleChangePassword}
                    disabled={!isPasswordValid || isPasswordUpdating}
                  >
                    {isPasswordUpdating ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.saveButtonText}>Update Password</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </Modal>

      {/* Delete Account Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isDeleteAccountModalVisible}
        onRequestClose={resetDeleteAccountModal}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalContent}>
              <View style={styles.deleteModalCard}>
                <TouchableOpacity 
                  style={styles.modalCloseButton}
                  onPress={resetDeleteAccountModal}
                >
                  <Ionicons name="close" size={24} color={COLORS.textSecondary} />
                </TouchableOpacity>

                <View style={styles.deleteIconContainer}>
                  <Ionicons name="warning" size={40} color={COLORS.destructive} />
                </View>

                <Text style={styles.deleteModalTitle}>Delete Account</Text>
                
                <View style={styles.warningBox}>
                  <Ionicons name="alert-circle" size={20} color={COLORS.destructive} />
                  <Text style={styles.warningText}>
                    This action is irreversible. All your data will be permanently deleted.
                  </Text>
                </View>

                <Text style={styles.deleteModalText}>
                  To confirm deletion, type <Text style={styles.confirmationText}>DELETE</Text> below:
                </Text>

                <TextInput
                  style={styles.deleteInput}
                  placeholder="Type DELETE to confirm"
                  placeholderTextColor={COLORS.textSecondary}
                  value={deleteConfirmation}
                  onChangeText={setDeleteConfirmation}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  editable={!isDeletingAccount}
                  returnKeyType="done"
                />

                {deleteAccountError ? (
                  <View style={styles.errorContainer}>
                    <Ionicons name="alert-circle" size={16} color={COLORS.error} />
                    <Text style={styles.errorText}>{deleteAccountError}</Text>
                  </View>
                ) : null}

                <Text style={styles.deleteInfoText}>
                  This will delete:
                  • Your profile and settings{'\n'}
                  • All your tasks and goals{'\n'}
                  • Your membership in shared goals{'\n'}
                  • All associated data
                </Text>

                <View style={styles.modalButtonContainer}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={resetDeleteAccountModal}
                    disabled={isDeletingAccount}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.deleteAccountConfirmButton,
                      (!isDeleteConfirmationValid || isDeletingAccount) && styles.deleteButtonDisabled,
                    ]}
                    onPress={handleDeleteAccount}
                    disabled={!isDeleteConfirmationValid || isDeletingAccount}
                  >
                    {isDeletingAccount ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.deleteAccountConfirmButtonText}>Delete Account</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.backgroundBase },
  keyboardView: { flex: 1 },
  loadingContainer: { 
    flex: 1, 
    justifyContent: "center", 
    alignItems: "center", 
    backgroundColor: COLORS.backgroundBase 
  },
  loadingText: {
    marginTop: 12,
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  container: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  headerSection: { marginBottom: 30 },
  headerTitle: { 
    fontSize: 36, 
    fontWeight: "900", 
    color: COLORS.textPrimary, 
    letterSpacing: -0.5 
  },
  headerSubtitle: { 
    fontSize: 16, 
    color: COLORS.textSecondary, 
    marginTop: 5, 
    fontWeight: "500" 
  },
  profileCard: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 20,
    marginBottom: 25,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
    borderWidth: 1,
    borderColor: COLORS.accentBlush + "20",
  },
  avatarContainer: { marginRight: 15 },
  avatarGradient: {
    width: 65,
    height: 65,
    borderRadius: 32.5,
    backgroundColor: COLORS.accentBlush,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: COLORS.accentBlush,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  profileInfo: { flex: 1 },
  profileName: { 
    fontSize: 20, 
    fontWeight: "700", 
    color: COLORS.textPrimary, 
    marginBottom: 4 
  },
  profileEmail: { 
    fontSize: 14, 
    color: COLORS.textSecondary, 
    fontWeight: "500",
    marginBottom: 4,
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warning,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  offlineText: {
    color: COLORS.card,
    fontSize: 10,
    fontWeight: '700',
    marginLeft: 4,
  },
  sectionHeader: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.textPrimary,
    marginTop: 10,
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 18,
    padding: 18,
    marginBottom: 20,
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
    borderWidth: 1,
    borderColor: COLORS.accentBlush + "15",
  },
  row: { 
    flexDirection: "row", 
    alignItems: "center", 
    paddingVertical: 12 
  },
  disabledRow: {
    opacity: 0.5,
  },
  disabledText: {
    color: COLORS.disabled,
  },
  iconContainer: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: COLORS.accentBlush + "15",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  rowContent: { flex: 1 },
  optionLabel: { 
    fontSize: 16, 
    fontWeight: "600", 
    color: COLORS.textPrimary, 
    marginBottom: 2 
  },
  optionDescription: { 
    fontSize: 13, 
    color: COLORS.textSecondary, 
    fontWeight: "400" 
  },
  optionValue: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: "600",
    backgroundColor: COLORS.backgroundBase,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  timeDisplay: {
    backgroundColor: COLORS.backgroundBase,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.accentSage + "30",
  },
  timeText: { 
    fontSize: 15, 
    fontWeight: "700", 
    color: COLORS.accentSage 
  },
  separator: { 
    height: 1, 
    backgroundColor: COLORS.lightBorder, 
    marginVertical: 8, 
    marginLeft: 56 
  },
  deleteAccountButton: {
    backgroundColor: COLORS.destructive,
    padding: 18,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginTop: 20,
    shadowColor: COLORS.destructive,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  disabledButton: {
    opacity: 0.5,
    backgroundColor: COLORS.disabled,
  },
  deleteAccountButtonText: { 
    color: COLORS.card, 
    fontSize: 17, 
    fontWeight: "700", 
    marginLeft: 10, 
    letterSpacing: 0.3 
  },
  logoutButton: {
    backgroundColor: COLORS.accentBlush,
    padding: 18,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginTop: 15,
    shadowColor: COLORS.accentBlush,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  logoutButtonText: { 
    color: COLORS.card, 
    fontSize: 17, 
    fontWeight: "700", 
    marginLeft: 10, 
    letterSpacing: 0.3 
  },
  footer: { 
    textAlign: "center", 
    fontSize: 12, 
    color: COLORS.textSecondary, 
    marginTop: 30, 
    opacity: 0.6, 
    fontWeight: "500" 
  },
  version: {
    textAlign: "center",
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 4,
    opacity: 0.4,
  },
  modalOverlay: { 
    flex: 1, 
    justifyContent: "flex-end", 
    backgroundColor: "rgba(0,0,0,0.5)" 
  },
  modalContent: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  passwordModalCard: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 30,
    paddingBottom: 40,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  deleteModalCard: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 30,
    paddingBottom: 40,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  modalCloseButton: {
    position: 'absolute',
    top: 16,
    right: 20,
    zIndex: 1,
    padding: 8,
  },
  modalIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.accentBlush + "20",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: 20,
    marginTop: 10,
  },
  deleteIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.destructive + "15",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: 20,
    marginTop: 10,
  },
  modalTitle: { 
    fontSize: 26, 
    fontWeight: "800", 
    color: COLORS.textPrimary, 
    textAlign: "center", 
    marginBottom: 10 
  },
  deleteModalTitle: { 
    fontSize: 26, 
    fontWeight: "800", 
    color: COLORS.destructive, 
    textAlign: "center", 
    marginBottom: 15 
  },
  modalText: { 
    fontSize: 15, 
    color: COLORS.textSecondary, 
    textAlign: "center", 
    marginBottom: 25, 
    lineHeight: 22 
  },
  deleteModalText: { 
    fontSize: 15, 
    color: COLORS.textPrimary, 
    textAlign: "center", 
    marginBottom: 15, 
    lineHeight: 22,
    fontWeight: "600",
  },
  confirmationText: {
    color: COLORS.destructive,
    fontWeight: "800",
    fontStyle: "italic",
  },
  passwordInputContainer: { 
    position: "relative", 
    marginBottom: 15 
  },
  input: {
    borderWidth: 1.5,
    borderColor: COLORS.lightBorder,
    borderRadius: 14,
    padding: 16,
    paddingRight: 50,
    fontSize: 16,
    backgroundColor: COLORS.backgroundBase,
    color: COLORS.textPrimary,
    fontWeight: "500",
  },
  deleteInput: {
    borderWidth: 1.5,
    borderColor: COLORS.destructive + "50",
    borderRadius: 14,
    padding: 16,
    fontSize: 16,
    backgroundColor: COLORS.backgroundBase,
    color: COLORS.textPrimary,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 1,
    marginBottom: 15,
  },
  eyeIcon: { 
    position: "absolute", 
    right: 14, 
    top: 16 
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
    marginBottom: 10,
  },
  errorText: { 
    color: COLORS.error, 
    fontSize: 13, 
    marginLeft: 6, 
    fontWeight: "600",
    flex: 1,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.destructive + "10",
    borderWidth: 1,
    borderColor: COLORS.destructive + "30",
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
  },
  warningText: {
    color: COLORS.destructive,
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 10,
    flex: 1,
  },
  deleteInfoText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: 25,
    backgroundColor: COLORS.backgroundBase,
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
  },
  modalButtonContainer: { 
    flexDirection: "row", 
    marginTop: 25, 
    gap: 12 
  },
  cancelButton: {
    flex: 1,
    backgroundColor: COLORS.backgroundBase,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: COLORS.lightBorder,
  },
  cancelButtonText: { 
    color: COLORS.textPrimary, 
    fontSize: 16, 
    fontWeight: "700" 
  },
  saveButton: {
    flex: 1,
    backgroundColor: COLORS.accentBlush,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    shadowColor: COLORS.accentBlush,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  saveButtonText: { 
    color: "#fff", 
    fontSize: 16, 
    fontWeight: "700" 
  },
  saveButtonDisabled: { 
    backgroundColor: COLORS.textSecondary, 
    opacity: 0.5 
  },
  deleteAccountConfirmButton: {
    flex: 1,
    backgroundColor: COLORS.destructive,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    shadowColor: COLORS.destructive,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  deleteAccountConfirmButtonText: { 
    color: "#fff", 
    fontSize: 16, 
    fontWeight: "700" 
  },
  deleteButtonDisabled: { 
    backgroundColor: COLORS.disabled, 
    opacity: 0.5 
  },
  messageBox: {
    position: "absolute",
    bottom: 100,
    left: 20,
    right: 20,
    borderRadius: 16,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  messageText: { 
    color: "#fff", 
    fontWeight: "700", 
    marginLeft: 12, 
    fontSize: 15,
    flex: 1,
  },
});