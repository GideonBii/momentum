// SettingsScreen.js
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  EmailAuthProvider,
  getAuth,
  reauthenticateWithCredential,
  signOut,
  updatePassword,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
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
} from "react-native";
import { useApp } from "../context/AppContext";
import { db } from "../firebaseConfig";

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
  lightBorder: "#E8E8E8",
};

export default function SettingsScreen() {
  const { user, appId, profile } = useApp();
  const auth = getAuth();

  // Settings State
  const [notifications, setNotifications] = useState(true);
  const [reminderTime, setReminderTime] = useState(() => {
    const date = new Date();
    date.setHours(9, 0, 0, 0);
    return date;
  });
  const [isLoading, setIsLoading] = useState(true);

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

  // Toast
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const settingsDocRef = (uid, appid) =>
    doc(db, `artifacts/${appid}/users/${uid}/settings/preferences`);

  useEffect(() => {
    if (!user || !appId) {
      setIsLoading(false);
      return;
    }

    const loadSettings = async () => {
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
      } catch (e) {
        console.error("Failed to load settings:", e);
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, [user, appId]);

  const saveSettings = async (updates) => {
    if (!user || !appId) return;
    try {
      await setDoc(settingsDocRef(user.uid, appId), updates, { merge: true });
    } catch (e) {
      console.error("Failed to save settings:", e);
    }
  };

  const showMessage = (msg, isError = false) => {
    setSuccessMessage(msg);
    setShowSuccessMessage(true);
    setTimeout(() => setShowSuccessMessage(false), isError ? 4000 : 2500);
  };

  const handleLogout = async () => {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Yes",
        onPress: async () => {
          try {
            await signOut(auth);
          } catch (error) {
            showMessage("Logout failed. Please try again.", true);
          }
        },
      },
    ]);
  };

  const handleTimeChange = (event, selectedDate) => {
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
  };

  const formatTimeDisplay = (date) =>
    date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError("New passwords do not match.");
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
      showMessage("Password updated successfully!");
    } catch (error) {
      console.error("Password update error:", error);
      if (error.code === "auth/wrong-password") {
        setPasswordError("Current password is incorrect.");
      } else if (error.code === "auth/weak-password") {
        setPasswordError("New password is too weak.");
      } else {
        setPasswordError("Failed to update password. Please try again.");
      }
    } finally {
      setIsPasswordUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.accentBlush} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
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
            <Text style={styles.profileEmail}>{user?.email || "user@momentum.com"}</Text>
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
            <Text style={styles.optionValue}>
              {user?.uid ? user.uid.substring(0, 8) + "..." : "N/A"}
            </Text>
          </View>

          <View style={styles.separator} />

          <TouchableOpacity
            style={styles.row}
            onPress={() => setIsPasswordModalVisible(true)}
            activeOpacity={0.7}
          >
            <View style={styles.iconContainer}>
              <Ionicons name="lock-closed-outline" size={20} color={COLORS.accentBlush} />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.optionLabel}>Change Password</Text>
              <Text style={styles.optionDescription}>Update your password</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Preferences Section */}
        <Text style={styles.sectionHeader}>
          Preferences
        </Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.iconContainer}>
              <Ionicons name="notifications-outline" size={20} color={COLORS.accentBlush} />
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.optionLabel}>Daily Notifications</Text>
              <Text style={styles.optionDescription}>Get daily reminders</Text>
            </View>
            <Switch
              trackColor={{ false: COLORS.lightBorder, true: COLORS.accentSage }}
              thumbColor={COLORS.card}
              ios_backgroundColor={COLORS.lightBorder}
              onValueChange={(value) => {
                setNotifications(value);
                saveSettings({ notifications: value });
              }}
              value={notifications}
            />
          </View>

          <View style={styles.separator} />

          <TouchableOpacity
            style={styles.row}
            onPress={() => notifications && setShowTimePicker(true)}
            disabled={!notifications}
            activeOpacity={0.7}
          >
            <View style={styles.iconContainer}>
              <Ionicons
                name="time-outline"
                size={20}
                color={notifications ? COLORS.accentBlush : COLORS.lightBorder}
              />
            </View>
            <View style={styles.rowContent}>
              <Text style={[styles.optionLabel, !notifications && { color: COLORS.textSecondary }]}>
                Daily Reminder Time
              </Text>
              <Text style={styles.optionDescription}>
                {notifications ? "Tap to change" : "Enable notifications first"}
              </Text>
            </View>
            <View style={styles.timeDisplay}>
              <Text style={[styles.timeText, !notifications && { color: COLORS.textSecondary }]}>
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

        {/* Logout */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={22} color={COLORS.card} />
          <Text style={styles.logoutButtonText}>Log Out</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>© 2025 Momentum - All Rights Reserved</Text>
      </ScrollView>

      {/* Toast */}
      {showSuccessMessage && (
        <View
          style={[
            styles.messageBox,
            successMessage.includes("failed")
              ? { backgroundColor: COLORS.error }
              : { backgroundColor: COLORS.success },
          ]}
        >
          <Ionicons
            name={successMessage.includes("failed") ? "close-circle" : "checkmark-circle"}
            size={20}
            color="#fff"
          />
          <Text style={styles.messageText}>{successMessage}</Text>
        </View>
      )}

      {/* Change Password Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isPasswordModalVisible}
        onRequestClose={() => setIsPasswordModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.passwordModalCard}>
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
              />
              <TouchableOpacity
                style={styles.eyeIcon}
                onPress={() => setShowCurrentPassword(!showCurrentPassword)}
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
                placeholder="New Password"
                placeholderTextColor={COLORS.textSecondary}
                secureTextEntry={!showNewPassword}
                value={newPassword}
                onChangeText={setNewPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={styles.eyeIcon}
                onPress={() => setShowNewPassword(!showNewPassword)}
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
              />
              <TouchableOpacity
                style={styles.eyeIcon}
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                <Ionicons
                  name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
                  size={22}
                  color={COLORS.textSecondary}
                />
              </TouchableOpacity>
            </View>

            {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}

            <View style={styles.modalButtonContainer}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setIsPasswordModalVisible(false);
                  setPasswordError("");
                  setCurrentPassword("");
                  setNewPassword("");
                  setConfirmNewPassword("");
                  setShowCurrentPassword(false);
                  setShowNewPassword(false);
                  setShowConfirmPassword(false);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.saveButton,
                  (isPasswordUpdating ||
                    newPassword.length < 6 ||
                    newPassword !== confirmNewPassword ||
                    !currentPassword) &&
                    styles.saveButtonDisabled,
                ]}
                onPress={handleChangePassword}
                disabled={
                  isPasswordUpdating ||
                  newPassword.length < 6 ||
                  newPassword !== confirmNewPassword ||
                  !currentPassword
                }
              >
                {isPasswordUpdating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>Update</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.backgroundBase },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.backgroundBase },
  container: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  headerSection: { marginBottom: 30 },
  headerTitle: { fontSize: 36, fontWeight: "900", color: COLORS.textPrimary, letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 16, color: COLORS.textSecondary, marginTop: 5, fontWeight: "500" },
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
  profileName: { fontSize: 20, fontWeight: "700", color: COLORS.textPrimary, marginBottom: 4 },
  profileEmail: { fontSize: 14, color: COLORS.textSecondary, fontWeight: "500" },
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
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 12 },
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
  optionLabel: { fontSize: 16, fontWeight: "600", color: COLORS.textPrimary, marginBottom: 2 },
  optionDescription: { fontSize: 13, color: COLORS.textSecondary, fontWeight: "400" },
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
  timeText: { fontSize: 15, fontWeight: "700", color: COLORS.accentSage },
  separator: { height: 1, backgroundColor: COLORS.lightBorder, marginVertical: 8, marginLeft: 56 },
  logoutButton: {
    backgroundColor: COLORS.accentBlush,
    padding: 18,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginTop: 30,
    shadowColor: COLORS.accentBlush,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  logoutButtonText: { color: COLORS.card, fontSize: 17, fontWeight: "700", marginLeft: 10, letterSpacing: 0.3 },
  footer: { textAlign: "center", fontSize: 12, color: COLORS.textSecondary, marginTop: 30, opacity: 0.6, fontWeight: "500" },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
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
  modalIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.accentBlush + "20",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: 20,
  },
  modalTitle: { fontSize: 26, fontWeight: "800", color: COLORS.textPrimary, textAlign: "center", marginBottom: 10 },
  modalText: { fontSize: 15, color: COLORS.textSecondary, textAlign: "center", marginBottom: 25, lineHeight: 22 },
  passwordInputContainer: { position: "relative", marginBottom: 15 },
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
  eyeIcon: { position: "absolute", right: 14, top: 16 },
  errorText: { color: COLORS.error, fontSize: 13, marginTop: 5, marginBottom: 10, fontWeight: "600" },
  modalButtonContainer: { flexDirection: "row", marginTop: 25, gap: 12 },
  cancelButton: {
    flex: 1,
    backgroundColor: COLORS.backgroundBase,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: COLORS.lightBorder,
  },
  cancelButtonText: { color: COLORS.textPrimary, fontSize: 16, fontWeight: "700" },
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
  saveButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  saveButtonDisabled: { backgroundColor: COLORS.textSecondary, opacity: 0.5 },
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
  messageText: { color: "#fff", fontWeight: "700", marginLeft: 12, fontSize: 15 },
});