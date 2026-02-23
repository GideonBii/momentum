// screens/ProfileScreen.js
// 🎯 COMPLETE REDESIGN - February 12, 2026
// ✅ FIXED: Firebase Storage upload with proper blob handling
// ✅ FIXED: Added metadata and timestamp to prevent caching
// ✅ FIXED: Detailed error logging for debugging
// ✅ Glass-morphism design with BlurView
// ✅ Animated header with scroll effect
// ✅ Smooth animations & micro-interactions
// ✅ iOS-style modals with blur
// ✅ Production-ready error handling
// ✅ Offline-first with AsyncStorage cache
// ✅ Matches all other screens perfectly

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { BlurView } from 'expo-blur';
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from 'expo-linear-gradient';
import { doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { useApp } from "../context/AppContext";
import { db, storage } from "../firebaseConfig";

const { width, height } = Dimensions.get('window');

/* ================================================================================
   🎨 COLORS - Matching all screens
   ================================================================================ */

const COLORS = {
  backgroundBase: "#FAFAFA",
  card: "#FFFFFF",
  textPrimary: "#4A3228",
  textSecondary: "#A98467",
  accentBlush: "#D8A39D",
  accentWarm: "#E3B777",
  sage: "#5D8B7E",
  nudeShadow: "rgba(216,163,157,0.12)",
  shadowDark: "rgba(0,0,0,0.06)",
  danger: "#FF6347",
  success: "#5D8B7E",
  info: "#2196F3",
  warning: "#FFA726",
  surfaceVariant: "#F8F2F0",
  textTertiary: "#B7A29E",
  cardBorder: "rgba(216,163,157,0.2)",
  gradientStart: "#FFF9F8",
  gradientEnd: "#FAF0ED",
  overlay: "rgba(74,50,40,0.4)",
  placeholder: "#C7B5B0",
};

const MAX_BIO_LENGTH = 160;
const MAX_NAME_LENGTH = 50;

const GENDER_OPTIONS = ["Male", "Female", "Non-binary", "Prefer not to say"];

const INTEREST_OPTIONS = [
  "Technology", "Art", "Music", "Sports", "Travel", 
  "Food", "Reading", "Fitness", "Photography", "Gaming",
  "Movies", "Nature", "Fashion", "Cooking", "Science",
  "Writing", "Dancing", "Yoga", "Meditation", "Business"
];

const COUNTRY_OPTIONS = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Antigua and Barbuda", "Argentina", "Armenia", 
  "Australia", "Austria", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", 
  "Belize", "Benin", "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", 
  "Burkina Faso", "Burundi", "Cabo Verde", "Cambodia", "Cameroon", "Canada", "Central African Republic", "Chad", 
  "Chile", "China", "Colombia", "Comoros", "Congo", "Costa Rica", "Croatia", "Cuba", "Cyprus", "Czech Republic", 
  "Denmark", "Djibouti", "Dominica", "Dominican Republic", "Ecuador", "Egypt", "El Salvador", "Equatorial Guinea", 
  "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Fiji", "Finland", "France", "Gabon", "Gambia", "Georgia", 
  "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau", "Guyana", "Haiti", "Honduras", 
  "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy", "Jamaica", "Japan", 
  "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Korea, North", "Korea, South", "Kosovo", "Kuwait", "Kyrgyzstan", 
  "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg", 
  "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", 
  "Mexico", "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar", 
  "Namibia", "Nauru", "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Macedonia", 
  "Norway", "Oman", "Pakistan", "Palau", "Palestine", "Panama", "Papua New Guinea", "Paraguay", "Peru", 
  "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis", 
  "Saint Lucia", "Saint Vincent and the Grenadines", "Samoa", "San Marino", "Sao Tome and Principe", 
  "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone", "Singapore", "Slovakia", "Slovenia", 
  "Solomon Islands", "Somalia", "South Africa", "South Sudan", "Spain", "Sri Lanka", "Sudan", "Suriname", 
  "Sweden", "Switzerland", "Syria", "Taiwan", "Tajikistan", "Tanzania", "Thailand", "Timor-Leste", "Togo", 
  "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Tuvalu", "Uganda", "Ukraine", 
  "United Arab Emirates", "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Vanuatu", "Vatican City", 
  "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe"
];

