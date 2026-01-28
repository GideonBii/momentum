import React from "react";
import { TextInput, StyleSheet } from "react-native";

export default function ClayInput({ value, onChangeText, placeholder, style }) {
  return (
    <TextInput
      style={[styles.input, style]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#999"
    />
  );
}

const styles = StyleSheet.create({
  input: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    fontSize: 16,
    color: "#111",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    marginVertical: 10,
  },
});
