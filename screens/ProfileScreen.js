// screens/ProfileScreen.js
// 🎯 FINAL SYNCED VERSION - March 2, 2026
// ✅ FIXED: Username & Avatar now sync globally via AppContext
// ✅ FIXED: Robust upload logic for Supabase
// ✅ FIXED: Real-time UI updates for Drawer and Home

import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from '@react-native-community/datetimepicker';
import { BlurView } from 'expo-blur';
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { useApp } from "../context/AppContext";
import { supabase } from "../supabaseConfig";

const { width } = Dimensions.get('window');

const COLORS = {
  backgroundBase: "#FAFAFA",
  card: "#FFFFFF",
  textPrimary: "#4A3228",
  textSecondary: "#A98467",
  accentBlush: "#D8A39D",
  accentWarm: "#E3B777",
  sage: "#5D8B7E",
  surfaceVariant: "#F8F2F0",
  cardBorder: "rgba(216,163,157,0.2)",
  success: "#5D8B7E",
};

export default function ProfileScreen() {
  const { user, setProfileUpdates } = useApp();
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [loading, setLoading] = useState(true);

  // Form States
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [photoURL, setPhotoURL] = useState(null);
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [country, setCountry] = useState("");

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showGenderModal, setShowGenderModal] = useState(false);

  useEffect(() => {
    if (user) fetchProfile();
  }, [user]);

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (data) {
        setUsername(data.username || "");
        setBio(data.bio || "");
        setPhotoURL(data.profile_pic || null);
        setDob(data.dob || "");
        setGender(data.gender || "");
        setCountry(data.country || "");
      }
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
    });

    if (!result.canceled && result.assets[0]) {
      uploadImage(result.assets[0].uri);
    }
  };

  const uploadImage = async (uri) => {
    setUploadingPhoto(true);
    try {
      const fileName = `avatar_${Date.now()}.jpg`;
      const filePath = `${user.id}/${fileName}`;
      
      const formData = new FormData();
      formData.append('file', {
        uri: Platform.OS === 'ios' ? uri.replace('file://', '') : uri,
        name: fileName,
        type: 'image/jpeg',
      });

      const { data, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, formData, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const finalUrl = `${publicUrl}?t=${Date.now()}`;

      // Update Database
      const { error: dbError } = await supabase
        .from('profiles')
        .update({ profile_pic: finalUrl })
        .eq('id', user.id);

      if (dbError) throw dbError;

      // 🔄 SYNC GLOBALLY (Avatar)
      setPhotoURL(finalUrl);
      setProfileUpdates?.({ profile_pic: finalUrl });
      
      Alert.alert("Success", "Profile picture updated!");
    } catch (error) {
      Alert.alert("Upload Failed", error.message);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    try {
      const updates = {
        username,
        bio,
        dob,
        gender,
        country,
        updated_at: new Date(),
      };

      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id);

      if (error) throw error;

      // 🔄 SYNC GLOBALLY (Username & Details)
      // This tells AppContext to update the user object used by Drawer/Home
      if (setProfileUpdates) {
        setProfileUpdates({
          ...updates,
          displayName: username, // Update display name
          profile_pic: photoURL  // Ensure photo persists in context
        });
      }

      setIsEditing(false);
      Alert.alert("Success", "Profile synced across your account!");
    } catch (error) {
      Alert.alert("Save Error", error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.accentBlush} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      {/* Header Section */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Profile</Text>
          <Text style={styles.headerSubtitle}>{isEditing ? "Editing Mode" : "Personal Info"}</Text>
        </View>
        <TouchableOpacity 
          style={styles.saveBtn} 
          onPress={isEditing ? handleSaveProfile : () => setIsEditing(true)}
          disabled={saving}
        >
          <LinearGradient
            colors={isEditing ? [COLORS.success, COLORS.sage] : [COLORS.card, COLORS.card]}
            style={styles.btnGradient}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={[styles.btnText, isEditing && { color: '#fff' }]}>
                {isEditing ? "Save" : "Edit"}
              </Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <Animated.ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Avatar Section */}
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={handlePickImage} disabled={!isEditing || uploadingPhoto}>
            <View style={styles.avatarWrapper}>
              {uploadingPhoto ? (
                <ActivityIndicator size="large" color={COLORS.accentBlush} />
              ) : (
                <Image source={{ uri: photoURL || 'https://via.placeholder.com/150' }} style={styles.avatarImage} />
              )}
              {isEditing && (
                <View style={styles.cameraIcon}>
                  <Ionicons name="camera" size={18} color="#fff" />
                </View>
              )}
            </View>
          </TouchableOpacity>
          <Text style={styles.userNameDisplay}>{username || "Set Username"}</Text>
          <Text style={styles.userEmailDisplay}>{user?.email}</Text>
        </View>

        {/* Form Section */}
        <BlurView intensity={80} style={styles.formCard}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>USERNAME</Text>
            <TextInput
              style={[styles.textInput, !isEditing && styles.disabledInput]}
              value={username}
              onChangeText={setUsername}
              editable={isEditing}
              placeholder="Your display name"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>BIO</Text>
            <TextInput
              style={[styles.textInput, styles.bioInput, !isEditing && styles.disabledInput]}
              value={bio}
              onChangeText={setBio}
              editable={isEditing}
              multiline
              placeholder="Tell us about yourself..."
            />
          </View>

          <TouchableOpacity 
            style={styles.inputGroup} 
            onPress={() => isEditing && setShowDatePicker(true)}
          >
            <Text style={styles.inputLabel}>BIRTH DATE</Text>
            <View style={[styles.textInput, !isEditing && styles.disabledInput, styles.pickerTrigger]}>
              <Text style={{ color: dob ? COLORS.textPrimary : COLORS.textSecondary }}>
                {dob || "Select Date"}
              </Text>
              <Ionicons name="calendar-outline" size={20} color={COLORS.accentBlush} />
            </View>
          </TouchableOpacity>
        </BlurView>

        {isEditing && (
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsEditing(false)}>
            <Text style={styles.cancelText}>Discard Changes</Text>
          </TouchableOpacity>
        )}
      </Animated.ScrollView>

      {showDatePicker && (
        <DateTimePicker
          value={dob ? new Date(dob) : new Date()}
          mode="date"
          display="spinner"
          onChange={(e, d) => {
            setShowDatePicker(false);
            if (d) setDob(d.toISOString().split('T')[0]);
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.backgroundBase },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    padding: 20, 
    paddingTop: 40,
    backgroundColor: '#fff'
  },
  headerTitle: { fontSize: 28, fontWeight: '800', color: COLORS.textPrimary },
  headerSubtitle: { fontSize: 14, color: COLORS.textSecondary },
  saveBtn: { borderRadius: 20, overflow: 'hidden', elevation: 2 },
  btnGradient: { paddingHorizontal: 20, paddingVertical: 10 },
  btnText: { fontWeight: '700', color: COLORS.textSecondary },
  scrollContent: { padding: 20 },
  avatarSection: { alignItems: 'center', marginBottom: 30 },
  avatarWrapper: { 
    width: 110, 
    height: 110, 
    borderRadius: 55, 
    backgroundColor: COLORS.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#fff',
    elevation: 4
  },
  avatarImage: { width: 110, height: 110, borderRadius: 55 },
  cameraIcon: { 
    position: 'absolute', 
    bottom: 0, 
    right: 0, 
    backgroundColor: COLORS.accentBlush, 
    padding: 8, 
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#fff'
  },
  userNameDisplay: { fontSize: 22, fontWeight: '700', color: COLORS.textPrimary, marginTop: 15 },
  userEmailDisplay: { fontSize: 14, color: COLORS.textSecondary },
  formCard: { 
    backgroundColor: 'rgba(255,255,255,0.7)', 
    borderRadius: 24, 
    padding: 20, 
    borderWidth: 1, 
    borderColor: COLORS.cardBorder,
    overflow: 'hidden'
  },
  inputGroup: { marginBottom: 20 },
  inputLabel: { fontSize: 11, fontWeight: '800', color: COLORS.textSecondary, marginBottom: 8, marginLeft: 4 },
  textInput: { 
    backgroundColor: '#fff', 
    borderRadius: 12, 
    padding: 15, 
    fontSize: 16, 
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.cardBorder
  },
  bioInput: { minHeight: 100, textAlignVertical: 'top' },
  disabledInput: { backgroundColor: 'transparent', borderColor: 'transparent', paddingLeft: 4 },
  pickerTrigger: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cancelBtn: { marginTop: 20, padding: 15, alignItems: 'center' },
  cancelText: { color: COLORS.accentBlush, fontWeight: '600' }
});