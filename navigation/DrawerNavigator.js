import { Ionicons } from "@expo/vector-icons";
import {
  DrawerContentScrollView,
  DrawerItemList,
  createDrawerNavigator,   // ✅ FIX
} from "@react-navigation/drawer";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  signOut,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { useApp } from "../context/AppContext";

// Screens
import GoalsScreen from "../screens/GoalsScreen";
import HabitsScreen from "../screens/HabitsScreen";
import HomeScreen from "../screens/HomeScreen";
import JournalScreen from "../screens/JournalScreen";
import NotesScreen from "../screens/NotesScreen";
import PlannerScreen from "../screens/PlannerScreen";
import ProfileScreen from "../screens/ProfileScreen";
import SharedGoalsScreen from "../screens/SharedGoalsScreen";

/* ---------------- DRAWER SETUP ---------------- */
const Drawer = createDrawerNavigator(); // ✅ FIX

/* ---------------- FIREBASE SETUP ---------------- */
const firebaseConfig =
  typeof __firebase_config !== "undefined"
    ? JSON.parse(__firebase_config)
    : {};
const initialAuthToken =
  typeof __initial_auth_token !== "undefined"
    ? __initial_auth_token
    : null;

let auth;
try {
  if (Object.keys(firebaseConfig).length > 0) {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    getFirestore(app);
  }
} catch (e) {
  console.error("Firebase init failed:", e);
}

/* ---------------- THEME ---------------- */
const COLORS = {
  backgroundBase: "#FAFAFA",
  card: "#FFFFFF",
  textPrimary: "#4A3228",
  textSecondary: "#A98467",
  accentBlush: "#D8A39D",
  accentDark: "#7E6B5A",
  nudeShadow: "rgba(126,107,90,0.4)",
  delete: "#9A3B3B",
};

/* ---------------- CONFIRMATION MODAL ---------------- */
const ConfirmationModal = ({
  isVisible,
  message,
  onConfirm,
  onCancel,
  type,
}) => (
  <Modal transparent visible={isVisible} animationType="fade">
    <View style={modalStyles.modalOverlay}>
      <View style={modalStyles.modalContainer}>
        <Ionicons
          name={
            type === "confirm"
              ? "log-out-outline"
              : type === "error"
              ? "close-circle-outline"
              : "checkmark-circle-outline"
          }
          size={48}
          color={
            type === "error" ? COLORS.delete : COLORS.accentDark
          }
        />

        <Text style={modalStyles.modalTitleText}>
          {type === "confirm"
            ? "Confirm Log Out"
            : type === "error"
            ? "Error"
            : "Success"}
        </Text>

        <Text style={modalStyles.modalBodyText}>{message}</Text>

        <View style={modalStyles.buttonRow}>
          {type === "confirm" && (
            <TouchableOpacity
              style={modalStyles.cancelButton}
              onPress={onCancel}
            >
              <Text style={modalStyles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={
              type === "error"
                ? modalStyles.errorConfirmButton
                : modalStyles.confirmButton
            }
            onPress={onConfirm}
          >
            <Text style={modalStyles.confirmButtonText}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
);

/* ---------------- CUSTOM DRAWER ---------------- */
function CustomDrawerContent(props) {
  const { profile } = useApp();
  const [loading, setLoading] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);

  useEffect(() => {
    if (!auth) return;
    (async () => {
      try {
        initialAuthToken
          ? await signInWithCustomToken(auth, initialAuthToken)
          : await signInAnonymously(auth);
      } catch {}
    })();
  }, []);

  return (
    <DrawerContentScrollView {...props} contentContainerStyle={{ flex: 1 }}>
      <View style={styles.profileContainer}>
        <TouchableOpacity
          onPress={() => props.navigation.navigate("Profile")}
        >
          {profile?.profilePic ? (
            <Image
              source={{ uri: profile.profilePic }}
              style={styles.avatar}
            />
          ) : (
            <Ionicons
              name="person-circle-outline"
              size={80}
              color={COLORS.accentDark}
            />
          )}
          <Text style={styles.username}>
            {profile?.username || "Momentum User"}
          </Text>
        </TouchableOpacity>
      </View>

      <DrawerItemList {...props} />

      <TouchableOpacity
        style={styles.logoutButton}
        onPress={() => setConfirmVisible(true)}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator />
        ) : (
          <>
            <Ionicons name="log-out-outline" size={22} />
            <Text style={styles.logoutText}>Logout</Text>
          </>
        )}
      </TouchableOpacity>

      <ConfirmationModal
        isVisible={confirmVisible}
        type="confirm"
        message="Are you sure you want to log out?"
        onCancel={() => setConfirmVisible(false)}
        onConfirm={() => signOut(auth)}
      />
    </DrawerContentScrollView>
  );
}

/* ---------------- DRAWER NAVIGATOR ---------------- */
export default function DrawerNavigator() {
  return (
    <Drawer.Navigator
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Drawer.Screen name="Home" component={HomeScreen} />
      <Drawer.Screen name="Planner" component={PlannerScreen} />
      <Drawer.Screen name="Goals" component={GoalsScreen} />
      <Drawer.Screen name="Shared Goals" component={SharedGoalsScreen} />
      <Drawer.Screen name="Habits" component={HabitsScreen} />
      <Drawer.Screen name="Notes" component={NotesScreen} />
      <Drawer.Screen name="Journal" component={JournalScreen} />
      <Drawer.Screen name="Profile" component={ProfileScreen} />
    </Drawer.Navigator>
  );
}
