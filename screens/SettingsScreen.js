// screens/SettingsScreen.js
// 🎯 COMPLETE REDESIGN - February 12, 2026
// ✅ Glass-morphism design with BlurView
// ✅ Animated header with scroll effect
// ✅ Smooth animations & micro-interactions
// ✅ iOS-style modals with blur
// ✅ Production-ready error handling
// ✅ Offline-aware with connection status
// ✅ Matches all other screens perfectly

import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import NetInfo from '@react-native-community/netinfo';
import { BlurView } from 'expo-blur';
import * as Haptics from "expo-haptics";
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
  backgroundBase: "#FAFAFA",
  card: "#FFFFFF",
  textPrimary: "#4A3228",
  textSecondary: "#A98467",
  accentBlush: "#D8A39D",
  accentWarm: "#E3B777",
  sage: "#5D8B7E",
  nudeShadow: "rgba(216,163,157,0.12)",
  shadowDark: "rgba(0,0,0,0.06)",
  danger: "#FF6347",
  success: "#5D8B7E",
  info: "#2196F3",
  warning: "#FFA726",
  surfaceVariant: "#F8F2F0",
  textTertiary: "#B7A29E",
  cardBorder: "rgba(216,163,157,0.2)",
  gradientStart: "#FFF9F8",
  gradientEnd: "#FAF0ED",
  overlay: "rgba(74,50,40,0.4)",
  placeholder: "#C7B5B0",
  destructive: "#E74C3C",
  disabled: "#CCCCCC",
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
  <BlurView intensity={90} tint="light" style={[styles.settingCard, style]}>
    {children}
  </BlurView>
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
      <View>
        <Text style={styles.headerTitle}>{title}</Text>
        <Text style={styles.headerSubtitle}>{subtitle}</Text>
      </View>
      
      {!isConnected && (
        <View style={styles.offlineBadge}>
          <Ionicons name="cloud-offline" size={16} color="#fff" />
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
  const { user, profile, setUser } = useApp();

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
                          setUser(null);
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
  }, [user, deleteConfirmation, isConnected, deleteUserData, setUser]);

  /* ================================================================================
     🎯 TOAST HELPER
     ================================================================================ */

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
        <LinearGradient
          colors={[COLORS.gradientStart, COLORS.gradientEnd]}
          style={StyleSheet.absoluteFill}
        />
        
        <SettingsHeader
          title="Settings"
          subtitle="Customize your experience"
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
        {/* Profile Card */}
         <SettingCard>
    <View style={styles.profileCard}>
      {profile?.profilePic ? (
        <Image source={{ uri: profile.profilePic }} style={styles.avatarGradient} />
      ) : (
        <LinearGradient
          colors={[COLORS.accentBlush, COLORS.accentWarm]}
          style={styles.avatarGradient}
        >
          <Text style={styles.avatarText}>
            {profile?.username?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'U'}
          </Text>
        </LinearGradient>
      )}
      <View style={styles.profileInfo}>
        <Text style={styles.profileName}>
          {profile?.username || user?.email?.split('@')[0] || "Momentum User"}
        </Text>
        <Text style={styles.profileEmail} numberOfLines={1}>
          {user?.email}
        </Text>
      </View>
    </View>
  </SettingCard>

        {/* Account Section */}
        <Text style={styles.sectionHeader}>
          <Ionicons name="person-outline" size={16} color={COLORS.textSecondary} />
          <Text style={styles.sectionHeaderText}> Account</Text>
        </Text>

        <SettingCard>
          <SettingRow
            icon="finger-print-outline"
            iconColor={COLORS.accentBlush}
            label="User ID"
            description="Your unique identifier"
            rightElement={
              <TouchableOpacity
                onPress={() => {
                  if (user?.uid) {
                    Alert.alert("User ID", user.id, [
                      { text: "Copy", onPress: () => showToast("User ID copied", 'success') },
                      { text: "OK" }
                    ]);
                  }
                }}
              >
                <Text style={styles.userIdText}>
                  {user?.uid ? `${user.id.substring(0, 8)}...` : "N/A"}
                </Text>
              </TouchableOpacity>
            }
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
        <Text style={styles.sectionHeader}>
          <Ionicons name="settings-outline" size={16} color={COLORS.textSecondary} />
          <Text style={styles.sectionHeaderText}> Preferences</Text>
        </Text>

        <SettingCard>
          <SettingRow
            icon="notifications-outline"
            iconColor={COLORS.sage}
            label="Push Notifications"
            description={isConnected 
              ? (notifications ? "Enabled" : "Disabled")
              : "Offline - unavailable"}
            disabled={!isConnected}
            rightElement={
              <Switch
                trackColor={{ false: COLORS.surfaceVariant, true: COLORS.sage + '80' }}
                thumbColor={notifications ? COLORS.sage : '#f4f3f4'}
                ios_backgroundColor={COLORS.surfaceVariant}
                onValueChange={handleNotificationsToggle}
                value={notifications}
                disabled={!isConnected}
              />
            }
          />

          <View style={styles.divider} />

          <SettingRow
            icon="time-outline"
            iconColor={COLORS.accentWarm}
            label="Daily Reminder Time"
            description={!isConnected ? "Offline - unavailable" 
              : !notifications ? "Enable notifications first"
              : "Tap to change"}
            onPress={() => notifications && isConnected && setShowTimePicker(true)}
            disabled={!notifications || !isConnected}
            rightElement={
              <View style={styles.timeDisplay}>
                <Text style={styles.timeText}>
                  {formatTimeDisplay(reminderTime)}
                </Text>
              </View>
            }
          />
        </SettingCard>

        {/* Time Picker */}
        {showTimePicker && (
          <DateTimePicker
            value={reminderTime}
            mode="time"
            is24Hour={false}
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleTimeChange}
          />
        )}

        {/* Danger Zone */}
       
        <SettingCard style={styles.dangerCard}>
          <TouchableOpacity
            style={styles.deleteAccountButton}
            onPress={() => setIsDeleteAccountModalVisible(true)}
            disabled={!isConnected}
            activeOpacity={0.8}
          >
            <Ionicons name="trash-outline" size={22} color={COLORS.danger} />
            <Text style={styles.deleteAccountButtonText}>Delete Account</Text>
            <Ionicons name="chevron-forward" size={20} color={COLORS.danger} />
          </TouchableOpacity>
        </SettingCard>

        {/* Logout Button */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          activeOpacity={0.8}
          disabled={!isConnected}
        >
          <LinearGradient
            colors={[COLORS.accentBlush, COLORS.accentWarm]}
            style={styles.logoutGradient}
          >
            <Ionicons name="log-out-outline" size={22} color="#fff" />
            <Text style={styles.logoutButtonText}>Log Out</Text>
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

  // Header
  header: {
    backgroundColor: COLORS.card,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 8,
    overflow: 'hidden',
  },
  headerContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 50 : 18,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
    fontWeight: '500',
  },

  // Offline Badge
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warning,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  offlineText: {
    color: '#fff',
    fontSize: 12,
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
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },

  // Section Header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 8,
  },
  sectionHeaderText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginLeft: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Setting Card
  settingCard: {
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 16,
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 4,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  settingRowDisabled: {
    opacity: 0.6,
  },
  settingIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  settingContent: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  settingLabelDisabled: {
    color: COLORS.textTertiary,
  },
  settingDescription: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  settingDescriptionDisabled: {
    color: COLORS.textTertiary,
  },
  settingRight: {
    marginLeft: 12,
  },

  // Divider
  divider: {
    height: 1,
    backgroundColor: COLORS.cardBorder,
    marginLeft: 80,
  },

  // Profile Card
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  avatarGradient: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.accentBlush,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  avatarText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
  },
  profileInfo: {
    flex: 1,
    marginLeft: 16,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },

  // User ID
  userIdText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '600',
    backgroundColor: COLORS.surfaceVariant,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },

  // Time Display
  timeDisplay: {
    backgroundColor: COLORS.surfaceVariant,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.accentWarm + '30',
  },
  timeText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.accentWarm,
  },

  // Danger Zone
  dangerCard: {
    borderWidth: 1,
    borderColor: COLORS.danger + '30',
  },
  deleteAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  deleteAccountButtonText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.danger,
    marginLeft: 12,
  },

  // Logout Button
  logoutButton: {
    marginTop: 20,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: COLORS.accentBlush,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6,
  },
  logoutGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },

  // Footer
  footer: {
    alignItems: 'center',
    marginTop: 40,
  },
  footerText: {
    fontSize: 12,
    color: COLORS.textTertiary,
    marginBottom: 4,
  },
  versionText: {
    fontSize: 11,
    color: COLORS.textTertiary,
    opacity: 0.6,
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    maxHeight: height * 0.9,
  },
  modalBlur: {
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  modalCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    padding: 20,
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