// components/ClaySwitch.js
import { StyleSheet, TouchableOpacity, View } from "react-native";

export default function ClaySwitch({ value, onValueChange }) {
  return (
    <TouchableOpacity onPress={() => onValueChange(!value)} activeOpacity={0.8}>
      <View style={[styles.wrap, value && styles.wrapOn]}>
        <View style={[styles.knob, value && styles.knobOn]} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 56,
    height: 32,
    borderRadius: 20,
    backgroundColor: "#e9edf6",
    padding: 4,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.9)",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 5 },
    shadowRadius: 10,
  },
  wrapOn: { backgroundColor: "#dfe7ff" },
  knob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#fff",
    transform: [{ translateX: 0 }],
  },
  knobOn: { transform: [{ translateX: 24 }] },
});
