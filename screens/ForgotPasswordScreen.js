// ./screens/ForgotPasswordScreen.js
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "../supabaseConfig";

const COLORS = {
  background: "#FCF7F5",
  card: "#FFFFFF",
  warm: "#A98467",
  blush: "#D8A39D",
  text: "#3e2a24",
  softText: "#8b6f63",
  border: "#EFE6E2",
  accent: "#F6EDEB",
  success: "#4CAF50",
  error: "#D64545",
  warning: "#FF9800",
  info: "#2196F3",
};

export default function ForgotPasswordScreen({ navigation }) {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);

  const handleResetPassword = async () => {
    if (!email.trim()) {
      Alert.alert("Error", "Please enter your email address");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: "momentumapp://reset-password",
      });

      if (error) {
        let errorMessage = "Failed to send reset email. Please try again.";

        if (error.message?.includes("rate limit") || error.message?.includes("too many")) {
          errorMessage = "Too many attempts. Please try again later.";
        } else if (error.message?.includes("valid email")) {
          errorMessage = "Please enter a valid email address.";
        }

        Alert.alert("Error", errorMessage);
        return;
      }

      setEmailSent(true);
      Alert.alert(
        "Email Sent",
        "Check your inbox for password reset instructions",
        [{ text: "OK", onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      console.error("Password reset error:", error);
      Alert.alert("Error", "Failed to send reset email. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.container}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity 
              style={styles.backButton}
              onPress={() => navigation.goBack()}
            >
              <Ionicons name="arrow-back" size={24} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.title}>Reset Password</Text>
            <Text style={styles.subtitle}>Enter your email to receive reset instructions</Text>
          </View>

          {/* Form Card */}
          <View style={styles.card}>
            <View style={styles.iconContainer}>
              <Ionicons name="key-outline" size={48} color={COLORS.warm} />
            </View>

            <Text style={styles.description}>
              Don't worry! Just enter your email address and we'll send you a link to reset your password.
            </Text>

            {/* Email Input */}
            <Text style={styles.label}>Email Address</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="mail-outline" size={20} color={COLORS.softText} />
              <TextInput
                style={styles.input}
                placeholder="Enter your email address"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                editable={!emailSent}
              />
            </View>

            {/* Reset Button */}
            <TouchableOpacity 
              style={[
                styles.primaryButton,
                (loading || emailSent) && styles.buttonDisabled
              ]}
              onPress={handleResetPassword}
              disabled={loading || emailSent}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="mail" size={20} color="#fff" />
                  <Text style={styles.primaryButtonText}>
                    {emailSent ? "Email Sent" : "Send Reset Link"}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {emailSent && (
              <View style={styles.successMessage}>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
                <Text style={styles.successText}>
                  Reset instructions sent to {email}
                </Text>
              </View>
            )}
          </View>

          {/* Back to Login */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Remember your password?</Text>
            <TouchableOpacity onPress={() => navigation.navigate("Login")}>
              <Text style={styles.linkText}>Back to Login</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    justifyContent: "center",
  },
  header: {
    alignItems: "center",
    marginBottom: 40,
  },
  backButton: {
    position: "absolute",
    left: 0,
    top: 0,
    padding: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: COLORS.text,
    letterSpacing: -0.5,
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.softText,
    textAlign: "center",
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 3,
    alignItems: "center",
  },
  iconContainer: {
    backgroundColor: COLORS.accent,
    padding: 16,
    borderRadius: 50,
    marginBottom: 20,
  },
  description: {
    fontSize: 14,
    color: COLORS.softText,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: 8,
    alignSelf: "stretch",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    backgroundColor: COLORS.background,
    alignSelf: "stretch",
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    fontSize: 16,
    color: COLORS.text,
  },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.warm,
    padding: 16,
    borderRadius: 12,
    marginTop: 20,
    gap: 8,
    alignSelf: "stretch",
    shadowColor: COLORS.warm,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  successMessage: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.success + "10",
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
    gap: 8,
    alignSelf: "stretch",
  },
  successText: {
    color: COLORS.success,
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  footerText: {
    color: COLORS.softText,
    fontSize: 14,
  },
  linkText: {
    color: COLORS.warm,
    fontSize: 14,
    fontWeight: "600",
  },
});