/* ================================================================================
   🎯 PROFILE HEADER - Animated
   ================================================================================ */

const ProfileHeader = ({ title, subtitle, isEditing, onEdit, onSave, saving }) => {
  return (
    <View style={styles.headerContent}>
      <View>
        <Text style={styles.headerTitle}>{title}</Text>
        <Text style={styles.headerSubtitle}>{subtitle}</Text>
      </View>
      
      <TouchableOpacity
        style={[
          styles.editButton,
          isEditing && styles.editButtonActive
        ]}
        onPress={isEditing ? onSave : onEdit}
        disabled={saving}
      >
        <LinearGradient
          colors={isEditing ? [COLORS.success, COLORS.sage] : [COLORS.card, COLORS.card]}
          style={styles.editButtonGradient}
        >
          {saving ? (
            <ActivityIndicator size="small" color={isEditing ? "#fff" : COLORS.textSecondary} />
          ) : (
            <>
              <Ionicons
                name={isEditing ? "checkmark-done" : "create-outline"}
                size={18}
                color={isEditing ? "#fff" : COLORS.textSecondary}
              />
              <Text style={[
                styles.editButtonText,
                isEditing && styles.editButtonTextActive
              ]}>
                {isEditing ? "Save" : "Edit"}
              </Text>
            </>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
};

/* ================================================================================
   🎯 PROFILE AVATAR - With upload functionality
   ================================================================================ */

const ProfileAvatar = ({ photoURL, isEditing, uploading, onPickImage }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  
  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      useNativeDriver: true,
      speed: 50,
    }).start();
  };
  
  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
    }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPickImage}
        disabled={!isEditing || uploading}
        activeOpacity={0.9}
      >
        <BlurView intensity={90} tint="light" style={styles.avatarContainer}>
          {uploading ? (
            <View style={styles.avatarLoading}>
              <ActivityIndicator size="large" color={COLORS.accentBlush} />
            </View>
          ) : photoURL ? (
            <Image source={{ uri: photoURL }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person" size={40} color="#fff" />
            </View>
          )}
          
          {isEditing && !uploading && (
            <LinearGradient
              colors={[COLORS.accentBlush, COLORS.accentWarm]}
              style={styles.avatarBadge}
            >
              <Ionicons name="camera" size={16} color="#fff" />
            </LinearGradient>
          )}
        </BlurView>
      </TouchableOpacity>
    </Animated.View>
  );
};

/* ================================================================================
   🎯 INFO CARD - Reusable component
   ================================================================================ */

const InfoCard = ({ label, value, icon, onPress, isEditing, showChevron = true }) => {
  return (
    <TouchableOpacity
      style={styles.infoCard}
      onPress={onPress}
      disabled={!isEditing || !onPress}
      activeOpacity={0.7}
    >
      <View style={styles.infoCardContent}>
        <View style={[styles.infoIcon, { backgroundColor: COLORS.surfaceVariant }]}>
          <Ionicons name={icon} size={20} color={COLORS.accentBlush} />
        </View>
        <View style={styles.infoTextContainer}>
          <Text style={styles.infoLabel}>{label}</Text>
          <Text style={[styles.infoValue, !value && styles.infoValueEmpty]}>
            {value || `No ${label.toLowerCase()} set`}
          </Text>
        </View>
        {isEditing && showChevron && (
          <Ionicons name="chevron-forward" size={20} color={COLORS.textTertiary} />
        )}
      </View>
    </TouchableOpacity>
  );
};

/* ================================================================================
   🎯 INTEREST CHIP - For interests grid
   ================================================================================ */

