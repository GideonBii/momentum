import { Ionicons } from "@expo/vector-icons";
import {
  DrawerContentScrollView,
  DrawerItemList
} from "@react-navigation/drawer";
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, signInWithCustomToken, signOut } from "firebase/auth";
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

// Assuming context and firebase are initialized globally or imported in your app structure
import { useApp } from "../context/AppContext";

// Import all screens used in the Drawer Navigator
import GoalsScreen from "../screens/GoalsScreen";
import HabitsScreen from "../screens/HabitsScreen";
import HomeScreen from "../screens/HomeScreen";
import JournalScreen from "../screens/JournalScreen";
import NotesScreen from "../screens/NotesScreen";
import PlannerScreen from "../screens/PlannerScreen";
import ProfileScreen from "../screens/ProfileScreen";
import SharedGoalsScreen from "../screens/SharedGoalsScreen";

/* --- FIREBASE SETUP --- */
// Globals provided by the canvas environment
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Initialize Firebase App
let auth;
try {
  if (Object.keys(firebaseConfig).length > 0) {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    getFirestore(app); // Initialize Firestore for setup consistency
  } else {
    console.error("Firebase configuration is missing.");
  }
} catch (e) {
  console.error("Firebase initialization failed:", e);
}


/* THEME (Standardized for visual consistency) */
const COLORS = {
  backgroundBase: "#FAFAFA", // Light cream/off-white background
  card: "#FFFFFF", // Card/Modal background
  textPrimary: "#4A3228", // Dark brown/primary text
  textSecondary: "#A98467", // Nude accent/secondary text
  accentBlush: "#D8A39D",   // Blush accent (The "nude pink" primary color)
  accentDark: "#7E6B5A", // Darker nude accent for strong accents/icons
  nudeShadow: "rgba(126, 107, 90, 0.4)", // Unified shadow color
  delete: "#9A3B3B", // Standard delete/error color
};


