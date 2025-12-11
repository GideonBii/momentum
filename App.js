// App.js - FIXED VERSION WITH AUTH PROVIDER
import { Ionicons } from "@expo/vector-icons";
import {
  createDrawerNavigator,
  DrawerContentScrollView,
  DrawerItem,
} from "@react-navigation/drawer";
import {
  DrawerActions,
  NavigationContainer,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// ✅ Import BOTH providers
import { AppProvider } from "./context/AppContext";
import { AuthProvider } from "./context/AuthContext"; // ADD THIS LINE

// Import Splash Screen
import SplashScreen from "./screens/SplashScreen";

// Keep Tab navigator for routing
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import GoalsScreen from "./screens/GoalsScreen";
import HomeScreen from "./screens/HomeScreen";
import JournalScreen from "./screens/JournalScreen";
import NotesScreen from "./screens/NotesScreen";
import PlannerScreen from "./screens/PlannerScreen";
import ProfileScreen from "./screens/ProfileScreen";
import SettingsScreen from "./screens/SettingsScreen";
import SharedGoalsScreen from "./screens/SharedGoalsScreen";

import ForgotPasswordScreen from "./screens/ForgotPasswordScreen";
import LoginScreen from "./screens/LoginScreen";
import RegisterScreen from "./screens/RegisterScreen";

const RootStack = createNativeStackNavigator();
const Drawer = createDrawerNavigator();
const Tab = createBottomTabNavigator();

const COLORS = {
  backgroundBase: "#FAFAFA",
  backgroundLayer: "#FFFFFF",
  textPrimary: "#4A3228",
  textSecondary: "#A98467",
  accentBlush: "#D8A39D",
  accentSage: "#8FBC8F",
  accentWarm: "#E3B777",
  nudeShadow: "rgba(216,163,157,0.35)",
  headerTextChampagne: "#C98E9B",
};

/* ===========================
   Bottom Tabs (Custom Dock UI)
   =========================== */
function BottomTabs({ navigation }) {
  const [activeTab, setActiveTab] = useState("Home");
  const scaleRefs = {
    Home: useRef(new Animated.Value(1)).current,
    Planner: useRef(new Animated.Value(1)).current,
    Goals: useRef(new Animated.Value(1)).current,
    Notes: useRef(new Animated.Value(1)).current,
  };

  const animatePress = (key) => {
    if (scaleRefs[key]) {
      Animated.sequence([
        Animated.timing(scaleRefs[key], {
          toValue: 0.92,
          duration: 110,
          useNativeDriver: true,
        }),
        Animated.timing(scaleRefs[key], {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
    }
  };

  const goTo = (screenName) => {
    animatePress(screenName);
    setActiveTab(screenName);
    navigation.navigate("Tabs", { screen: screenName });
  };

  return (
    <View style={{ flex: 1 }}>
      <Tab.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
              style={{ marginLeft: 12 }}
            >
              <Ionicons name="menu" size={26} color={COLORS.textPrimary} />
            </TouchableOpacity>
          ),
          headerTitleAlign: "center",
          headerStyle: { backgroundColor: COLORS.backgroundBase },
          headerTitleStyle: { color: COLORS.textPrimary },
          tabBarStyle: { display: "none", height: 0 },
          tabBarShowLabel: false,
        }}
      >
        <Tab.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
        <Tab.Screen name="Planner" component={PlannerScreen} />
        <Tab.Screen name="Goals" component={GoalsScreen} />
        <Tab.Screen name="Notes" component={NotesScreen} />
        <Tab.Screen name="Journal" component={JournalScreen} options={{ tabBarButton: () => null }} />
        <Tab.Screen name="Shared Goals" component={SharedGoalsScreen} options={{ tabBarButton: () => null }} />
        <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarButton: () => null }} />
        <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarButton: () => null }} />
      </Tab.Navigator>

      {/* Custom Dock */}
      <View style={styles.customDockWrap} pointerEvents="box-none">
        <View style={styles.customDock}>
          {[
            { label: "Home", icon: "home-outline", screen: "Home" },
            { label: "Planner", icon: "calendar-outline", screen: "Planner" },
            { label: "Goals", icon: "analytics-outline", screen: "Goals" },
            { label: "Notes", icon: "document-text-outline", screen: "Notes" },
          ].map((it) => {
            const isActive = activeTab === it.screen;
            const scale = scaleRefs[it.screen];
            return (
              <Pressable
                key={it.screen}
                onPress={() => goTo(it.screen)}
                style={styles.dockItemWrap}
              >
                <Animated.View
                  style={[
                    styles.dockBubble,
                    isActive
                      ? styles.dockBubbleActive
                      : styles.dockBubbleInactive,
                    { transform: [{ scale }] },
                  ]}
                >
                  <Ionicons
                    name={isActive ? it.icon.replace("-outline", "") : it.icon}
                    size={22}
                    color={
                      isActive
                        ? COLORS.backgroundLayer
                        : COLORS.textPrimary
                    }
                  />
                </Animated.View>
                <Text
                  style={[
                    styles.dockLabel,
                    isActive && { color: COLORS.accentSage },
                  ]}
                >
                  {it.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

/* ======================
   Custom Drawer Content - FIXED
   ====================== */
function CustomDrawerContent(props) {
  // ✅ FIXED: Remove useApp hook usage here for now
  const { user = null, profile = { username: "User", profilePic: null } } = props; // Use props instead of hook

  const [isLogoutModalVisible, setIsLogoutModalVisible] = useState(false);

  const handleLogout = () => setIsLogoutModalVisible(true);

  const confirmLogout = async () => {
    setIsLogoutModalVisible(false);
    try {
      // Import auth directly for logout
      const { auth } = require("./firebaseConfig");
      const { signOut } = require("firebase/auth");
      await signOut(auth);
      console.log("👋 User logged out.");
    } catch (error) {
      console.error("Logout Error:", error);
    }
  };

  return (
    <DrawerContentScrollView
      {...props}
      contentContainerStyle={{
        flex: 1,
        backgroundColor: COLORS.backgroundBase,
      }}
    >
      <View style={styles.appHeaderContainer}>
        <Text style={styles.appNameHeader}>Momentum</Text>
      </View>

      <TouchableOpacity
        style={styles.drawerHeader}
        onPress={() =>
          props.navigation.navigate("Tabs", { screen: "Profile" })
        }
      >
        <Image
          source={{
            uri:
              profile?.profilePic ||
              user?.photoURL ||
              "https://placehold.co/100/A98467/FFFFFF?text=P",
          }}
          style={styles.drawerAvatar}
        />
        <Text style={styles.drawerName}>
          {profile?.username || "Momentum User"}
        </Text>
      </TouchableOpacity>

      <View style={{ flex: 1, paddingTop: 10 }}>
        <DrawerItem
          label="Journal"
          labelStyle={styles.drawerItem}
          icon={({ color }) => (
            <Ionicons name="book-outline" size={20} color={color} />
          )}
          onPress={() => props.navigation.navigate("Tabs", { screen: "Journal" })}
        />
        <DrawerItem
          label="Shared Goals"
          labelStyle={styles.drawerItem}
          icon={({ color }) => (
            <Ionicons name="people-outline" size={20} color={color} />
          )}
          onPress={() =>
            props.navigation.navigate("Tabs", { screen: "Shared Goals" })
          }
        />
        <DrawerItem
          label="Settings"
          labelStyle={styles.drawerItem}
          icon={({ color }) => (
            <Ionicons name="settings-outline" size={20} color={color} />
          )}
          onPress={() =>
            props.navigation.navigate("Tabs", { screen: "Settings" })
          }
        />
        <DrawerItem
          label="Logout"
          labelStyle={[styles.drawerItem, { color: COLORS.accentBlush }]}
          icon={() => (
            <Ionicons
              name="log-out-outline"
              size={20}
              color={COLORS.accentBlush}
            />
          )}
          onPress={handleLogout}
        />
      </View>

      <View style={styles.drawerFooter}>
        <Text style={styles.drawerTrademark}>
          © 2025 Momentum - All Rights Reserved
        </Text>
      </View>

      <Modal
        animationType="fade"
        transparent={true}
        visible={isLogoutModalVisible}
        onRequestClose={() => setIsLogoutModalVisible(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Ionicons
              name="log-out-outline"
              size={36}
              color={COLORS.accentBlush}
              style={{ marginBottom: 10 }}
            />
            <Text style={styles.modalTitle}>Confirm Logout</Text>
            <Text style={styles.modalText}>
              Are you sure you want to sign out? Your data remains safe.
            </Text>
            <View style={styles.modalButtonContainer}>
              <TouchableOpacity
                style={[styles.modalButton, styles.buttonCancel]}
                onPress={() => setIsLogoutModalVisible(false)}
              >
                <Text style={[styles.buttonText, { color: COLORS.textPrimary }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.buttonConfirm]}
                onPress={confirmLogout}
              >
                <Text
                  style={[styles.buttonText, { color: COLORS.backgroundLayer }]}
                >
                  Log Out
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </DrawerContentScrollView>
  );
}

/* ================
   Drawer & Root Nav - FIXED
   ================ */
function AppDrawer() {
  // ✅ FIXED: Import useApp here where it's safe
  const { useApp } = require("./context/AppContext");
  const { user, profile } = useApp();

  // CustomDrawerContentWithProps now receives data as props
  const CustomDrawerContentWithProps = (props) => (
    <CustomDrawerContent {...props} user={user} profile={profile} />
  );

  return (
    <Drawer.Navigator
      drawerContent={CustomDrawerContentWithProps}
      screenOptions={{
        headerShown: true,
        headerTitleAlign: "center",
        drawerType: "slide",
        drawerStyle: {
          width: 260,
          backgroundColor: COLORS.backgroundBase,
          borderTopRightRadius: 20,
          borderBottomRightRadius: 20,
        },
        overlayColor: "rgba(0,0,0,0.3)",
        headerStyle: { backgroundColor: COLORS.backgroundBase },
        headerTitleStyle: { color: COLORS.textPrimary },
        headerTintColor: COLORS.textPrimary,
      }}
    >
      <Drawer.Screen
        name="Tabs"
        component={BottomTabs}
        options={{ headerShown: false }}
      />
    </Drawer.Navigator>
  );
}

const AuthStack = createNativeStackNavigator();
function AuthStackScreen() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </AuthStack.Navigator>
  );
}

// ✅ RootNavigator - FIXED
function RootNavigator() {
  const { useApp } = require("./context/AppContext");
  
  const { user, loading } = useApp();

  if (loading) {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator size="large" color={COLORS.accentBlush} />
        <Text style={{ color: COLORS.textPrimary, marginTop: 10 }}>
          Loading...
        </Text>
      </View>
    );
  }
  
  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      {user ? (
        <RootStack.Screen name="AppDrawer" component={AppDrawer} />
      ) : (
        <RootStack.Screen name="Auth" component={AuthStackScreen} />
      )}
    </RootStack.Navigator>
  );
}

/* ======================
   ✅ Final App Component - FIXED WITH AUTH PROVIDER
   ====================== */
export default function App() {
  const [isLoading, setIsLoading] = useState(true);

  const handleLoadingComplete = () => {
    setIsLoading(false);
  };

  if (isLoading) {
    return <SplashScreen onLoadingComplete={handleLoadingComplete} />;
  }

  return (
    <AuthProvider> {/* ✅ WRAP WITH AUTH PROVIDER FIRST */}
      <AppProvider> {/* ✅ THEN APP PROVIDER */}
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </AppProvider>
    </AuthProvider>
  );
}

// ... your existing styles remain the same ...
const styles = StyleSheet.create({
  loadingRoot: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.backgroundBase,
  },
  appHeaderContainer: { paddingHorizontal: 15, paddingTop: 30, paddingBottom: 10 },
  appNameHeader: {
    fontSize: 26,
    fontWeight: "900",
    color: COLORS.headerTextChampagne,
    textShadowColor: COLORS.headerTextChampagne + "40",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  drawerHeader: {
    alignItems: "center",
    marginVertical: 15,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderColor: COLORS.nudeShadow,
  },
  drawerAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 10,
    borderWidth: 3,
    borderColor: COLORS.accentBlush + "40",
  },
  drawerName: { fontSize: 18, fontWeight: "700", color: COLORS.textPrimary },
  drawerItem: { fontSize: 16, fontWeight: "600", color: COLORS.textPrimary },
  drawerFooter: {
    paddingVertical: 15,
    alignItems: "center",
    borderTopWidth: 1,
    borderColor: COLORS.nudeShadow,
  },
  drawerTrademark: {
    fontSize: 11,
    color: COLORS.textSecondary,
    opacity: 0.6,
    fontWeight: "400",
  },
  customDockWrap: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 18,
    alignItems: "center",
  },
  customDock: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: COLORS.backgroundLayer,
    paddingVertical: 8,
    height: 75,
    borderRadius: 28,
    width: "100%",
    borderWidth: 0.5,
    borderColor: COLORS.accentSage + "10",
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 10,
  },
  dockItemWrap: { alignItems: "center", justifyContent: "center", flex: 1 },
  dockBubble: { width: 60, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  dockBubbleActive: {
    backgroundColor: COLORS.accentSage,
    shadowColor: COLORS.accentSage,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  dockBubbleInactive: { backgroundColor: "transparent" },
  dockLabel: { marginTop: 2, fontSize: 11, color: COLORS.textPrimary, fontWeight: "600" },
  centeredView: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  modalView: {
    margin: 20,
    backgroundColor: COLORS.backgroundLayer,
    borderRadius: 20,
    padding: 30,
    alignItems: "center",
    shadowColor: COLORS.textPrimary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
    width: "85%",
    maxWidth: 300,
    borderWidth: 1,
    borderColor: COLORS.accentBlush + "20",
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: COLORS.textPrimary, marginBottom: 8 },
  modalText: { marginBottom: 20, textAlign: "center", fontSize: 14, color: COLORS.textSecondary },
  modalButtonContainer: { flexDirection: "row", justifyContent: "space-between", width: "100%", marginTop: 10 },
  modalButton: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 15,
    flex: 1,
    marginHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonConfirm: {
    backgroundColor: COLORS.accentBlush,
    shadowColor: COLORS.accentBlush,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  buttonCancel: {
    backgroundColor: COLORS.backgroundBase,
    borderWidth: 1,
    borderColor: COLORS.textSecondary + "40",
  },
  buttonText: { fontWeight: "700", fontSize: 14 },
});