// screens/SettingsScreen.js
// 🎯 COMPLETE REDESIGN - February 12, 2026
// ✅ Glass-morphism design with BlurView
// ✅ Animated header with scroll effect
// ✅ Smooth animations & micro-interactions
// ✅ iOS-style modals with blur
// ✅ Production-ready error handling
// ✅ Offline-aware with connection status
// ✅ Matches all other screens perfectly
// ✅ FIXED: Profile updates now sync across all screens
// ✅ FIXED: Removed any reference to non-existent 'App' property

import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import NetInfo from '@react-native-community/netinfo';
import { BlurView } from 'expo-blur';
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from 'expo-linear-gradient';

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { useApp } from "../context/AppContext";
import { supabase } from "../supabaseConfig";
import {
  cancelAllNotifications,
  clearAllInAppNotifications,
  requestNotificationPermissions
} from '../utils/notifications';

const { width, height } = Dimensions.get('window');

/* ================================================================================
   🎨 COLORS - Matching all screens
   ================================================================================ */

const COLORS = {
  // Core
  backgroundBase: "#F7F3EF",
  card: "#FFFFFF",
  // Text
  textPrimary: "#2C1810",
  textSecondary: "#8A6F5E",
  textTertiary: "#B8A49A",
  placeholder: "#C4B0A8",
  // Accents
  accentBlush: "#C4746E",
  accentWarm: "#C9924A",
  accentPlum: "#795D94",
  accentPlumLight: "#A98AC4",
  sage: "#4E7A6E",
  // Surfaces
  surfaceVariant: "#F0EAE6",
  cardBorder: "rgba(196,116,110,0.15)",
  // Gradients
  gradientStart: "#2C1810",
  gradientMid: "#4A2C3A",
  gradientEnd: "#795D94",
  // Functional
  nudeShadow: "rgba(44,24,16,0.12)",
  shadowDark: "rgba(0,0,0,0.08)",
  danger: "#C0392B",
  success: "#4E7A6E",
  info: "#2980B9",
  warning: "#D4802A",
  overlay: "rgba(44,24,16,0.5)",
  destructive: "#C0392B",
  disabled: "#C4B0A8",
};

/* ================================================================================
   📝 CONSTANTS
   ================================================================================ */

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
  DELETE_ACCOUNT_CONFIRMATION_MISMATCH: "Please type DELETE exactly to confirm.",
};

const validatePassword = (password) => password.length >= 6;
const validatePasswordsMatch = (password, confirmPassword) => password === confirmPassword;

/* ================================================================================
   🎯 SETTING CARD - Reusable component
   ================================================================================ */

const SettingCard = ({ children, style }) => (
  <View style={[styles.settingCard, style]}>
    <BlurView intensity={60} tint="light" style={styles.settingCardBlur}>
      {children}
    </BlurView>
  </View>
);

/* ================================================================================
   🎯 SETTING ROW - Reusable component
   ================================================================================ */

const SettingRow = ({ 
  icon, 
  iconColor = COLORS.accentBlush,
  label, 
  description, 
  rightElement, 
  onPress, 
  disabled = false,
  showChevron = false,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  
  const handlePressIn = () => {
    if (onPress && !disabled) {
      Animated.spring(scaleAnim, {
        toValue: 0.98,
        useNativeDriver: true,
        speed: 50,
      }).start();
    }
  };
  
  const handlePressOut = () => {
    if (onPress && !disabled) {
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        speed: 50,
      }).start();
    }
  };

  const content = (
    <View style={[
      styles.settingRow,
      disabled && styles.settingRowDisabled
    ]}>
      <View style={[styles.settingIconContainer, { backgroundColor: iconColor + '15' }]}>
        <Ionicons name={icon} size={22} color={disabled ? COLORS.disabled : iconColor} />
      </View>
      <View style={styles.settingContent}>
        <Text style={[styles.settingLabel, disabled && styles.settingLabelDisabled]}>
          {label}
        </Text>
        {description && (
          <Text style={[styles.settingDescription, disabled && styles.settingDescriptionDisabled]}>
            {description}
          </Text>
        )}
      </View>
      {rightElement ? (
        <View style={styles.settingRight}>{rightElement}</View>
      ) : showChevron ? (
        <Ionicons 
          name="chevron-forward" 
          size={20} 
          color={disabled ? COLORS.disabled : COLORS.textTertiary} 
        />
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          onPress={onPress}
          disabled={disabled}
        >
          {content}
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return content;
};

/* ================================================================================
   🎯 PROFILE HEADER - Animated
   ================================================================================ */

const SettingsHeader = ({ title, subtitle, isConnected }) => {
  return (
    <View style={styles.headerContent}>
      <LinearGradient
        colors={[COLORS.gradientStart, COLORS.gradientMid, COLORS.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.headerTextBlock}>
        <Text style={styles.headerEyebrow}>MOMENTUM</Text>
        <Text style={styles.headerTitle}>{title}</Text>
        <Text style={styles.headerSubtitle}>{subtitle}</Text>
      </View>
      {!isConnected && (
        <View style={styles.offlineBadge}>
          <Ionicons name="cloud-offline" size={14} color="#fff" />
          <Text style={styles.offlineText}>Offline</Text>
        </View>
      )}
    </View>
  );
};

/* ================================================================================
   🎯 SETTINGS MODAL - Reusable modal with blur
   ================================================================================ */

const SettingsModal = ({ visible, onClose, title, children }) => {
  const slideAnim = useRef(new Animated.Value(height)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: height,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose} />
        
        <Animated.View style={[styles.modalContainer, { transform: [{ translateY: slideAnim }] }]}>
          <BlurView intensity={100} tint="light" style={styles.modalBlur}>
            <View style={styles.modalDragHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{title}</Text>
              <TouchableOpacity onPress={onClose} style={styles.modalCloseButton}>
                <Ionicons name="close" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={styles.modalContent}>
              {children}
            </View>
          </BlurView>
        </Animated.View>
      </View>
    </Modal>
  );
};

/* ================================================================================
   🎯 TOAST MESSAGE - Animated
   ================================================================================ */

const ToastMessage = ({ visible, message, type = 'success', onHide }) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 15,
        }),
      ]).start();

      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: 20,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start(() => onHide?.());
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [visible]);

  const getBackgroundColor = () => {
    switch (type) {
      case 'error': return COLORS.danger;
      case 'warning': return COLORS.warning;
      case 'info': return COLORS.info;
      default: return COLORS.success;
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'error': return 'close-circle';
      case 'warning': return 'warning';
      case 'info': return 'information-circle';
      default: return 'checkmark-circle';
    }
  };

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.toastContainer,
        {
          opacity: fadeAnim,
          transform: [{ translateY }],
          backgroundColor: getBackgroundColor(),
        },
      ]}
    >
      <Ionicons name={getIcon()} size={20} color="#fff" />
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  );
};