// --- Custom Modal for Confirmation/Notification (Reusable component) ---
const ConfirmationModal = ({ isVisible, message, onConfirm, onCancel, type }) => (
  <Modal
    visible={isVisible}
    transparent={true}
    animationType="fade"
  >
    <View style={modalStyles.modalOverlay}>
      <View style={modalStyles.modalContainer}>
        <Ionicons 
          name={type === 'confirm' ? "log-out-outline" : (type === 'error' ? "close-circle-outline" : "checkmark-circle-outline")} 
          size={48} 
          color={type === 'confirm' ? COLORS.accentDark : (type === 'error' ? COLORS.delete : COLORS.accentDark)} 
          style={modalStyles.modalIcon}
        />
        <Text style={modalStyles.modalTitleText}>
          {type === 'confirm' ? "Confirm Log Out" : (type === 'error' ? "Error" : "Success")}
        </Text>
        <Text style={modalStyles.modalBodyText}>
          {message}
        </Text>

        <View style={modalStyles.buttonRow}>
          {type === 'confirm' && (
            <TouchableOpacity
              style={modalStyles.cancelButton}
              onPress={onCancel}
            >
              <Text style={modalStyles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={type === 'error' ? modalStyles.errorConfirmButton : modalStyles.confirmButton}
            onPress={onConfirm}
          >
            <Text style={modalStyles.confirmButtonText}>{type === 'confirm' ? "Log Out" : "OK"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
);

function CustomDrawerContent(props) {
  const { profile } = useApp(); // Assuming useApp() provides the profile object
  const [loading, setLoading] = useState(false);
  const [isConfirmModalVisible, setIsConfirmModalVisible] = useState(false);
  const [notificationState, setNotificationState] = useState({
    isVisible: false,
    message: '',
    type: 'success', // 'success' or 'error'
  });

  // 🔹 Initial Auth Check for Canvas Environment
  useEffect(() => {
    const performInitialAuth = async () => {
      if (auth) {
        try {
          if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
          } else {
             await signInAnonymously(auth);
          }
        } catch (error) {
          console.error("Initial Auth/Token Sign-In Failed:", error);
        }
      }
    };
    performInitialAuth();
  }, []);

  // 🔑 Functional and Themed Log Out Handler
  const handleLogout = async () => {
    setIsConfirmModalVisible(false); // Close confirmation modal immediately
    setLoading(true);
    try {
      await signOut(auth);
      setNotificationState({
        isVisible: true,
        message: "You have been successfully signed out.",
        type: 'success',
      });
    } catch (error) {
      console.error("Logout error:", error);
      setNotificationState({
        isVisible: true,
        message: `Failed to log out: ${error.message}. Please try again.`,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DrawerContentScrollView {...props} contentContainerStyle={{ flex: 1 }}>
      {/* 🔹 Profile Header (Themed) */}
      <View style={styles.profileContainer}>
        <TouchableOpacity
          onPress={() => props.navigation.navigate("Profile")}
          style={{ alignItems: "center" }}
        >
          {profile?.profilePic ? (
            <Image source={{ uri: profile.profilePic }} style={styles.avatar} />
          ) : (
            <Ionicons name="person-circle-outline" size={80} color={COLORS.accentDark} />
          )}
          <Text style={styles.username}>
            {profile?.username || "Momentum User"}
          </Text>
          {profile?.bio ? (
            <Text style={styles.bio} numberOfLines={2}>
              {profile.bio}
            </Text>
          ) : null}
        </TouchableOpacity>
      </View>

      {/* 🔹 Drawer Items */}
      <View style={{ flex: 1 }}>
        <DrawerItemList {...props} />
      </View>

      {/* 🔹 Logout Button (Themed and Functional) */}
      <TouchableOpacity 
        style={styles.logoutButton} 
        onPress={() => setIsConfirmModalVisible(true)}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={COLORS.textPrimary} />
        ) : (
          <>
            <Ionicons name="log-out-outline" size={22} color={COLORS.textPrimary} />
            <Text style={styles.logoutText}>Logout</Text>
          </>
        )}
      </TouchableOpacity>

      {/* 🔹 Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Momentum ✨</Text>
      </View>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isVisible={isConfirmModalVisible}
        message="Are you sure you want to sign out of your account?"
        onConfirm={handleLogout}
        onCancel={() => setIsConfirmModalVisible(false)}
        type="confirm"
      />

      {/* Notification Modal (Error/Success) */}
      <ConfirmationModal
        isVisible={notificationState.isVisible}
        message={notificationState.message}
        onConfirm={() => setNotificationState({ ...notificationState, isVisible: false })}
        type={notificationState.type}
        // No cancel for notification
        onCancel={() => setNotificationState({ ...notificationState, isVisible: false })} 
      />
    </DrawerContentScrollView>
  );
}

export default function DrawerNavigator() {
  return (
    <Drawer.Navigator
      screenOptions={({ navigation }) => ({
        // Themed Header Styles
        headerStyle: { backgroundColor: COLORS.backgroundBase, elevation: 0, shadowOpacity: 0 },
        headerTintColor: COLORS.textPrimary,
        headerTitleStyle: { fontWeight: "700" },
        headerLeft: () => (
          <TouchableOpacity
            onPress={() => navigation.toggleDrawer()}
            style={{ marginLeft: 15 }}
          >
            <Ionicons name="menu" size={28} color={COLORS.textPrimary} />
          </TouchableOpacity>
        ),
        // Themed Drawer Item Styles
        drawerActiveTintColor: COLORS.accentDark, // Dark nude for active item
        drawerInactiveTintColor: COLORS.textSecondary, // Light nude for inactive item
        drawerLabelStyle: { fontSize: 15, fontWeight: '600' },
        drawerStyle: { backgroundColor: COLORS.card },
      })}
      drawerContent={(props) => <CustomDrawerContent {...props} />}
    >
      <Drawer.Screen
        name="Home"
        component={HomeScreen}
        options={{
          drawerIcon: ({ color, size }) => (
            <Ionicons name="home-outline" color={color} size={size} />
          ),
        }}
      />
      <Drawer.Screen
        name="Planner"
        component={PlannerScreen}
        options={{
          drawerIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" color={color} size={size} />
          ),
        }}
      />
      <Drawer.Screen
        name="Goals"
        component={GoalsScreen}
        options={{
          drawerIcon: ({ color, size }) => (
            <Ionicons name="flag-outline" color={color} size={size} />
          ),
        }}
      />
      <Drawer.Screen
        name="Shared Goals"
        component={SharedGoalsScreen}
        options={{
          drawerIcon: ({ color, size }) => (
            <Ionicons name="people-outline" color={color} size={size} />
          ),
        }}
      />
      <Drawer.Screen
        name="Habits"
        component={HabitsScreen}
        options={{
          drawerIcon: ({ color, size }) => (
            <Ionicons name="repeat-outline" color={color} size={size} />
          ),
        }}
      />
      <Drawer.Screen
        name="Notes"
        component={NotesScreen}
        options={{
          drawerIcon: ({ color, size }) => (
            <Ionicons name="document-text-outline" color={color} size={size} />
          ),
        }}
      />
      <Drawer.Screen
        name="Journal"
        component={JournalScreen}
        options={{
          drawerIcon: ({ color, size }) => (
            <Ionicons name="book-outline" color={color} size={size} />
          ),
        }}
      />
      <Drawer.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          drawerIcon: ({ color, size }) => (
            <Ionicons name="person-outline" color={color} size={size} />
          ),
        }}
      />
    </Drawer.Navigator>
  );
}

const styles = StyleSheet.create({
  // --- Profile Header Styles (Themed) ---
  profileContainer: {
    paddingVertical: 30,
    alignItems: "center",
    backgroundColor: COLORS.backgroundBase, // Use light theme color
    marginBottom: 10,
    borderBottomWidth: 1,
    borderColor: "#e0e0e0",
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3, // Thicker border for accent
    borderColor: COLORS.accentDark, // Use dark accent color
  },
  username: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 10,
    color: COLORS.textPrimary, // Use dark primary text
  },
  bio: {
    fontSize: 13,
    color: COLORS.textSecondary, // Use secondary text color
    marginTop: 4,
    textAlign: "center",
    paddingHorizontal: 10,
  },
  
  // --- Logout Button Styles (Themed) ---
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: 'center',
    padding: 15,
    marginHorizontal: 20,
    marginBottom: 10,
    backgroundColor: COLORS.accentBlush, // Nude Pink Primary Accent
    borderRadius: 14,
    
    // Deep shadow for the main action button
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 3,

  },
  logoutText: {
    marginLeft: 10,
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.textPrimary, // Dark text on light pink
  },
  
  // --- Footer ---
  footer: {
    padding: 15,
    alignItems: "center",
    borderTopWidth: 1,
    borderColor: "#eee",
  },
  footerText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
});

const modalStyles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalContainer: {
    width: '85%',
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 25,
    alignItems: 'center',
    elevation: 4,
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 8 }, 
    shadowOpacity: 0.6,
    shadowRadius: 12, 
  },
  modalIcon: {
    marginBottom: 15,
  },
  modalTitleText: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 10,
  },
  modalBodyText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 25,
    color: COLORS.textPrimary,
    lineHeight: 24,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  confirmButton: { // Used for confirm action (Logout or OK after Success)
    flex: 1,
    backgroundColor: COLORS.accentBlush, 
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginLeft: 10,
  },
  errorConfirmButton: { // Used for OK after an Error
    flex: 1,
    backgroundColor: COLORS.delete, 
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginLeft: 10,
  },
  confirmButtonText: {
    color: COLORS.textPrimary,
    fontWeight: '700',
    fontSize: 16,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: COLORS.backgroundBase,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.textSecondary,
  },
  cancelButtonText: {
    color: COLORS.textSecondary,
    fontWeight: '700',
    fontSize: 16,
  }
});