const InterestChip = ({ label, selected, onToggle }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  
  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      useNativeDriver: true,
      speed: 50,
    }).start();
  };
  
  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
    }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[
          styles.interestChip,
          selected && styles.interestChipSelected
        ]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onToggle}
        activeOpacity={0.8}
      >
        <Text style={[
          styles.interestChipText,
          selected && styles.interestChipTextSelected
        ]}>
          {label}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

/* ================================================================================
   🎯 SELECTION MODAL - Reusable modal with blur
   ================================================================================ */

const SelectionModal = ({ visible, onClose, title, children }) => {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
        
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseButton}>
              <Ionicons name="close" size={24} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>
          
          <View style={styles.modalContent}>
            {children}
          </View>
        </View>
      </View>
    </Modal>
  );
};

/* ================================================================================
   🏆 MAIN PROFILE SCREEN - Complete redesign
   ================================================================================ */

export default function ProfileScreen() {
  const { user } = useApp();

  // UI State
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [loading, setLoading] = useState(true);

  // Profile Data State
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [photoURL, setPhotoURL] = useState(null);
  
  // Personal Details State
  const [dob, setDob] = useState("");
  const [interests, setInterests] = useState([]);
  const [gender, setGender] = useState("");
  const [country, setCountry] = useState("");

  // Modal States
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showGenderModal, setShowGenderModal] = useState(false);
  const [showInterestsModal, setShowInterestsModal] = useState(false);
  const [showCountryModal, setShowCountryModal] = useState(false);

  // Animation
  const scrollY = useRef(new Animated.Value(0)).current;

  /* ================================================================================
     🔥 LOAD CACHED PROFILE
     ================================================================================ */

  useEffect(() => {
    const loadCachedProfile = async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      
      try {
        const cached = await AsyncStorage.getItem(`profile_cache_${user.uid}`);
        if (cached) {
          const data = JSON.parse(cached);
          setUsername(data.username || user.displayName || "");
          setBio(data.bio || "");
          setPhotoURL(data.profilePic || user.photoURL || null);
          setDob(data.dob || "");
          setInterests(Array.isArray(data.interests) ? data.interests : []);
          setGender(data.gender || "");
          setCountry(data.country || "");
        }
      } catch (e) {
        console.error("Failed to load profile cache", e);
      } finally {
        setLoading(false);
      }
    };
    
    loadCachedProfile();
  }, [user]);

  /* ================================================================================
     🔥 FIRESTORE LISTENER - Real-time updates
     ================================================================================ */

  useEffect(() => {
    if (!user) return;
    
    const userRef = doc(db, "users", user.uid);
    
    const unsubscribe = onSnapshot(
      userRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          
          setUsername(data.username || user.displayName || "");
          setBio(data.bio || "");
          setPhotoURL(data.profilePic || user.photoURL || null);
          setDob(data.dob || "");
          setInterests(Array.isArray(data.interests) ? data.interests : []);
          setGender(data.gender || "");
          setCountry(data.country || "");

          // Update cache
          const cacheData = {
            username: data.username || user.displayName || "",
            bio: data.bio || "",
            profilePic: data.profilePic || user.photoURL || null,
            dob: data.dob || "",
            interests: Array.isArray(data.interests) ? data.interests : [],
            gender: data.gender || "",
            country: data.country || "",
          };
          
          AsyncStorage.setItem(`profile_cache_${user.uid}`, JSON.stringify(cacheData))
            .catch(console.error);
        }
      },
      (error) => {
        console.error("Profile listener error:", error);
        Alert.alert(
          "Connection Error",
          "Unable to load your profile. Please check your internet connection."
        );
      }
    );
    
    return () => unsubscribe();
  }, [user]);

  /* ================================================================================
     📸 IMAGE PICKER & UPLOAD - ✅ FIXED with better error handling
     ================================================================================ */

  const handlePickImage = async () => {
    if (!user) {
      Alert.alert("Error", "Please sign in to change your profile picture");
      return;
    }

    if (!isEditing) return;

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Permission Required",
          "Please allow access to your photos to change your profile picture.",
          [
            { text: "Cancel", style: "cancel" },
            { 
              text: "Open Settings", 
              onPress: () => {
                if (Platform.OS === "ios") {
                  Linking.openURL("app-settings:");
                } else {
                  Linking.openSettings();
                }
              }
            }
          ]
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7, // Reduced quality for faster uploads
      });

      if (!result.canceled && result.assets[0]) {
        await uploadImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error("Image picker error:", error);
      Alert.alert("Error", "Failed to pick image. Please try again.");
    }
  };

  const uploadImage = async (uri) => {
    if (!user) return;

    setUploadingPhoto(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      console.log("🚀 Starting upload from URI:", uri);

      // Generate unique filename with timestamp
      const timestamp = Date.now();
      const filename = `profile_${timestamp}.jpg`;
      // ✅ FIX 1: Path changed from "profiles/" to "profilePictures/"
      // storage.rules only grants write access under profilePictures/{userId}/
      // Using "profiles/" matched no rule → caused storage/unknown error
      const storagePath = `profilePictures/${user.uid}/${filename}`;
      const storageRef = ref(storage, storagePath);

      console.log("📁 Storage path:", storagePath);

      // Fetch image and convert to blob
      const response = await fetch(uri);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const blob = await response.blob();
      
      console.log("📦 Blob created:", {
        size: blob.size,
        type: blob.type || 'image/jpeg',
        uri: uri.substring(0, 50) + '...'
      });

      // Validate blob size (max 5MB)
      if (blob.size > 5 * 1024 * 1024) {
        throw new Error("Image too large. Please choose an image under 5MB.");
      }

      // Upload with metadata
      // ✅ FIX 2: blob.type is often empty on Android/React Native (returns "")
      // Explicitly set contentType to image/jpeg so Firebase accepts the file
      const contentType = (blob.type && blob.type.startsWith('image/'))
        ? blob.type
        : 'image/jpeg';

      const metadata = {
        contentType,
        cacheControl: 'public, max-age=31536000',
      };

      console.log("⬆️ Uploading to Firebase Storage...");
      await uploadBytes(storageRef, blob, metadata);
      console.log("✅ Upload complete");

      // Get download URL
      const downloadURL = await getDownloadURL(storageRef);
      console.log("🔗 Download URL obtained");

      // Update Firestore
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, { 
        profilePic: downloadURL,
        updatedAt: serverTimestamp(),
      });

      console.log("✅ Firestore updated");
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Profile photo updated!");
      
    } catch (error) {
      console.error("❌ Upload error:", {
        code: error.code,
        message: error.message,
        serverResponse: error.serverResponse || 'No server response',
        name: error.name,
        stack: error.stack
      });
      
      let errorMessage = "Failed to upload image. ";
      
      if (error.code === 'storage/unauthorized') {
        errorMessage = "You don't have permission to upload images. Please check your storage rules.";
      } else if (error.code === 'storage/canceled') {
        errorMessage = "Upload was canceled.";
      } else if (error.code === 'storage/retry-limit-exceeded') {
        errorMessage = "Upload failed. Please check your internet connection and try again.";
      } else if (error.message?.includes('too large')) {
        errorMessage = error.message;
      } else {
        errorMessage += "Please try again with a smaller image or check your connection.";
      }
      
      Alert.alert("Upload Failed", errorMessage);
    } finally {
      setUploadingPhoto(false);
    }
  };

  /* ================================================================================
     📅 DATE PICKER
     ================================================================================ */

  const handleDateChange = (event, selectedDate) => {
    setShowDatePicker(false);
    if (event.type === 'set' && selectedDate) {
      const formattedDate = selectedDate.toISOString().split('T')[0];
      setDob(formattedDate);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  /* ================================================================================
     🎯 INTERESTS MANAGEMENT
     ================================================================================ */

  const toggleInterest = (interest) => {
    setInterests(prev => {
      const newInterests = prev.includes(interest)
        ? prev.filter(item => item !== interest)
        : [...prev, interest];
      
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return newInterests;
    });
  };

  /* ================================================================================
     💾 SAVE PROFILE
     ================================================================================ */

  const handleSaveProfile = async () => {
    if (!user) return;

    if (!username.trim()) {
      Alert.alert("Name Required", "Please enter your name");
      return;
    }

    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const userRef = doc(db, "users", user.uid);
      const updateData = {
        username: username.trim(),
        bio: bio.trim(),
        dob: dob,
        interests: interests,
        gender: gender,
        country: country,
        updatedAt: serverTimestamp(),
      };

      await updateDoc(userRef, updateData);

      setIsEditing(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Success", "Profile updated successfully!");
    } catch (error) {
      console.error("Save error:", error);
      Alert.alert("Error", "Could not save profile. Please check your connection.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  /* ================================================================================
     🎨 RENDER
     ================================================================================ */

  const headerHeight = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [Platform.OS === 'ios' ? 120 : 100, 80],
    extrapolate: 'clamp',
  });

  const headerTitleSize = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [28, 22],
    extrapolate: 'clamp',
  });

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.accentBlush} />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.backgroundBase} />
      
      {/* Animated Header */}
      <Animated.View style={[styles.header, { height: headerHeight }]}>
        <LinearGradient
          colors={[COLORS.gradientStart, COLORS.gradientEnd]}
          style={StyleSheet.absoluteFill}
        />
        
        <ProfileHeader
          title="Profile"
          subtitle={isEditing ? "Edit your information" : "Manage your account"}
          isEditing={isEditing}
          onEdit={() => setIsEditing(true)}
          onSave={handleSaveProfile}
          saving={saving}
        />
      </Animated.View>

      <Animated.ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
      >
        {/* Profile Card with Avatar */}
        <BlurView intensity={90} tint="light" style={styles.profileCard}>
          <View style={styles.profileCardContent}>
            <ProfileAvatar
              photoURL={photoURL}
              isEditing={isEditing}
              uploading={uploadingPhoto}
              onPickImage={handlePickImage}
            />
            
            <View style={styles.profileInfo}>
              {isEditing ? (
                <View style={styles.nameEditContainer}>
                  <TextInput
                    style={styles.nameInput}
                    value={username}
                    onChangeText={setUsername}
                    placeholder="Your name"
                    placeholderTextColor={COLORS.placeholder}
                    maxLength={MAX_NAME_LENGTH}
                  />
                  <Text style={styles.charCountSmall}>
                    {username.length}/{MAX_NAME_LENGTH}
                  </Text>
                </View>
              ) : (
                <Text style={styles.profileName}>{username || "User"}</Text>
              )}
              <Text style={styles.profileEmail}>{user?.email}</Text>
            </View>
          </View>

          {/* Bio Section */}
          <View style={styles.bioContainer}>
            <Text style={styles.bioLabel}>Bio</Text>
            {isEditing ? (
              <View style={styles.bioEditContainer}>
                <TextInput
                  style={styles.bioInput}
                  value={bio}
                  onChangeText={setBio}
                  placeholder="Tell us about yourself..."
                  placeholderTextColor={COLORS.placeholder}
                  multiline
                  maxLength={MAX_BIO_LENGTH}
                />
                <Text style={styles.charCount}>
                  {bio.length}/{MAX_BIO_LENGTH}
                </Text>
              </View>
            ) : (
              <Text style={styles.bioText}>
                {bio || "No bio yet. Tap edit to add one."}
              </Text>
            )}
          </View>
        </BlurView>

        {/* Personal Details Section */}
        <View style={styles.sectionHeader}>
          <Ionicons name="person-outline" size={20} color={COLORS.textSecondary} />
          <Text style={styles.sectionTitle}>Personal Details</Text>
        </View>

        <BlurView intensity={90} tint="light" style={styles.detailsCard}>
          {/* Date of Birth */}
          <InfoCard
            label="Date of Birth"
            value={dob ? new Date(dob).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric'
            }) : null}
            icon="calendar-outline"
            onPress={() => setShowDatePicker(true)}
            isEditing={isEditing}
          />

          {/* Gender */}
          <InfoCard
            label="Gender"
            value={gender}
            icon="person-outline"
            onPress={() => setShowGenderModal(true)}
            isEditing={isEditing}
          />

          {/* Country */}
          <InfoCard
            label="Country"
            value={country}
            icon="location-outline"
            onPress={() => setShowCountryModal(true)}
            isEditing={isEditing}
          />

          {/* Interests */}
          <InfoCard
            label="Interests"
            value={interests.length > 0 ? `${interests.length} selected` : null}
            icon="heart-outline"
            onPress={() => setShowInterestsModal(true)}
            isEditing={isEditing}
          />
        </BlurView>

        {/* Cancel Button (when editing) */}
        {isEditing && (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleCancelEdit}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        )}

        {/* Bottom padding */}
        <View style={{ height: 40 }} />
      </Animated.ScrollView>

      {/* ================================================================================
         📅 DATE PICKER
         ================================================================================ */}

      {showDatePicker && (
        <DateTimePicker
          value={dob ? new Date(dob) : new Date(2000, 0, 1)}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleDateChange}
          maximumDate={new Date()}
        />
      )}

      {/* ================================================================================
         🎯 GENDER SELECTION MODAL
         ================================================================================ */}

      <SelectionModal
        visible={showGenderModal}
        onClose={() => setShowGenderModal(false)}
        title="Select Gender"
      >
        <FlatList
          data={GENDER_OPTIONS}
          keyExtractor={(item) => item}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.modalOption}
              onPress={() => {
                setGender(item);
                setShowGenderModal(false);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <Text style={styles.modalOptionText}>{item}</Text>
              {gender === item && (
                <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
              )}
            </TouchableOpacity>
          )}
        />
      </SelectionModal>

      {/* ================================================================================
         🌍 COUNTRY SELECTION MODAL
         ================================================================================ */}

      <SelectionModal
        visible={showCountryModal}
        onClose={() => setShowCountryModal(false)}
        title="Select Country"
      >
        <FlatList
          data={COUNTRY_OPTIONS}
          keyExtractor={(item) => item}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.modalOption}
              onPress={() => {
                setCountry(item);
                setShowCountryModal(false);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
            >
              <Text style={styles.modalOptionText}>{item}</Text>
              {country === item && (
                <Ionicons name="checkmark-circle" size={24} color={COLORS.success} />
              )}
            </TouchableOpacity>
          )}
          initialNumToRender={20}
          maxToRenderPerBatch={20}
          windowSize={10}
        />
      </SelectionModal>

      {/* ================================================================================
         🎨 INTERESTS SELECTION MODAL
         ================================================================================ */}

      <SelectionModal
        visible={showInterestsModal}
        onClose={() => setShowInterestsModal(false)}
        title="Select Interests"
      >
        <View style={styles.interestsContainer}>
          <Text style={styles.interestsHint}>
            Tap to select your interests (you can choose multiple)
          </Text>
          
          <View style={styles.interestsGrid}>
            {INTEREST_OPTIONS.map((interest) => (
              <InterestChip
                key={interest}
                label={interest}
                selected={interests.includes(interest)}
                onToggle={() => toggleInterest(interest)}
              />
            ))}
          </View>

          {interests.length > 0 && (
            <View style={styles.selectedInterestsContainer}>
              <Text style={styles.selectedInterestsLabel}>
                Selected ({interests.length})
              </Text>
              <Text style={styles.selectedInterestsList}>
                {interests.join(' • ')}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.modalDoneButton}
            onPress={() => {
              setShowInterestsModal(false);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }}
          >
            <LinearGradient
              colors={[COLORS.accentBlush, COLORS.accentWarm]}
              style={styles.modalDoneGradient}
            >
              <Text style={styles.modalDoneText}>Done</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </SelectionModal>
    </SafeAreaView>
  );
}