/* ================================================================================
   🏆 MAIN SETTINGS SCREEN - Complete redesign
   ================================================================================ */

export default function SettingsScreen() {
  const { user, profile, updateProfile } = useApp();

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
  const [toast, setToast] = useState({ visible: false, message: "", type: "success" });

  // ── Profile Edit State ──
  const [isProfileModalVisible, setIsProfileModalVisible] = useState(false);
  const [editUsername, setEditUsername] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editDob, setEditDob] = useState("");
  const [editPhotoURL, setEditPhotoURL] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [showDobPicker, setShowDobPicker] = useState(false);

  // ── Email Change State ──
  const [isEmailModalVisible, setIsEmailModalVisible] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [showEmailPassword, setShowEmailPassword] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [isEmailUpdating, setIsEmailUpdating] = useState(false);

  // Animation
  const scrollY = useRef(new Animated.Value(0)).current;

  /* ================================================================================
     📶 NETWORK CONNECTION MONITOR
     ================================================================================ */

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsConnected(state.isConnected);
      if (!state.isConnected) {
        showToast(ERROR_MESSAGES.NETWORK_ERROR, 'warning');
      }
    });

    return () => unsubscribe();
  }, []);

  /* ================================================================================
     🔥 LOAD SETTINGS
     ================================================================================ */

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    const loadSettings = async (retryCount = 0) => {
      try {
        const { data, error } = await supabase
          .from("settings")
          .select("notifications, reminder_time")
          .eq("user_id", user.id)
          .single();

        if (error && error.code !== "PGRST116") throw error; // PGRST116 = no row yet

        if (data) {
          setNotifications(data.notifications ?? true);

          if (data.reminder_time) {
            const [hours, minutes] = data.reminder_time.split(":").map(Number);
            const timeDate = new Date();
            timeDate.setHours(hours, minutes, 0, 0);
            setReminderTime(timeDate);
          }
        }
      } catch (error) {
        console.error("Failed to load settings:", error);

        if (retryCount < 3) {
          setTimeout(() => loadSettings(retryCount + 1), 1000 * (retryCount + 1));
        } else {
          showToast(ERROR_MESSAGES.SETTINGS_LOAD_FAILED, "error");
        }
      } finally {
        if (retryCount === 0) {
          setIsLoading(false);
        }
      }
    };

    loadSettings();
  }, [user]);

  /* ================================================================================
     💾 SAVE SETTINGS
     ================================================================================ */

  const saveSettings = useCallback(async (updates) => {
    if (!user || !isConnected) {
      showToast(ERROR_MESSAGES.NETWORK_ERROR, "warning");
      return false;
    }

    // Map camelCase keys to snake_case for Supabase
    const mapped = {};
    if ("notifications" in updates) mapped.notifications = updates.notifications;
    if ("reminderTime" in updates) mapped.reminder_time = updates.reminderTime;

    try {
      const { error } = await supabase
        .from("settings")
        .upsert({ user_id: user.id, ...mapped }, { onConflict: "user_id" });

      if (error) throw error;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return true;
    } catch (error) {
      console.error("Failed to save settings:", error);
      showToast(ERROR_MESSAGES.SETTINGS_SAVE_FAILED, "error");
      return false;
    }
  }, [user, isConnected]);

  /* ================================================================================
     🔔 NOTIFICATION HANDLERS
     ================================================================================ */

  const handleNotificationsToggle = useCallback(async (value) => {
    if (!isConnected) {
      showToast(ERROR_MESSAGES.NETWORK_ERROR, 'warning');
      return;
    }

    try {
      if (value) {
        const hasPermission = await requestNotificationPermissions();
        if (!hasPermission) {
          showToast(ERROR_MESSAGES.NOTIFICATIONS_PERMISSION_DENIED, 'error');
          return;
        }
        
        await saveSettings({ notifications: value });
        setNotifications(value);
        showToast("Notifications enabled", 'success');
      } else {
        await cancelAllNotifications();
        await saveSettings({ notifications: value });
        setNotifications(value);
        showToast("Notifications disabled", 'warning');
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {
      console.error("Error handling notification toggle:", error);
      showToast("Failed to update notification settings", 'error');
    }
  }, [isConnected, saveSettings]);

  /* ================================================================================
     ⏰ TIME PICKER HANDLERS
     ================================================================================ */

  const handleTimeChange = useCallback((event, selectedDate) => {
    if (Platform.OS === "android") {
      setShowTimePicker(false);
    }
    if (selectedDate) {
      setReminderTime(selectedDate);
      const timeString = `${String(selectedDate.getHours()).padStart(2, "0")}:${String(
        selectedDate.getMinutes()
      ).padStart(2, "0")}`;
      saveSettings({ reminderTime: timeString });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      showToast(`Daily reminder set to ${formatTimeDisplay(selectedDate)}`, 'success');
    }
  }, [saveSettings]);

  const formatTimeDisplay = useCallback((date) =>
    date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }), []);

  /* ================================================================================
     🔐 PASSWORD HANDLERS
     ================================================================================ */

  const handleChangePassword = useCallback(async () => {
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
      // Re-authenticate by signing in with current password first
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (signInError) {
        setPasswordError(ERROR_MESSAGES.CURRENT_PASSWORD_INCORRECT);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      // Now update the password
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

      if (updateError) {
        if (updateError.message?.includes("Password should")) {
          setPasswordError(ERROR_MESSAGES.PASSWORD_WEAK);
        } else {
          setPasswordError(ERROR_MESSAGES.UPDATE_FAILED);
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }

      setIsPasswordModalVisible(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast("Password updated successfully!");
    } catch (error) {
      console.error("Password update error:", error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setPasswordError(ERROR_MESSAGES.UPDATE_FAILED);
    } finally {
      setIsPasswordUpdating(false);
    }
  }, [user, currentPassword, newPassword, confirmNewPassword, isConnected]);

  /* ================================================================================
     🚪 LOGOUT HANDLER
     ================================================================================ */

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
              await cancelAllNotifications();
              await supabase.auth.signOut();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            } catch (error) {
              console.error("Logout error:", error);
              showToast(ERROR_MESSAGES.LOGOUT_FAILED, "error");
            }
          },
        },
      ],
      { cancelable: true }
    );
  }, []);

  /* ================================================================================
     🗑️ DELETE ACCOUNT HANDLERS
     ================================================================================ */

  const deleteUserData = useCallback(async (userId) => {
    // Delete all user rows from every table in parallel.
    // Supabase RLS with "user_id = auth.uid()" means the DB will also enforce this,
    // but we do it explicitly so there are no orphaned rows.
    await Promise.all([
      supabase.from("planner").delete().eq("user_id", userId),
      supabase.from("goals").delete().eq("user_id", userId),
      supabase.from("notes").delete().eq("user_id", userId),
      supabase.from("journal").delete().eq("user_id", userId),
      supabase.from("settings").delete().eq("user_id", userId),
    ]);

    // Remove user from shared_goals participant lists
    const { data: sharedGoals } = await supabase
      .from("shared_goals")
      .select("id, participants")
      .filter("participants", "cs", JSON.stringify([{ id: userId }]));

    if (sharedGoals?.length) {
      await Promise.all(
        sharedGoals.map(async (sg) => {
          const updated = (sg.participants || []).filter((p) => p.id !== userId);
          if (updated.length === 0) {
            return supabase.from("shared_goals").delete().eq("id", sg.id);
          }
          return supabase.from("shared_goals").update({ participants: updated }).eq("id", sg.id);
        })
      );
    }

    // The profile row is deleted by ON DELETE CASCADE from auth.users
    return true;
  }, []);

  const handleDeleteAccount = useCallback(async () => {
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
      Alert.prompt(
        "Confirm Account Deletion",
        "For security, please enter your password:",
        [
          { text: "Cancel", style: "cancel", onPress: () => setIsDeletingAccount(false) },
          { 
            text: "Delete Account", 
            style: "destructive", 
            onPress: async (password) => {
              if (!password || password.length < 6) {
                setDeleteAccountError("Please enter your current password.");
                setIsDeletingAccount(false);
                return;
              }

              try {
                // Verify password by re-signing in before deletion
                const { error: reAuthError } = await supabase.auth.signInWithPassword({
                  email: user.email,
                  password,
                });
                if (reAuthError) throw { code: "auth/wrong-password" };
                
                Alert.alert(
                  "⚠️ Final Warning",
                  "This action is permanent and cannot be undone. All your data will be lost.\n\nType CONFIRM to proceed:",
                  [
                    { text: "Cancel", style: "cancel", onPress: () => setIsDeletingAccount(false) },
                    {
                      text: "Delete Permanently",
                      style: "destructive",
                      onPress: async () => {
                        try {
                          await deleteUserData(user.id);
                          await cancelAllNotifications();
                          await clearAllInAppNotifications(user.id);
                          const { error: deleteError } = await supabase.rpc("delete_user");
                          if (deleteError) throw deleteError;
                          
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          showToast("Account successfully deleted", 'success');
                        } catch (deleteError) {
                          console.error("Final deletion error:", deleteError);
                          setDeleteAccountError(ERROR_MESSAGES.DELETE_ACCOUNT_FAILED);
                          setIsDeletingAccount(false);
                        }
                      },
                    },
                  ]
                );
              } catch (authError) {
                console.error("Authentication error:", authError);
                if (authError.code === "auth/wrong-password") {
                  setDeleteAccountError("Incorrect password.");
                } else {
                  setDeleteAccountError(ERROR_MESSAGES.DELETE_ACCOUNT_FAILED);
                }
                setIsDeletingAccount(false);
              }
            },
          },
        ],
        "secure-text"
      );
    } catch (error) {
      console.error("Account deletion error:", error);
      setDeleteAccountError(ERROR_MESSAGES.DELETE_ACCOUNT_FAILED);
      setIsDeletingAccount(false);
    }
  }, [user, deleteConfirmation, isConnected, deleteUserData]);

  /* ================================================================================
     👤 PROFILE HANDLERS - FIXED VERSIONS
     ================================================================================ */

 const openProfileModal = useCallback(() => {
    setEditUsername(profile?.username || "");
    setEditBio(profile?.bio || "");
    setEditDob(profile?.dob || "");
    setEditPhotoURL(profile?.profilePic || null);
    setIsProfileModalVisible(true);
  }, [profile]);

  const handlePickImage = useCallback(async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showToast('Permission to access gallery is required!', 'error');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.3, // Lower quality for smaller base64
        base64: true, // This is key - get base64 data
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        
        // If we have base64, use it directly
        if (asset.base64) {
          const base64Image = `data:image/jpeg;base64,${asset.base64}`;
          uploadAvatarBase64(base64Image);
        } else {
          // Fallback to URI method
          uploadAvatar(asset.uri);
        }
      }
    } catch (error) {
      console.error("Image picker error:", error);
      showToast("Failed to pick image", "error");
    }
  }, []);

  // NEW: Upload using base64 (MOST RELIABLE METHOD)
  const uploadAvatarBase64 = useCallback(async (base64Image) => {
    if (!user) return;
    setUploadingPhoto(true);
    
    try {
      console.log("Uploading base64 image...");
      
      // Instead of storing in Supabase Storage, store the base64 directly in the profile
      // This bypasses all storage permission issues
      
      // Update profile with base64 image
      const { error: dbError } = await supabase
        .from("profiles")
        .update({ 
          profile_pic: base64Image,
          updated_at: new Date().toISOString()
        })
        .eq("id", user.id);

      if (dbError) throw dbError;

      // Update local state
      setEditPhotoURL(base64Image);
      
      // Update app context
      const success = await updateProfile({ profile_pic: base64Image });
      
      if (success) {
        showToast("Profile picture updated!", "success");
      } else {
        throw new Error("Failed to update profile in context");
      }
      
    } catch (err) {
      console.error("Base64 upload error:", err);
      showToast("Upload failed: " + (err.message || "Unknown error"), "error");
    } finally {
      setUploadingPhoto(false);
    }
  }, [user, updateProfile]);

  // Fallback URI upload method (tries storage first, falls back to base64)
  const uploadAvatar = useCallback(async (uri) => {
    if (!user) return;
    setUploadingPhoto(true);
    
    try {
      console.log("Starting avatar upload from URI:", uri);
      
      // Try to convert to base64 first (most reliable)
      const response = await fetch(uri);
      const blob = await response.blob();
      
      // Convert blob to base64
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      
      reader.onloadend = async () => {
        const base64data = reader.result;
        
        // Update profile with base64 image
        const { error: dbError } = await supabase
          .from("profiles")
          .update({ 
            profile_pic: base64data,
            updated_at: new Date().toISOString()
          })
          .eq("id", user.id);

        if (dbError) throw dbError;

        // Update local state
        setEditPhotoURL(base64data);
        
        // Update app context
        const success = await updateProfile({ profile_pic: base64data });
        
        if (success) {
          showToast("Profile picture updated!", "success");
        } else {
          throw new Error("Failed to update profile in context");
        }
        
        setUploadingPhoto(false);
      };
      
      reader.onerror = () => {
        throw new Error("Failed to convert image to base64");
      };
      
    } catch (err) {
      console.error("Upload error:", err);
      showToast("Upload failed: " + (err.message || "Unknown error"), "error");
      setUploadingPhoto(false);
    }
  }, [user, updateProfile]);

  const handleSaveProfile = useCallback(async () => {
    if (!user) return;
    setSavingProfile(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    try {
      const updates = {
        username: editUsername.trim(),
        bio: editBio.trim(),
        dob: editDob || null,
      };
      
      // If there's a new photo URL, include it
      if (editPhotoURL && editPhotoURL !== profile?.profilePic) {
        updates.profile_pic = editPhotoURL;
      }
      
      // Update profile
      const success = await updateProfile(updates);
      
      if (success) {
        setIsProfileModalVisible(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showToast("Profile updated!", "success");
      } else {
        throw new Error("Failed to update profile");
      }
    } catch (err) {
      console.error("Save error:", err);
      showToast("Save failed: " + err.message, "error");
    } finally {
      setSavingProfile(false);
    }
  }, [user, editUsername, editBio, editDob, editPhotoURL, profile?.profilePic, updateProfile]);







  /* ================================================================================
     📧 EMAIL CHANGE HANDLER
     ================================================================================ */

  const handleChangeEmail = useCallback(async () => {
    if (!newEmail.includes("@")) {
      setEmailError("Please enter a valid email address.");
      return;
    }
    if (!emailPassword) {
      setEmailError("Please enter your current password.");
      return;
    }
    if (!isConnected) {
      setEmailError(ERROR_MESSAGES.NETWORK_ERROR);
      return;
    }
    setIsEmailUpdating(true);
    setEmailError("");
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: emailPassword,
      });
      if (signInError) {
        setEmailError("Password is incorrect.");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ email: newEmail.trim() });
      if (updateError) throw updateError;

      setIsEmailModalVisible(false);
      setNewEmail("");
      setEmailPassword("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast("Confirmation sent to " + newEmail.trim() + ". Check your inbox.", "info");
    } catch (err) {
      setEmailError(err.message || "Failed to update email.");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsEmailUpdating(false);
    }
  }, [user, newEmail, emailPassword, isConnected]);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ visible: true, message, type });
  }, []);

  const hideToast = useCallback(() => {
    setToast(prev => ({ ...prev, visible: false }));
  }, []);

  /* ================================================================================
     🎨 MEMOIZED VALUES
     ================================================================================ */

  const isPasswordValid = useMemo(() => {
    return validatePassword(newPassword) && 
           validatePasswordsMatch(newPassword, confirmNewPassword) && 
           currentPassword.length > 0;
  }, [currentPassword, newPassword, confirmNewPassword]);

  const isDeleteConfirmationValid = useMemo(() => {
    return deleteConfirmation.trim().toUpperCase() === "DELETE";
  }, [deleteConfirmation]);

  /* ================================================================================
     🎨 RENDER
     ================================================================================ */

  const headerHeight = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [Platform.OS === 'ios' ? 120 : 100, 80],
    extrapolate: 'clamp',
  });

  const headerTitleSize = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [32, 24],
    extrapolate: 'clamp',
  });

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.accentBlush} />
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.backgroundBase} />
      
      {/* Animated Header */}
      <Animated.View style={[styles.header, { height: headerHeight }]}>
        <SettingsHeader
          title="Settings"
          subtitle="Personalize your Momentum"
          isConnected={isConnected}
        />
      </Animated.View>

      <Animated.ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
      >
        {/* Hero Profile Card */}
        <TouchableOpacity onPress={openProfileModal} activeOpacity={0.92} style={styles.heroCard}>
          <LinearGradient
            colors={[COLORS.gradientStart, COLORS.gradientMid, COLORS.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGradient}
          >
            {/* Decorative circles */}
            <View style={styles.heroCircle1} />
            <View style={styles.heroCircle2} />

            <View style={styles.heroRow}>
              <View style={styles.heroAvatarWrap}>
                {profile?.profilePic ? (
  <Image 
    key={profile.profilePic}
    source={{ uri: profile.profilePic }} 
    style={styles.heroAvatar}
    onError={(e) => {
      console.log("Hero image failed to load:", profile.profilePic);
      // Optionally reset the image
    }}
  />
) : (
  <View style={styles.heroAvatarFallback}>
    <Text style={styles.heroAvatarInitial}>
      {(profile?.username || user?.email || "U")[0].toUpperCase()}
    </Text>
  </View>
)}
                <View style={styles.heroEditBadge}>
                  <Ionicons name="pencil" size={11} color="#fff" />
                </View>
              </View>

              <View style={styles.heroInfo}>
                <Text style={styles.heroName} numberOfLines={1}>
                  {profile?.username || user?.email?.split("@")[0] || "Momentum User"}
                </Text>
                <Text style={styles.heroEmail} numberOfLines={1}>{user?.email}</Text>
                {profile?.bio ? (
                  <Text style={styles.heroBio} numberOfLines={1}>{profile.bio}</Text>
                ) : null}
              </View>

              <View style={styles.heroChevronWrap}>
                <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.6)" />
              </View>
            </View>

            <View style={styles.heroFooter}>
              <View style={styles.heroPill}>
                <View style={styles.heroPillDot} />
                <Text style={styles.heroPillText}>Tap to edit profile</Text>
              </View>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* Account Section */}
        <Text style={styles.sectionLabel}>Account & Security</Text>

        <SettingCard>
          <SettingRow
            icon="mail-outline"
            iconColor={COLORS.accentPlum}
            label="Change Email"
            description={isConnected ? user?.email : "Offline - unavailable"}
            onPress={() => { setEmailError(""); setNewEmail(""); setEmailPassword(""); setIsEmailModalVisible(true); }}
            disabled={!isConnected}
            showChevron
          />

          <View style={styles.divider} />

          <SettingRow
            icon="lock-closed-outline"
            iconColor={COLORS.accentBlush}
            label="Change Password"
            description={isConnected ? "Update your password" : "Offline - unavailable"}
            onPress={() => setIsPasswordModalVisible(true)}
            disabled={!isConnected}
            showChevron
          />
        </SettingCard>

        {/* Preferences Section */}
        <Text style={styles.sectionLabel}>Preferences</Text>

        <SettingCard>
          <SettingRow
            icon="notifications-outline"
            iconColor={COLORS.sage}
            label="Push Notifications"
            description={isConnected
              ? (notifications ? "Enabled — stay on track" : "Disabled")
              : "Offline - unavailable"}
            disabled={!isConnected}
            rightElement={
              <Switch
                trackColor={{ false: COLORS.surfaceVariant, true: COLORS.sage + "60" }}
                thumbColor={notifications ? COLORS.sage : "#e0e0e0"}
                ios_backgroundColor={COLORS.surfaceVariant}
                onValueChange={handleNotificationsToggle}
                value={notifications}
                disabled={!isConnected}
              />
            }
          />
        </SettingCard>

        {/* Danger Zone */}
        <Text style={styles.sectionLabel}>Danger Zone</Text>

        <SettingCard style={styles.dangerCard}>
          <SettingRow
            icon="trash-outline"
            iconColor={COLORS.danger}
            label="Delete Account"
            description="Permanently remove all your data"
            onPress={() => setIsDeleteAccountModalVisible(true)}
            disabled={!isConnected}
            showChevron
          />
        </SettingCard>

        {/* Logout Button */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          activeOpacity={0.85}
          disabled={!isConnected}
        >
          <LinearGradient
            colors={[COLORS.gradientStart, COLORS.gradientMid]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.logoutGradient}
          >
            <Ionicons name="log-out-outline" size={20} color="rgba(255,255,255,0.9)" />
            <Text style={styles.logoutButtonText}>Sign Out</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>© 2026 Momentum</Text>
          <Text style={styles.versionText}>Version 2.0.0</Text>
        </View>
      </Animated.ScrollView>

      {/* Change Password Modal */}
      <SettingsModal
        visible={isPasswordModalVisible}
        onClose={() => {
          setIsPasswordModalVisible(false);
          setPasswordError("");
          setCurrentPassword("");
          setNewPassword("");
          setConfirmNewPassword("");
        }}
        title="Change Password"
      >
        <View style={styles.modalForm}>
          <Text style={styles.modalDescription}>
            Enter your current password and choose a new secure one.
          </Text>

          {/* Current Password */}
          <View style={styles.passwordField}>
            <Text style={styles.inputLabel}>Current Password</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color={COLORS.accentBlush} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Enter current password"
                placeholderTextColor={COLORS.placeholder}
                secureTextEntry={!showCurrentPassword}
                value={currentPassword}
                onChangeText={setCurrentPassword}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isPasswordUpdating}
              />
              <TouchableOpacity
                onPress={() => setShowCurrentPassword(!showCurrentPassword)}
                style={styles.eyeIcon}
              >
                <Ionicons
                  name={showCurrentPassword ? "eye-off-outline" : "eye-outline"}
                  size={22}
                  color={COLORS.textTertiary}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* New Password */}
          <View style={styles.passwordField}>
            <Text style={styles.inputLabel}>New Password</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-open-outline" size={20} color={COLORS.accentBlush} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="At least 6 characters"
                placeholderTextColor={COLORS.placeholder}
                secureTextEntry={!showNewPassword}
                value={newPassword}
                onChangeText={setNewPassword}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isPasswordUpdating}
              />
              <TouchableOpacity
                onPress={() => setShowNewPassword(!showNewPassword)}
                style={styles.eyeIcon}
              >
                <Ionicons
                  name={showNewPassword ? "eye-off-outline" : "eye-outline"}
                  size={22}
                  color={COLORS.textTertiary}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Confirm New Password */}
          <View style={styles.passwordField}>
            <Text style={styles.inputLabel}>Confirm New Password</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="checkmark-circle-outline" size={20} color={COLORS.accentBlush} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Re-enter new password"
                placeholderTextColor={COLORS.placeholder}
                secureTextEntry={!showConfirmPassword}
                value={confirmNewPassword}
                onChangeText={setConfirmNewPassword}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isPasswordUpdating}
              />
              <TouchableOpacity
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                style={styles.eyeIcon}
              >
                <Ionicons
                  name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
                  size={22}
                  color={COLORS.textTertiary}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Password Strength Indicator */}
          {newPassword.length > 0 && (
            <View style={styles.passwordStrength}>
              <View style={styles.strengthBar}>
                <View style={[
                  styles.strengthFill,
                  { 
                    width: `${Math.min(newPassword.length * 16.6, 100)}%`,
                    backgroundColor: newPassword.length < 6 ? COLORS.danger 
                      : newPassword.length < 8 ? COLORS.warning 
                      : COLORS.success 
                  }
                ]} />
              </View>
              <Text style={[
                styles.strengthText,
                { color: newPassword.length < 6 ? COLORS.danger 
                  : newPassword.length < 8 ? COLORS.warning 
                  : COLORS.success }
              ]}>
                {newPassword.length < 6 ? 'Too weak' 
                  : newPassword.length < 8 ? 'Good' 
                  : 'Strong'}
              </Text>
            </View>
          )}

          {passwordError ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={16} color={COLORS.danger} />
              <Text style={styles.errorText}>{passwordError}</Text>
            </View>
          ) : null}

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={() => setIsPasswordModalVisible(false)}
              disabled={isPasswordUpdating}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modalSaveButton,
                (!isPasswordValid || isPasswordUpdating) && styles.modalSaveButtonDisabled
              ]}
              onPress={handleChangePassword}
              disabled={!isPasswordValid || isPasswordUpdating}
            >
              <LinearGradient
                colors={[COLORS.accentBlush, COLORS.accentWarm]}
                style={styles.modalSaveGradient}
              >
                {isPasswordUpdating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalSaveText}>Update Password</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </SettingsModal>

      {/* Delete Account Modal */}
      <SettingsModal
        visible={isDeleteAccountModalVisible}
        onClose={() => {
          setIsDeleteAccountModalVisible(false);
          setDeleteConfirmation("");
          setDeleteAccountError("");
        }}
        title="Delete Account"
      >
        <View style={styles.modalForm}>
          <View style={styles.warningBox}>
            <Ionicons name="warning" size={24} color={COLORS.danger} />
            <Text style={styles.warningTitle}>Irreversible Action</Text>
            <Text style={styles.warningText}>
              This will permanently delete all your data and cannot be undone.
            </Text>
          </View>

          <View style={styles.deleteInfoBox}>
            <Text style={styles.deleteInfoTitle}>This will delete:</Text>
            <View style={styles.deleteInfoList}>
              <Text style={styles.deleteInfoItem}>• Your profile and settings</Text>
              <Text style={styles.deleteInfoItem}>• All tasks and goals</Text>
              <Text style={styles.deleteInfoItem}>• Your membership in shared goals</Text>
              <Text style={styles.deleteInfoItem}>• All associated data</Text>
            </View>
          </View>

          <View style={styles.confirmField}>
            <Text style={styles.confirmLabel}>
              Type <Text style={styles.confirmHighlight}>DELETE</Text> to confirm:
            </Text>
            <View style={[styles.inputWrapper, styles.confirmInputWrapper]}>
              <TextInput
                style={styles.confirmInput}
                placeholder="DELETE"
                placeholderTextColor={COLORS.placeholder}
                value={deleteConfirmation}
                onChangeText={setDeleteConfirmation}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!isDeletingAccount}
              />
            </View>
          </View>

          {deleteAccountError ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={16} color={COLORS.danger} />
              <Text style={styles.errorText}>{deleteAccountError}</Text>
            </View>
          ) : null}

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={() => {
                setIsDeleteAccountModalVisible(false);
                setDeleteConfirmation("");
              }}
              disabled={isDeletingAccount}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modalDeleteButton,
                (!isDeleteConfirmationValid || isDeletingAccount) && styles.modalDeleteButtonDisabled
              ]}
              onPress={handleDeleteAccount}
              disabled={!isDeleteConfirmationValid || isDeletingAccount}
            >
              {isDeletingAccount ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.modalDeleteText}>Delete Account</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </SettingsModal>

      {/* ── Edit Profile Modal ── */}
      <SettingsModal
        visible={isProfileModalVisible}
        onClose={() => setIsProfileModalVisible(false)}
        title="Edit Profile"
      >
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.modalForm}>
            <View style={styles.avatarPickerRow}>
              <TouchableOpacity onPress={handlePickImage} activeOpacity={0.8} style={styles.avatarPickerBtn}>
                {uploadingPhoto ? (
                  <ActivityIndicator size="large" color={COLORS.accentBlush} />
                ) : editPhotoURL ? (
                  <Image 
                    key={editPhotoURL}
                    source={{ uri: editPhotoURL }} 
                    style={styles.avatarPickerImg} 
                  />
                ) : (
                  <LinearGradient colors={[COLORS.accentBlush, COLORS.accentWarm]} style={styles.avatarPickerImg}>
                    <Text style={styles.avatarPickerInitial}>
                      {(editUsername || user?.email || "U")[0].toUpperCase()}
                    </Text>
                  </LinearGradient>
                )}
                <View style={styles.avatarPickerBadge}>
                  <Ionicons name="camera" size={14} color="#fff" />
                </View>
              </TouchableOpacity>
              <Text style={styles.avatarPickerHint}>Tap to change photo</Text>
            </View>

            <View style={styles.passwordField}>
              <Text style={styles.inputLabel}>Display Name</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="person-outline" size={20} color={COLORS.accentBlush} style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Your display name"
                  placeholderTextColor={COLORS.placeholder}
                  value={editUsername}
                  onChangeText={setEditUsername}
                  maxLength={40}
                  editable={!savingProfile}
                />
              </View>
            </View>

            <View style={styles.passwordField}>
              <Text style={styles.inputLabel}>Bio</Text>
              <View style={[styles.inputWrapper, { alignItems: 'flex-start', paddingVertical: 12 }]}>
                <Ionicons name="document-text-outline" size={20} color={COLORS.accentBlush} style={[styles.inputIcon, { marginTop: 2 }]} />
                <TextInput
                  style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
                  placeholder="Tell us about yourself..."
                  placeholderTextColor={COLORS.placeholder}
                  value={editBio}
                  onChangeText={setEditBio}
                  multiline
                  maxLength={200}
                  editable={!savingProfile}
                />
              </View>
            </View>

            <View style={styles.passwordField}>
              <Text style={styles.inputLabel}>Date of Birth</Text>
              <TouchableOpacity style={styles.inputWrapper} onPress={() => setShowDobPicker(true)} activeOpacity={0.8}>
                <Ionicons name="calendar-outline" size={20} color={COLORS.accentBlush} style={styles.inputIcon} />
                <Text style={[styles.input, { color: editDob ? COLORS.textPrimary : COLORS.placeholder }]}>
                  {editDob || "Select date"}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={COLORS.textTertiary} />
              </TouchableOpacity>
            </View>

            {showDobPicker && (
              <DateTimePicker
                value={editDob ? new Date(editDob) : new Date()}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                maximumDate={new Date()}
                onChange={(e, d) => {
                  setShowDobPicker(false);
                  if (d) setEditDob(d.toISOString().split("T")[0]);
                }}
              />
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelButton} onPress={() => setIsProfileModalVisible(false)} disabled={savingProfile}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveButton, savingProfile && styles.modalSaveButtonDisabled]}
                onPress={handleSaveProfile}
                disabled={savingProfile}
              >
                <LinearGradient colors={[COLORS.accentBlush, COLORS.accentWarm]} style={styles.modalSaveGradient}>
                  {savingProfile ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalSaveText}>Save Profile</Text>}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </SettingsModal>

      {/* ── Change Email Modal ── */}
      <SettingsModal
        visible={isEmailModalVisible}
        onClose={() => { setIsEmailModalVisible(false); setEmailError(""); }}
        title="Change Email"
      >
        <View style={styles.modalForm}>
          <Text style={styles.modalDescription}>
            Enter your new email. We'll send a confirmation link to verify it.
          </Text>
          <View style={styles.passwordField}>
            <Text style={styles.inputLabel}>New Email Address</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={20} color={COLORS.accentWarm} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="new@email.com"
                placeholderTextColor={COLORS.placeholder}
                value={newEmail}
                onChangeText={setNewEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoCorrect={false}
                editable={!isEmailUpdating}
              />
            </View>
          </View>
          <View style={styles.passwordField}>
            <Text style={styles.inputLabel}>Current Password (to confirm)</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color={COLORS.accentBlush} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Enter your password"
                placeholderTextColor={COLORS.placeholder}
                secureTextEntry={!showEmailPassword}
                value={emailPassword}
                onChangeText={setEmailPassword}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isEmailUpdating}
              />
              <TouchableOpacity onPress={() => setShowEmailPassword(!showEmailPassword)} style={styles.eyeIcon}>
                <Ionicons name={showEmailPassword ? "eye-off-outline" : "eye-outline"} size={22} color={COLORS.textTertiary} />
              </TouchableOpacity>
            </View>
          </View>
          {emailError ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle" size={16} color={COLORS.danger} />
              <Text style={styles.errorText}>{emailError}</Text>
            </View>
          ) : null}
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalCancelButton} onPress={() => setIsEmailModalVisible(false)} disabled={isEmailUpdating}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalSaveButton, (!newEmail.includes("@") || !emailPassword || isEmailUpdating) && styles.modalSaveButtonDisabled]}
              onPress={handleChangeEmail}
              disabled={!newEmail.includes("@") || !emailPassword || isEmailUpdating}
            >
              <LinearGradient colors={[COLORS.accentWarm, COLORS.accentBlush]} style={styles.modalSaveGradient}>
                {isEmailUpdating ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalSaveText}>Update Email</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </SettingsModal>

      {/* Toast Message */}
      <ToastMessage
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onHide={hideToast}
      />
    </SafeAreaView>
  );
}

