import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useApp } from "../context/AppContext";

export default function AuthScreen({ navigation }) {
  const { user, loading } = useApp();

  useEffect(() => {
    if (loading) return;
    if (user) navigation.replace("Main");
    else navigation.replace("Login");
  }, [user, loading]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#5A4FCF" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f3f5f9" },
});
