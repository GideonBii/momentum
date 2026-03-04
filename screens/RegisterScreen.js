// ./screens/RegisterScreen.js
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useApp } from "../context/AppContext";
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
  lightWarm: "rgba(169, 132, 103, 0.1)",
};

export default function RegisterScreen({ navigation }) {
  const { setUser, setProfileUpdates } = useApp();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    displayName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  // Terms & Privacy State
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  const handleRegister = async () => {
    const { displayName, email, password, confirmPassword } = formData;

    if (!displayName.trim() || !email.trim() || !password || !confirmPassword) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match");
      return;
    }

    if (password.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters");
      return;
    }

    // Check if terms and privacy are accepted
    if (!acceptedTerms || !acceptedPrivacy) {
      Alert.alert("Required", "You must accept both Terms of Service and Privacy Policy to continue");
      return;
    }

    setLoading(true);
    try {
      // Sign up with Supabase Auth
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.toLowerCase(),
        password,
        options: {
          data: {
            username: displayName.trim(),
            display_name: displayName.trim(),
          },
        },
      });

      if (signUpError) {
        let errorMessage = "Registration failed. Please try again.";

        if (signUpError.message?.includes("already registered") || signUpError.message?.includes("already been registered")) {
          errorMessage = "This email is already registered.";
        } else if (signUpError.message?.includes("valid email")) {
          errorMessage = "Please enter a valid email address.";
        } else if (signUpError.message?.includes("Password should")) {
          errorMessage = "Password must be at least 6 characters.";
        }

        Alert.alert("Error", errorMessage);
        return;
      }

      // Update the profile row (created by DB trigger) with username + terms acceptance
      if (data.user) {
        await supabase.from("profiles").upsert({
          id: data.user.id,
          username: displayName.trim(),
          accepted_terms: true,
          accepted_privacy: true,
          terms_accepted_date: new Date().toISOString(),
          privacy_accepted_date: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        console.log("✅ Profile updated for:", data.user.email);
        // Push username into AppContext immediately so HomeScreen/Drawer
        // show the real name without waiting for the realtime event
        setProfileUpdates?.({ username: displayName.trim() });
      }

      Alert.alert("Success", "Account created successfully!");
    } catch (error) {
      console.error("Registration error:", error);
      Alert.alert("Error", "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const updateFormData = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Terms & Privacy Content
  const renderTermsModal = () => (
    <Modal
      animationType="slide"
      transparent={false}
      visible={showTermsModal}
      onRequestClose={() => setShowTermsModal(false)}
    >
      <SafeAreaView style={styles.modalSafeArea}>
        <View style={styles.modalHeader}>
          <TouchableOpacity 
            style={styles.modalBackButton}
            onPress={() => setShowTermsModal(false)}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Terms of Service</Text>
          <View style={{ width: 40 }} />
        </View>
        
        <ScrollView style={styles.modalContent}>
          <Text style={styles.modalSectionTitle}>Last Updated: December 16, 2025</Text>
          
          <Text style={styles.modalParagraph}>
            Welcome to Momentum! These Terms of Service ("Terms") govern your use of the Momentum 
            productivity application ("App"). By creating an account, you agree to be bound by these Terms.
          </Text>
          
          <Text style={styles.modalSectionTitle}>1. Acceptance of Terms</Text>
          <Text style={styles.modalParagraph}>
            By creating an account, you confirm that you are at least 13 years old and agree to these Terms. 
            If you are using the App on behalf of an organization, you represent that you have the authority 
            to bind that organization.
          </Text>
          
          <Text style={styles.modalSectionTitle}>2. Account Responsibility</Text>
          <Text style={styles.modalParagraph}>
            You are responsible for maintaining the confidentiality of your account credentials and for 
            all activities that occur under your account. You must notify us immediately of any unauthorized 
            use of your account.
          </Text>
          
          <Text style={styles.modalSectionTitle}>3. User Content</Text>
          <Text style={styles.modalParagraph}>
            You retain ownership of any content you create within the App. By using the App, you grant us 
            a license to host, store, and process your content solely for providing the App's services to you.
          </Text>
          
          <Text style={styles.modalSectionTitle}>4. Acceptable Use</Text>
          <Text style={styles.modalParagraph}>
            You agree not to use the App to:{"\n"}• Violate any applicable laws{"\n"}• Infringe on intellectual property rights{"\n"}• Upload malicious code or viruses{"\n"}• Harass, abuse, or harm other users{"\n"}• Use the App for any illegal purpose
          </Text>
          
          <Text style={styles.modalSectionTitle}>5. Termination</Text>
          <Text style={styles.modalParagraph}>
            We may suspend or terminate your access to the App at any time, with or without cause, 
            with or without notice.
          </Text>
          
          <Text style={styles.modalSectionTitle}>6. Disclaimer</Text>
          <Text style={styles.modalParagraph}>
            THE APP IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. WE DO NOT WARRANT THAT THE 
            APP WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE.
          </Text>
          
          <Text style={styles.modalSectionTitle}>7. Changes to Terms</Text>
          <Text style={styles.modalParagraph}>
            We may modify these Terms at any time. We will provide notice of significant changes. 
            Your continued use of the App after changes constitutes acceptance of the new Terms.
          </Text>
          
          <Text style={styles.modalParagraph}>
  For privacy-related questions or requests:
  <Text style={styles.link}> privacy@momentumapp.com</Text>
</Text>

          
          <TouchableOpacity 
            style={styles.acceptButton}
            onPress={() => {
              setAcceptedTerms(true);
              setShowTermsModal(false);
            }}
          >
            <Text style={styles.acceptButtonText}>I Accept These Terms</Text>
          </TouchableOpacity>
          
          <View style={styles.modalSpacer} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );

  const renderPrivacyModal = () => (
    <Modal
      animationType="slide"
      transparent={false}
      visible={showPrivacyModal}
      onRequestClose={() => setShowPrivacyModal(false)}
    >
      <SafeAreaView style={styles.modalSafeArea}>
        <View style={styles.modalHeader}>
          <TouchableOpacity 
            style={styles.modalBackButton}
            onPress={() => setShowPrivacyModal(false)}
          >
            <Ionicons name="arrow-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Privacy Policy</Text>
          <View style={{ width: 40 }} />
        </View>
        
        <ScrollView style={styles.modalContent}>
          <Text style={styles.modalSectionTitle}>Effective Date: December 16, 2025</Text>
          
          <Text style={styles.modalParagraph}>
            Momentum Technologies respects your privacy. This Privacy Policy explains how we collect, 
            use, disclose, and safeguard your information when you use the Momentum productivity application.
          </Text>
          
          <Text style={styles.modalSectionTitle}>1. Information We Collect</Text>
          <Text style={styles.modalParagraph}>
            {"\n"}• Account Information: Email address, username, password{"\n"}• Profile Information: Name{"\n"}• Usage Data: Features used, settings preferences{"\n"}• User Content: Tasks, projects, goals you create
          </Text>
          
          <Text style={styles.modalSectionTitle}>2. How We Use Your Information</Text>
          <Text style={styles.modalParagraph}>
            We use your information to:{"\n"}• Provide and maintain the App's functionality{"\n"}• Personalize your experience{"\n"}• Send notifications and reminders{"\n"}• Improve and optimize the App{"\n"}• Ensure security and prevent fraud
          </Text>
          
          <Text style={styles.modalSectionTitle}>3. Data Security</Text>
          <Text style={styles.modalParagraph}>
            {"\n"}• Your data is stored securely using Firebase services{"\n"}• We implement industry-standard security measures{"\n"}• Data is encrypted in transit using SSL/TLS
          </Text>
          
          <Text style={styles.modalSectionTitle}>4. Your Rights</Text>
          <Text style={styles.modalParagraph}>
            You have the right to:{"\n"}• Access your personal data{"\n"}• Correct inaccurate data{"\n"}• Delete your account and data{"\n"}• Export your data (upon request){"\n"}• Opt out of non-essential communications
          </Text>
          
          <Text style={styles.modalSectionTitle}>5. Children's Privacy</Text>
          <Text style={styles.modalParagraph}>
            The App is not intended for children under 13. We do not knowingly collect personal 
            information from children under 13.
          </Text>
          
          <Text style={styles.modalSectionTitle}>6. Changes to This Policy</Text>
          <Text style={styles.modalParagraph}>
            We may update this Privacy Policy periodically. We will notify you of significant 
            changes through the App or via email.
          </Text>
          
          <Text style={styles.modalSectionTitle}>7. Contact Us</Text>
          <Text style={styles.modalParagraph}>
  For questions about these Terms, please contact us at:
  <Text style={styles.link}> legal@momentumapp.com</Text>
</Text>

          
          <TouchableOpacity 
            style={styles.acceptButton}
            onPress={() => {
              setAcceptedPrivacy(true);
              setShowPrivacyModal(false);
            }}
          >
            <Text style={styles.acceptButtonText}>I Accept This Privacy Policy</Text>
          </TouchableOpacity>
          
          <View style={styles.modalSpacer} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );

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
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Join us and start achieving your goals!</Text>
          </View>

          {/* Form Card */}
          <View style={styles.card}>
            {/* Display Name */}
            <Text style={styles.label}>Full Name</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="person-outline" size={20} color={COLORS.softText} />
              <TextInput
                style={styles.input}
                placeholder="Enter your full name"
                value={formData.displayName}
                onChangeText={(text) => updateFormData("displayName", text)}
                autoCapitalize="words"
              />
            </View>

            {/* Email */}
            <Text style={styles.label}>Email Address</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="mail-outline" size={20} color={COLORS.softText} />
              <TextInput
                style={styles.input}
                placeholder="Enter your email"
                value={formData.email}
                onChangeText={(text) => updateFormData("email", text)}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            </View>

            {/* Password */}
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed-outline" size={20} color={COLORS.softText} />
              <TextInput
                style={styles.input}
                placeholder="Create a password"
                value={formData.password}
                onChangeText={(text) => updateFormData("password", text)}
                secureTextEntry={!showPassword}
                autoComplete="new-password"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Ionicons 
                  name={showPassword ? "eye-off-outline" : "eye-outline"} 
                  size={20} 
                  color={COLORS.softText} 
                />
              </TouchableOpacity>
            </View>

            {/* Confirm Password */}
            <Text style={styles.label}>Confirm Password</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed-outline" size={20} color={COLORS.softText} />
              <TextInput
                style={styles.input}
                placeholder="Confirm your password"
                value={formData.confirmPassword}
                onChangeText={(text) => updateFormData("confirmPassword", text)}
                secureTextEntry={!showConfirmPassword}
                autoComplete="new-password"
              />
              <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                <Ionicons 
                  name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} 
                  size={20} 
                  color={COLORS.softText} 
                />
              </TouchableOpacity>
            </View>

            {/* Terms & Privacy Acceptance */}
            <Text style={styles.agreementTitle}>Required Agreements</Text>
            
            {/* Terms of Service */}
            <TouchableOpacity 
              style={styles.agreementItem}
              onPress={() => setShowTermsModal(true)}
            >
              <View style={styles.checkboxContainer}>
                <TouchableOpacity 
                  style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}
                  onPress={() => setAcceptedTerms(!acceptedTerms)}
                >
                  {acceptedTerms && <Ionicons name="checkmark" size={16} color="#fff" />}
                </TouchableOpacity>
                <Text style={styles.agreementText}>
                  I accept the <Text style={styles.link}>Terms of Service</Text>
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.softText} />
            </TouchableOpacity>

            {/* Privacy Policy */}
            <TouchableOpacity 
              style={styles.agreementItem}
              onPress={() => setShowPrivacyModal(true)}
            >
              <View style={styles.checkboxContainer}>
                <TouchableOpacity 
                  style={[styles.checkbox, acceptedPrivacy && styles.checkboxChecked]}
                  onPress={() => setAcceptedPrivacy(!acceptedPrivacy)}
                >
                  {acceptedPrivacy && <Ionicons name="checkmark" size={16} color="#fff" />}
                </TouchableOpacity>
                <Text style={styles.agreementText}>
                  I accept the <Text style={styles.link}>Privacy Policy</Text>
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.softText} />
            </TouchableOpacity>

            {/* Register Button */}
            <TouchableOpacity 
              style={[
                styles.primaryButton,
                (loading || !acceptedTerms || !acceptedPrivacy) && styles.buttonDisabled
              ]}
              onPress={handleRegister}
              disabled={loading || !acceptedTerms || !acceptedPrivacy}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="person-add" size={20} color="#fff" />
                  <Text style={styles.primaryButtonText}>Create Account</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Agreement Status Message */}
            {(!acceptedTerms || !acceptedPrivacy) && (
              <Text style={styles.agreementHint}>
                You must accept both agreements to create an account
              </Text>
            )}
          </View>

          {/* Login Redirect */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account?</Text>
            <TouchableOpacity onPress={() => navigation.navigate("Login")}>
              <Text style={styles.linkText}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Terms of Service Modal */}
      {renderTermsModal()}

      {/* Privacy Policy Modal */}
      {renderPrivacyModal()}
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
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: COLORS.text,
    letterSpacing: -0.5,
    marginBottom: 8,
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
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: 8,
    marginTop: 16,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    backgroundColor: COLORS.background,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    fontSize: 16,
    color: COLORS.text,
  },
  // Agreement Styles
  agreementTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.text,
    marginTop: 24,
    marginBottom: 12,
  },
  agreementItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  checkboxContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.softText,
    marginRight: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    backgroundColor: COLORS.warm,
    borderColor: COLORS.warm,
  },
  agreementText: {
    fontSize: 14,
    color: COLORS.text,
    flex: 1,
  },
  link: {
    color: COLORS.warm,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  agreementHint: {
    fontSize: 13,
    color: COLORS.error,
    textAlign: "center",
    marginTop: 12,
    fontStyle: "italic",
  },
  // Button Styles
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.warm,
    padding: 16,
    borderRadius: 12,
    marginTop: 24,
    gap: 8,
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
  // Modal Styles
  modalSafeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  modalBackButton: {
    padding: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    flex: 1,
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  modalSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 24,
    marginBottom: 12,
  },
  modalParagraph: {
    fontSize: 15,
    color: COLORS.text,
    lineHeight: 22,
    marginBottom: 16,
    opacity: 0.9,
  },
  acceptButton: {
    backgroundColor: COLORS.warm,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 30,
    marginBottom: 20,
    shadowColor: COLORS.warm,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  acceptButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalSpacer: {
    height: 60,
  },
  // Footer
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