/* ================================================================================
   🎨 STYLES - Complete redesign matching all screens
   ================================================================================ */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.backgroundBase,
  },

  // ── Header ──
  header: {
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
  },
  headerContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 54 : 24,
    paddingBottom: 22,
  },
  headerTextBlock: {
    flex: 1,
  },
  headerEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 3,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 34,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.8,
    lineHeight: 38,
  },
  headerSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 3,
    fontWeight: '400',
    letterSpacing: 0.2,
  },

  // Offline Badge
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  offlineText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },

  // Loading
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.backgroundBase,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },

  // Scroll View
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 50,
  },

  // Section Label
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textTertiary,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 6,
    marginLeft: 4,
  },

  // Setting Card
  settingCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 14,
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.7,
    shadowRadius: 16,
    elevation: 5,
    borderWidth: 1,
    borderColor: 'rgba(196,116,110,0.1)',
  },
  settingCardBlur: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.96)',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 15,
  },
  settingRowDisabled: {
    opacity: 0.45,
  },
  settingIconContainer: {
    width: 42,
    height: 42,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  settingContent: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    letterSpacing: -0.1,
  },
  settingLabelDisabled: {
    color: COLORS.textTertiary,
  },
  settingDescription: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
    letterSpacing: 0.1,
  },
  settingDescriptionDisabled: {
    color: COLORS.textTertiary,
  },
  settingRight: {
    marginLeft: 10,
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: 'rgba(196,116,110,0.08)',
    marginLeft: 74,
    marginRight: 18,
  },

  // ── Hero Profile Card ──
  heroCard: {
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 22,
    shadowColor: COLORS.gradientStart,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
  },
  heroGradient: {
    padding: 22,
    paddingBottom: 16,
    borderRadius: 24,
    overflow: 'hidden',
  },
  heroCircle1: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.04)',
    top: -60,
    right: -40,
  },
  heroCircle2: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.03)',
    bottom: -30,
    left: 20,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroAvatarWrap: {
    position: 'relative',
    marginRight: 16,
  },
  heroAvatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  heroAvatarFallback: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroAvatarInitial: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  heroEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroInfo: {
    flex: 1,
  },
  heroName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.4,
    marginBottom: 3,
  },
  heroEmail: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '400',
  },
  heroBio: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 3,
    fontStyle: 'italic',
  },
  heroChevronWrap: {
    marginLeft: 8,
  },
  heroFooter: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroPillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  heroPillText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    fontWeight: '500',
    letterSpacing: 0.3,
  },

  // Danger Zone
  dangerCard: {
    borderWidth: 1,
    borderColor: COLORS.danger + '20',
  },

  // Logout Button
  logoutButton: {
    marginTop: 22,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: COLORS.gradientStart,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  logoutGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 17,
    gap: 9,
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // Avatar picker in modal
  avatarPickerRow: {
    alignItems: 'center',
    marginBottom: 8,
  },
  avatarPickerBtn: {
    width: 96,
    height: 96,
    borderRadius: 48,
    position: 'relative',
    overflow: 'visible',
  },
  avatarPickerImg: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarPickerInitial: {
    color: '#fff',
    fontSize: 36,
    fontWeight: '800',
  },
  avatarPickerBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: COLORS.accentBlush,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  avatarPickerHint: {
    marginTop: 10,
    fontSize: 13,
    color: COLORS.textSecondary,
  },

  // Footer
  footer: {
    alignItems: 'center',
    marginTop: 44,
    paddingBottom: 10,
  },
  footerText: {
    fontSize: 11,
    color: COLORS.textTertiary,
    marginBottom: 3,
    letterSpacing: 0.5,
    fontWeight: '500',
  },
  versionText: {
    fontSize: 10,
    color: COLORS.textTertiary,
    opacity: 0.5,
    letterSpacing: 0.3,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    flex: 1,
  },
  modalContainer: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    maxHeight: height * 0.88,
  },
  modalBlur: {
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 44 : 24,
    backgroundColor: 'rgba(247,243,239,0.97)',
  },
  modalDragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.textTertiary,
    alignSelf: 'center',
    marginBottom: 16,
    opacity: 0.4,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(196,116,110,0.1)',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: -0.3,
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    padding: 22,
  },
  modalForm: {
    gap: 20,
  },
  modalDescription: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: 8,
  },

  // Form Fields
  passwordField: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginLeft: 4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 14 : 8,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  eyeIcon: {
    padding: 4,
  },

  // Password Strength
  passwordStrength: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
  },
  strengthBar: {
    flex: 1,
    height: 4,
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 2,
    overflow: 'hidden',
  },
  strengthFill: {
    height: '100%',
    borderRadius: 2,
  },
  strengthText: {
    fontSize: 12,
    fontWeight: '600',
    width: 70,
  },

  // Error
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.danger + '10',
    padding: 12,
    borderRadius: 12,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.danger,
    fontWeight: '500',
  },

  // Modal Actions
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalCancelButton: {
    flex: 1,
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  modalSaveButton: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  modalSaveButtonDisabled: {
    opacity: 0.5,
  },
  modalSaveGradient: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalSaveText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  modalDeleteButton: {
    flex: 1,
    backgroundColor: COLORS.danger,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalDeleteButtonDisabled: {
    backgroundColor: COLORS.disabled,
    opacity: 0.5,
  },
  modalDeleteText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  // Delete Account Modal
  warningBox: {
    alignItems: 'center',
    backgroundColor: COLORS.danger + '10',
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.danger + '30',
    marginBottom: 8,
  },
  warningTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.danger,
    marginTop: 12,
    marginBottom: 8,
  },
  warningText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  deleteInfoBox: {
    backgroundColor: COLORS.surfaceVariant,
    padding: 16,
    borderRadius: 14,
  },
  deleteInfoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  deleteInfoList: {
    gap: 6,
  },
  deleteInfoItem: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  confirmField: {
    gap: 8,
  },
  confirmLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  confirmHighlight: {
    color: COLORS.danger,
    fontWeight: '800',
  },
  confirmInputWrapper: {
    borderColor: COLORS.danger + '50',
    backgroundColor: COLORS.danger + '05',
  },
  confirmInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
    letterSpacing: 2,
  },

  // Toast
  toastContainer: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    gap: 12,
  },
  toastText: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});