/* ================================================================================
   🎨 STYLES - Complete redesign matching all screens
   ================================================================================ */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.backgroundBase,
  },
  
  // Loading
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.backgroundBase,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  
  // Header
  header: {
    backgroundColor: COLORS.card,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 16,
    elevation: 8,
    overflow: 'hidden',
  },
  headerContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 50 : 18,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
    fontWeight: '500',
  },
  
  // Edit Button
  editButton: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  editButtonActive: {
    shadowColor: COLORS.success,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  editButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
  },
  editButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  editButtonTextActive: {
    color: '#fff',
  },
  
  // Scroll View
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  
  // Profile Card
  profileCard: {
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 20,
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 4,
  },
  profileCardContent: {
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileInfo: {
    flex: 1,
    marginLeft: 16,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  
  // Avatar
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.accentBlush,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLoading: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.card,
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 3,
  },
  
  // Name Input
  nameEditContainer: {
    marginBottom: 4,
  },
  nameInput: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    padding: 0,
    marginBottom: 2,
  },
  charCountSmall: {
    fontSize: 11,
    color: COLORS.textTertiary,
  },
  
  // Bio
  bioContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  bioLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bioEditContainer: {
    position: 'relative',
  },
  bioInput: {
    fontSize: 14,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    borderRadius: 16,
    padding: 16,
    minHeight: 100,
    textAlignVertical: 'top',
    backgroundColor: COLORS.surfaceVariant,
    lineHeight: 20,
  },
  bioText: {
    fontSize: 14,
    color: COLORS.textPrimary,
    lineHeight: 20,
  },
  charCount: {
    fontSize: 11,
    color: COLORS.textTertiary,
    textAlign: 'right',
    marginTop: 4,
  },
  
  // Section Header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  
  // Details Card
  detailsCard: {
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 20,
    shadowColor: COLORS.nudeShadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 4,
  },
  
  // Info Card
  infoCard: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
  },
  infoCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  infoTextContainer: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.textPrimary,
  },
  infoValueEmpty: {
    color: COLORS.textTertiary,
    fontStyle: 'italic',
  },
  
  // Cancel Button
  cancelButton: {
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: COLORS.surfaceVariant,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  
  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    maxHeight: height * 0.8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  modalCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surfaceVariant,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    paddingVertical: 8,
    maxHeight: height * 0.6,
  },
  modalOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.cardBorder,
  },
  modalOptionText: {
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  
  // Interests Modal
  interestsContainer: {
    padding: 20,
  },
  interestsHint: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 16,
    textAlign: 'center',
  },
  interestsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  interestChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: COLORS.surfaceVariant,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
    marginBottom: 8,
    minWidth: '48%',
    alignItems: 'center',
  },
  interestChipSelected: {
    backgroundColor: COLORS.accentBlush,
    borderColor: COLORS.accentBlush,
  },
  interestChipText: {
    fontSize: 14,
    color: COLORS.textPrimary,
    fontWeight: '500',
  },
  interestChipTextSelected: {
    color: 'white',
    fontWeight: '600',
  },
  selectedInterestsContainer: {
    marginTop: 20,
    padding: 16,
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  selectedInterestsLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  selectedInterestsList: {
    fontSize: 14,
    color: COLORS.textPrimary,
    lineHeight: 20,
  },
  modalDoneButton: {
    marginTop: 24,
    borderRadius: 16,
    overflow: 'hidden',
  },
  modalDoneGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  modalDoneText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
});