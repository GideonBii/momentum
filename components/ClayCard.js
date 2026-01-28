// components/ClayCard.js
import { StyleSheet, View } from "react-native";

export default function ClayCard({ style, children }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#f3f5f9",
    borderRadius: 20,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 16,
    elevation: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.6)",
  },
});
