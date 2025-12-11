// components/ClayTextInput.js
import { StyleSheet, TextInput } from "react-native";

export default function ClayTextInput(props) {
  return <TextInput placeholderTextColor="#9aa3b2" style={styles.input} {...props} />;
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: "#eef1f7",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 5 },
    shadowRadius: 10,
    elevation: 3,
    color: "#2a2e38",
  },
});
