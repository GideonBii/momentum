// App.js - OPTIMIZED VERSION WITH ERROR BOUNDARIES + GLOBAL PUSH NOTIFICATIONS FIX
import React, { useCallback, useEffect, useRef, useState } from "react";
import "react-native-gesture-handler";
import "react-native-reanimated";

// ✅ Centralized notifications utilities
import {
  configureNotificationHandler,
  registerAndSaveExpoPushToken,
  requestNotificationPermissions,
  setupNotificationReceivedHandler,
  setupNotificationResponseHandler,
} from "./utils/notifications";

// Navigation Imports
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createDrawerNavigator, DrawerContentScrollView } from "@react-navigation/drawer";
import { DrawerActions, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

// UI Components
import { Ionicons } from "@expo/vector-icons";
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

// Splash Screen
import * as SplashScreen from "expo-splash-screen";

// App Context
import { AppProvider, useApp } from "./context/AppContext";

// Screens
import ForgotPasswordScreen from "./screens/ForgotPasswordScreen";
import GoalsScreen from "./screens/GoalsScreen";
import HomeScreen from "./screens/HomeScreen";
import JournalScreen from "./screens/JournalScreen";
import LoginScreen from "./screens/LoginScreen";
import NotesScreen from "./screens/NotesScreen";
import PlannerScreen from "./screens/PlannerScreen";
import ProfileScreen from "./screens/ProfileScreen";
import RegisterScreen from "./screens/RegisterScreen";
import SettingsScreen from "./screens/SettingsScreen";
import SharedGoalsScreen from "./screens/SharedGoalsScreen";
import SplashScreenComponent from "./screens/SplashScreen";

const RootStack = createNativeStackNavigator();
const Drawer = createDrawerNavigator();
const Tab = createBottomTabNavigator();
const AuthStack = createNativeStackNavigator();

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
   Error Boundary Component
   =========================== */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("App Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <Ionicons name="warning-outline" size={50} color={COLORS.accentBlush} />
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorText}>Please restart the app or contact support</Text>
          <TouchableOpacity
            style={styles.errorButton}
            onPress={() => this.setState({ hasError: false })}
          >
            <Text style={styles.errorButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

/* ===========================
   Bottom Tabs (Custom Dock UI)
   =========================== */
function BottomTabs({ navigation }) {
  const [activeTab, setActiveTab] = useState("Home");

  const tabConfigs = React.useMemo(
    () => [
      { label: "Home", icon: "home-outline", screen: "Home" },
      { label: "Planner", icon: "calendar-outline", screen: "Planner" },
      { label: "Goals", icon: "analytics-outline", screen: "Goals" },
      { label: "Notes", icon: "document-text-outline", screen: "Notes" },
    ],
    []
  );

  const scaleRefs = useRef(
    tabConfigs.reduce((acc, tab) => {
      acc[tab.screen] = new Animated.Value(1);
      return acc;
    }, {})
  ).current;

  const animatePress = useCallback(
    (key) => {
      const scaleValue = scaleRefs[key];
      if (scaleValue) {
        Animated.sequence([
          Animated.timing(scaleValue, { toValue: 0.92, duration: 110, useNativeDriver: true }),
          Animated.timing(scaleValue, { toValue: 1, duration: 220, useNativeDriver: true }),
        ]).start();
      }
    },
    [scaleRefs]
  );

  const goTo = useCallback(
    (screenName) => {
      animatePress(screenName);
      setActiveTab(screenName);
      navigation.navigate("Tabs", { screen: screenName });
    },
    [animatePress, navigation]
  );

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
        <Tab.Screen
          name="Shared Goals"
          component={SharedGoalsScreen}
          options={{ tabBarButton: () => null }}
        />
        <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarButton: () => null }} />
        <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarButton: () => null }} />
      </Tab.Navigator>

      {/* Custom Dock */}
      <View style={styles.customDockWrap} pointerEvents="box-none">
        <View style={styles.customDock}>
          {tabConfigs.map((tab) => {
            const isActive = activeTab === tab.screen;
            const scale = scaleRefs[tab.screen];
            return (
              <Pressable
                key={tab.screen}
                onPress={() => goTo(tab.screen)}
                style={styles.dockItemWrap}
                android_ripple={{ color: COLORS.nudeShadow, borderless: true }}
              >
                <Animated.View
                  style={[
                    styles.dockBubble,
                    isActive ? styles.dockBubbleActive : styles.dockBubbleInactive,
                    { transform: [{ scale }] },
                  ]}
                >
                  <Ionicons
                    name={isActive ? tab.icon.replace("-outline", "") : tab.icon}
                    size={22}
                    color={isActive ? COLORS.backgroundLayer : COLORS.textPrimary}
                  />
                </Animated.View>
                <Text style={[styles.dockLabel, isActive && { color: COLORS.accentSage }]}>
                  {tab.label}
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
   Custom Drawer Content
   ====================== */
function CustomDrawerContent(props) {
  const { user, profile } = useApp();
  const [isLogoutModalVisible, setIsLogoutModalVisible] = useState(false);

  const drawerItems = React.useMemo(
    () => [
      { label: "Journal", icon: "book-outline", screen: "Journal" },
      { label: "Shared Goals", icon: "people-outline", screen: "Shared Goals" },
      { label: "Settings", icon: "settings-outline", screen: "Settings" },
    ],
    []
  );

  const handleLogout = () => setIsLogoutModalVisible(true);

  const confirmLogout = async () => {
    setIsLogoutModalVisible(false);
    try {
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
      contentContainerStyle={{ flex: 1, backgroundColor: COLORS.backgroundBase }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.appHeaderContainer}>
        <Text style={styles.appNameHeader}>Momentum</Text>
      </View>

      <TouchableOpacity
        style={styles.drawerHeader}
        onPress={() => props.navigation.navigate("Tabs", { screen: "Profile" })}
        activeOpacity={0.7}
      >
        <Image
          source={{
            uri:
              profile?.profilePic ||
              user?.photoURL ||
              "https://placehold.co/100/A98467/FFFFFF?text=P",
          }}
          style={styles.drawerAvatar}
          defaultSource={{ uri: "https://placehold.co/100/A98467/FFFFFF?text=P" }}
        />
        <Text style={styles.drawerName} numberOfLines={1}>
          {profile?.username || user?.displayName || "Momentum User"}
        </Text>
      </TouchableOpacity>

      <View style={{ flex: 1, paddingTop: 10 }}>
        {drawerItems.map((item) => (
          <TouchableOpacity
            key={item.screen}
            style={styles.customDrawerItem}
            onPress={() => props.navigation.navigate("Tabs", { screen: item.screen })}
            activeOpacity={0.6}
          >
            <Ionicons name={item.icon} size={20} color={COLORS.textPrimary} />
            <Text style={styles.customDrawerItemLabel}>{item.label}</Text>
          </TouchableOpacity>
        ))}

        {/* Logout Button */}
        <TouchableOpacity
          style={[styles.customDrawerItem, { marginTop: 20 }]}
          onPress={handleLogout}
          activeOpacity={0.6}
        >
          <Ionicons name="log-out-outline" size={20} color={COLORS.accentBlush} />
          <Text style={[styles.customDrawerItemLabel, { color: COLORS.accentBlush }]}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.drawerFooter}>
        <Text style={styles.drawerTrademark}>© 2025 Momentum - All Rights Reserved</Text>
      </View>

      {/* Logout Confirmation Modal */}
      <Modal
        animationType="fade"
        transparent
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
                activeOpacity={0.7}
              >
                <Text style={[styles.buttonText, { color: COLORS.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.buttonConfirm]}
                onPress={confirmLogout}
                activeOpacity={0.7}
              >
                <Text style={[styles.buttonText, { color: COLORS.backgroundLayer }]}>Log Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </DrawerContentScrollView>
  );
}

/* ================
   Drawer Navigator
   ================ */
function AppDrawer() {
  return (
    <Drawer.Navigator
      drawerContent={(props) => <CustomDrawerContent {...props} />}
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
      <Drawer.Screen name="Tabs" component={BottomTabs} options={{ headerShown: false }} />
    </Drawer.Navigator>
  );
}

/* ================
   Auth Stack
   ================ */
function AuthStackScreen() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </AuthStack.Navigator>
  );
}

/* ================
   Root Navigator
   ================ */
function RootNavigator() {
  const { user, loading } = useApp();

  // ✅ Register token ONLY when logged in, and only when uid changes
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!user?.uid) return;

      try {
        // Ensure permission exists before trying to register token
        const hasPermission = await requestNotificationPermissions();
        if (!hasPermission) {
          console.warn("⚠️ Notifications permission not granted; token may not be usable.");
          return;
        }

        console.log("📱 Registering Expo push token for user:", user.uid);
        const token = await registerAndSaveExpoPushToken(user.uid);

        if (!cancelled) {
          if (token) console.log("✅ Expo push token registered:", token.substring(0, 20) + "...");
          else console.warn("⚠️ Expo push token not available (simulator or missing permission).");
        }
      } catch (e) {
        console.error("❌ Error registering push token:", e);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  if (loading) {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator size="large" color={COLORS.accentBlush} />
        <Text style={{ color: COLORS.textPrimary, marginTop: 10 }}>Loading...</Text>
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
   Main App Component
   ====================== */
export default function App() {
  const [appIsReady, setAppIsReady] = useState(false);
  const [splashHidden, setSplashHidden] = useState(false);

  // ✅ Navigation ref used by notification tap handler
  const navigationRef = useRef(null);
  const [navReady, setNavReady] = useState(false);

  // ✅ Keep only ONE set of listeners app-wide
  const notifReceivedSubRef = useRef(null);
  const notifResponseSubRef = useRef(null);

  // ✅ Configure handler once (important for foreground notifications)
  useEffect(() => {
    configureNotificationHandler();
  }, []);

  // ✅ Request permission once on app start (don’t rely on screens)
  useEffect(() => {
    (async () => {
      try {
        await requestNotificationPermissions();
      } catch (e) {
        console.warn("Notification permission request error:", e);
      }
    })();
  }, []);

  // ✅ Setup global listeners ONCE after nav is ready (prevents duplicates)
  useEffect(() => {
    if (!navReady) return;

    // Remove any previous listeners just in case
    if (notifReceivedSubRef.current) {
      notifReceivedSubRef.current.remove();
      notifReceivedSubRef.current = null;
    }
    if (notifResponseSubRef.current) {
      notifResponseSubRef.current.remove();
      notifResponseSubRef.current = null;
    }


    // Register fresh listeners
    notifReceivedSubRef.current = setupNotificationReceivedHandler();
    notifResponseSubRef.current = setupNotificationResponseHandler(navigationRef.current);

    return () => {
      if (notifReceivedSubRef.current) {
        notifReceivedSubRef.current.remove();
        notifReceivedSubRef.current = null;
      }
      if (notifResponseSubRef.current) {
        notifResponseSubRef.current.remove();
        notifResponseSubRef.current = null;
      }
    };
  }, [navReady]);

  useEffect(() => {
    async function prepare() {
      try {
        await SplashScreen.preventAutoHideAsync();
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (e) {
        console.warn("App preparation error:", e);
      } finally {
        setAppIsReady(true);
      }
    }
    prepare();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (appIsReady) {
      await SplashScreen.hideAsync();
    }
  }, [appIsReady]);

  const handleSplashComplete = useCallback(() => {
    setSplashHidden(true);
  }, []);

  if (!splashHidden) {
    return <SplashScreenComponent onLoadingComplete={handleSplashComplete} />;
  }

  return (
    <ErrorBoundary>
      <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
        <AppProvider>
          <NavigationContainer
            ref={navigationRef}
            onReady={() => setNavReady(true)}
          >
            <RootNavigator />
          </NavigationContainer>
        </AppProvider>
      </View>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  loadingRoot: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.backgroundBase,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: COLORS.backgroundBase,
    padding: 20,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: COLORS.textPrimary,
    marginTop: 15,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    textAlign: "center",
    marginBottom: 25,
  },
  errorButton: {
    backgroundColor: COLORS.accentBlush,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: COLORS.accentBlush,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  errorButtonText: {
    color: COLORS.backgroundLayer,
    fontWeight: "700",
    fontSize: 16,
  },
  appHeaderContainer: {
    paddingHorizontal: 15,
    paddingTop: 30,
    paddingBottom: 10,
  },
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
  drawerName: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.textPrimary,
    maxWidth: "90%",
  },
  customDrawerItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 15,
    marginHorizontal: 10,
    marginVertical: 4,
    borderRadius: 10,
  },
  customDrawerItemLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.textPrimary,
    marginLeft: 12,
  },
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
  dockBubble: {
    width: 60,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  dockBubbleActive: {
    backgroundColor: COLORS.accentSage,
    shadowColor: COLORS.accentSage,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  dockBubbleInactive: { backgroundColor: "transparent" },
  dockLabel: {
    marginTop: 2,
    fontSize: 11,
    color: COLORS.textPrimary,
    fontWeight: "600",
  },
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
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  modalText: {
    marginBottom: 20,
    textAlign: "center",
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  modalButtonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginTop: 10,
  },
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
