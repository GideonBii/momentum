import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useApp } from "../context/AppContext";

const COLORS = {
  primary: "#5A4FCF",
  background: "#f3f5f9",
  text: "#333",
  softText: "#666",
};

export default function AuthScreen({ navigation }) {
  const { user, loading } = useApp();

  useEffect(() => {
    // Only navigate when loading is complete and app is initialized
    if (loading) return;
    
    if (user) {
      navigation.replace("Main");
    } else {
      navigation.replace("Login");
    }
  }, [user, loading, navigation]);

  // Optional: Add a timeout in case loading takes too long
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (loading) {
        console.warn("Auth check is taking too long, forcing navigation");
        // Force navigation to login if stuck
        navigation.replace("Login");
      }
    }, 10000); // 10 second timeout

    return () => clearTimeout(timeoutId);
  }, [loading, navigation]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={COLORS.primary} />
      <Text style={styles.loadingText}>Loading...</Text>
      <Text style={styles.subText}>
        {loading ? "Checking authentication..." : "Redirecting..."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    alignItems: "center", 
    justifyContent: "center", 
    backgroundColor: COLORS.background,
    padding: 20,
  },
  loadingText: {
    marginTop: 20,
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.text,
  },
  subText: {
    marginTop: 8,
    fontSize: 14,
    color: COLORS.softText,
    textAlign: "center",
  },
});