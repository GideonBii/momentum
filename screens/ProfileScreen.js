// screens/ProfileScreen.js – FIXED VERSION
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from "expo-image-picker";
import { doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore"; // ⬅️ ADDED serverTimestamp
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import React, { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
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
import { db, storage } from "../firebaseConfig";

const COLORS = {
  backgroundBase: "#FAFAFA",
  card: "#FFFFFF",
  textPrimary: "#4A3228",
  textSecondary: "#A98467",
  accentBlush: "#D8A39D",
  accentWarm: "#E3B777",
  lightBorder: "#E0E0E0",
};

const MAX_BIO_LENGTH = 160;

// Predefined options
const GENDER_OPTIONS = ["Male", "Female", "Non-binary", "Prefer not to say"];
const INTEREST_OPTIONS = [
  "Technology", "Art", "Music", "Sports", "Travel", 
  "Food", "Reading", "Fitness", "Photography", "Gaming",
  "Movies", "Nature", "Fashion", "Cooking", "Science"
];

// Complete country list
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

export default function ProfileScreen() {
  const { user } = useApp();

  // UI State
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

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

  // 🔹 Load Cache on mount
  useEffect(() => {
    const loadCache = async () => {
      if (!user) return;
      try {
        const cached = await AsyncStorage.getItem(`profile_cache_${user.uid}`);
        if (cached) {
          const data = JSON.parse(cached);
          setUsername(data.username || "");
          setBio(data.bio || "");
          setPhotoURL(data.profilePic || null);
          setDob(data.dob || "");
          setInterests(Array.isArray(data.interests) ? data.interests : []);
          setGender(data.gender || "");
          setCountry(data.country || "");
        }
      } catch (e) {
        console.error("Failed to load profile cache", e);
      }
    };
    loadCache();
  }, [user]);

  // 🔹 Firestore Listener
  useEffect(() => {
    if (!user) return;
    const userRef = doc(db, "users", user.uid);
    const unsubscribe = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        
        setUsername(data.username || user.displayName || "");
        setBio(data.bio || "");
        setPhotoURL(data.profilePic || user.photoURL || null);
        setDob(data.dob || "");
        setInterests(Array.isArray(data.interests) ? data.interests : []);
        setGender(data.gender || "");
        setCountry(data.country || "");

        const cacheData = {
          ...data,
          interests: Array.isArray(data.interests) ? data.interests : []
        };
        AsyncStorage.setItem(`profile_cache_${user.uid}`, JSON.stringify(cacheData));
      }
    });
    return () => unsubscribe();
  }, [user]);

  // 🔹 Image Picker - FIXED: Correct ImagePicker usage
  const handlePickImage = async () => {
    if (!user) {
      Alert.alert("Error", "Please sign in to change your profile picture");
      return;
    }

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Permission needed", "Please allow access to photos");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images, // FIXED: Use the correct property
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error("Image picker error:", error);
      Alert.alert("Error", "Failed to pick image");
    }
  };

  // 🔹 Upload Image - FIXED: Better Firebase Storage handling
  const uploadImage = async (uri) => {
    if (!user) return;

    setUploadingPhoto(true);
    try {
      console.log("Starting image upload...");
      
      // Convert image to blob
      const response = await fetch(uri);
      const blob = await response.blob();
      console.log("Image converted to blob, size:", blob.size);

      // Upload to Firebase Storage
      const storageRef = ref(storage, `profiles/${user.uid}/profile.jpg`);
      // FIX: The log below previously used an undefined variable 'filename'.
      // It has been fixed to log the actual path based on user.uid.
      console.log("Uploading to storage path:", `profiles/${user.uid}/profile.jpg`); 
      
      const snapshot = await uploadBytes(storageRef, blob);
      console.log("Upload completed:", snapshot);

      // Get download URL
      const downloadURL = await getDownloadURL(storageRef);
      console.log("Download URL obtained:", downloadURL);

      // Update Firestore with the new photo URL
      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, { 
        profilePic: downloadURL 
      });
      console.log("Firestore updated with new profile picture");

      // Update local state
      setPhotoURL(downloadURL);
      
      // Update cache
      const cached = await AsyncStorage.getItem(`profile_cache_${user.uid}`);
      if (cached) {
        const data = JSON.parse(cached);
        await AsyncStorage.setItem(`profile_cache_${user.uid}`, JSON.stringify({
          ...data,
          profilePic: downloadURL
        }));
      }

      Alert.alert("Success", "Profile photo updated!");
    } catch (error) {
      console.error("Upload error details:", error);
      console.error("Error code:", error.code);
      console.error("Error message:", error.message);
      
      let errorMessage = "Failed to upload image. Please try again.";
      
      // Handle specific Firebase Storage errors
      if (error.code === 'storage/unknown') {
        errorMessage = "Storage error: Please check your Firebase Storage configuration and rules.";
      } else if (error.code === 'storage/unauthorized') {
        errorMessage = "You don't have permission to upload images. Please check your rules.";
      } else if (error.code === 'storage/canceled') {
        errorMessage = "Upload was canceled.";
      } else if (error.code === 'storage/retry-limit-exceeded') {
        errorMessage = "Upload failed after multiple attempts. Please check your internet connection.";
      }
      
      Alert.alert("Upload Error", errorMessage);
    } finally {
      setUploadingPhoto(false);
    }
  };

  // 🔹 Date Picker
  const onDateChange = (event, selectedDate) => {
    if (event.type === 'set' && selectedDate) {
      const formattedDate = selectedDate.toISOString().split('T')[0];
      setDob(formattedDate);
    }
    setShowDatePicker(false);
  };

  const showDatepicker = () => {
    setShowDatePicker(true);
  };

  // 🔹 Toggle Interest
  const toggleInterest = (interest) => {
    setInterests(prev => 
      prev.includes(interest) 
        ? prev.filter(item => item !== interest)
        : [...prev, interest]
    );
  };

  // 🔹 Save Profile
  const saveProfile = async () => {
    if (!user) return;

    if (!username.trim()) {
      Alert.alert("Oops", "Please enter your name");
      return;
    }

    setSaving(true);
    try {
      const userRef = doc(db, "users", user.uid);
      const updateData = {
        username: username.trim(),
        bio: bio.trim(),
        dob: dob,
        interests: interests,
        gender: gender,
        country: country,
        updatedAt: serverTimestamp(), // ⬅️ FIXED: Used serverTimestamp for accuracy
      };

      await updateDoc(userRef, updateData);

      // Update cache
      await AsyncStorage.setItem(`profile_cache_${user.uid}`, JSON.stringify({
        ...updateData,
        profilePic: photoURL
      }));

      setIsEditing(false);
      Alert.alert("Saved", "Profile updated successfully!");
    } catch (error) {
      console.error("Save error:", error);
      Alert.alert("Error", "Could not save profile. Please check your connection.");
    } finally {
      setSaving(false);
    }
  };

  // 🔹 Render Modal
  const renderModal = (visible, onClose, title, content) => (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
        </View>
        {content}
      </View>
    </Modal>
  );

  // 🔹 Render Gender Modal
  const renderGenderModal = () => (
    <FlatList
      data={GENDER_OPTIONS}
      keyExtractor={(item) => item}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.optionItem}
          onPress={() => {
            setGender(item);
            setShowGenderModal(false);
          }}
        >
          <Text style={styles.optionText}>{item}</Text>
          {gender === item && (
            <Ionicons name="checkmark" size={20} color={COLORS.accentBlush} />
          )}
        </TouchableOpacity>
      )}
    />
  );

  // 🔹 Render Country Modal
  const renderCountryModal = () => (
    <FlatList
      data={COUNTRY_OPTIONS}
      keyExtractor={(item) => item}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.optionItem}
          onPress={() => {
            setCountry(item);
            setShowCountryModal(false);
          }}
        >
          <Text style={styles.optionText}>{item}</Text>
          {country === item && (
            <Ionicons name="checkmark" size={20} color={COLORS.accentBlush} />
          )}
        </TouchableOpacity>
      )}
      initialNumToRender={20}
      maxToRenderPerBatch={20}
      windowSize={10}
    />
  );

  // 🔹 Render Interests Modal
  const renderInterestsModal = () => {
    const safeInterests = Array.isArray(interests) ? interests : [];
    const interestsText = safeInterests.join(', ');

    return (
      <View style={styles.interestsModalContent}>
        <Text style={styles.interestsHint}>Select your interests (tap to select/deselect)</Text>
        <View style={styles.interestsGrid}>
          {INTEREST_OPTIONS.map((interest) => (
            <TouchableOpacity
              key={interest}
              style={[
                styles.interestChip,
                safeInterests.includes(interest) && styles.interestChipSelected
              ]}
              onPress={() => toggleInterest(interest)}
            >
              <Text style={[
                styles.interestText,
                safeInterests.includes(interest) && styles.interestTextSelected
              ]}>
                {interest}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.selectedInterests}>
          <Text style={styles.selectedCount}>
            {safeInterests.length} interest{safeInterests.length !== 1 ? 's' : ''} selected
          </Text>
          {safeInterests.length > 0 && (
            <Text style={styles.selectedList}>{interestsText}</Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.doneButton}
          onPress={() => setShowInterestsModal(false)}
        >
          <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Profile</Text>
            <Text style={styles.subtitle}>Manage your information</Text>
          </View>
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => isEditing ? saveProfile() : setIsEditing(true)}
            disabled={saving}
          >
            <Text style={styles.editButtonText}>
              {isEditing ? (saving ? "Saving..." : "Save") : "Edit"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.profileHeader}>
            <TouchableOpacity onPress={handlePickImage} disabled={!isEditing || uploadingPhoto}>
              <View style={styles.photoContainer}>
                {uploadingPhoto ? (
                  <View style={styles.photoLoading}>
                    <Ionicons name="cloud-upload" size={32} color="#fff" />
                  </View>
                ) : photoURL ? (
                  <Image source={{ uri: photoURL }} style={styles.photo} />
                ) : (
                  <View style={styles.photoPlaceholder}>
                    <Ionicons name="person" size={32} color="#fff" />
                  </View>
                )}
                {isEditing && !uploadingPhoto && (
                  <View style={styles.cameraBadge}>
                    <Ionicons name="camera" size={16} color="#fff" />
                  </View>
                )}
              </View>
            </TouchableOpacity>

            <View style={styles.nameContainer}>
              {isEditing ? (
                <TextInput
                  style={styles.nameInput}
                  value={username}
                  onChangeText={setUsername}
                  placeholder="Your Name"
                />
              ) : (
                <Text style={styles.name}>{username || "User"}</Text>
              )}
              <Text style={styles.email}>{user?.email}</Text>
            </View>
          </View>

          {/* Bio */}
          <View style={styles.bioSection}>
            <Text style={styles.sectionLabel}>Bio</Text>
            {isEditing ? (
              <View>
                <TextInput
                  style={styles.bioInput}
                  value={bio}
                  onChangeText={setBio}
                  placeholder="Tell us about yourself..."
                  multiline
                  maxLength={MAX_BIO_LENGTH}
                />
                <Text style={styles.charCount}>
                  {bio.length}/{MAX_BIO_LENGTH}
                </Text>
              </View>
            ) : (
              <Text style={styles.bioText}>{bio || "No bio yet"}</Text>
            )}
          </View>
        </View>

        {/* Personal Details */}
        <Text style={styles.sectionTitle}>Personal Details</Text>
        <View style={styles.detailsCard}>
          {/* Date of Birth */}
          <TouchableOpacity 
            style={styles.detailItem}
            onPress={() => isEditing && showDatepicker()}
            disabled={!isEditing}
          >
            <View style={styles.detailIcon}>
              <Ionicons name="calendar-outline" size={20} color={COLORS.textSecondary} />
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Date of Birth</Text>
              <Text style={styles.detailValue}>{dob || "Not set"}</Text>
            </View>
            {isEditing && (
              <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
            )}
          </TouchableOpacity>

          {/* Gender */}
          <TouchableOpacity 
            style={styles.detailItem}
            onPress={() => isEditing && setShowGenderModal(true)}
            disabled={!isEditing}
          >
            <View style={styles.detailIcon}>
              <Ionicons name="person-outline" size={20} color={COLORS.textSecondary} />
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Gender</Text>
              <Text style={styles.detailValue}>{gender || "Not set"}</Text>
            </View>
            {isEditing && (
              <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
            )}
          </TouchableOpacity>

          {/* Country */}
          <TouchableOpacity 
            style={styles.detailItem}
            onPress={() => isEditing && setShowCountryModal(true)}
            disabled={!isEditing}
          >
            <View style={styles.detailIcon}>
              <Ionicons name="location-outline" size={20} color={COLORS.textSecondary} />
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Country</Text>
              <Text style={styles.detailValue}>{country || "Not set"}</Text>
            </View>
            {isEditing && (
              <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
            )}
          </TouchableOpacity>

          {/* Interests */}
          <TouchableOpacity 
            style={styles.detailItem}
            onPress={() => isEditing && setShowInterestsModal(true)}
            disabled={!isEditing}
          >
            <View style={styles.detailIcon}>
              <Ionicons name="heart-outline" size={20} color={COLORS.textSecondary} />
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>Interests</Text>
              <Text style={styles.detailValue}>
                {interests.length > 0 ? `${interests.length} selected` : "Not set"}
              </Text>
            </View>
            {isEditing && (
              <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
            )}
          </TouchableOpacity>
        </View>

        {/* Date Picker */}
        {showDatePicker && (
          <DateTimePicker
            value={dob ? new Date(dob) : new Date(2000, 0, 1)}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={onDateChange}
            maximumDate={new Date()}
          />
        )}

        {/* Modals */}
        {renderModal(showGenderModal, () => setShowGenderModal(false), "Select Gender", renderGenderModal())}
        {renderModal(showCountryModal, () => setShowCountryModal(false), "Select Country", renderCountryModal())}
        {renderModal(showInterestsModal, () => setShowInterestsModal(false), "Select Interests", renderInterestsModal())}
      </ScrollView>
    </SafeAreaView>
  );
}

// ... (styles remain exactly the same as previous version)
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.backgroundBase },
  container: { padding: 20, paddingBottom: 40 },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 24,
  },
  title: { fontSize: 28, fontWeight: "800", color: COLORS.textPrimary },
  subtitle: { fontSize: 14, color: COLORS.textSecondary },
  editButton: { padding: 8 },
  editButtonText: { fontSize: 16, fontWeight: "700", color: COLORS.accentBlush },
  profileCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  profileHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  photoContainer: { position: "relative", marginRight: 16 },
  photo: { width: 80, height: 80, borderRadius: 40 },
  photoPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.accentBlush,
    justifyContent: "center",
    alignItems: "center",
  },
  photoLoading: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.textSecondary,
    justifyContent: "center",
    alignItems: "center",
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: COLORS.textPrimary,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  nameContainer: { flex: 1 },
  name: { fontSize: 20, fontWeight: "700", color: COLORS.textPrimary },
  nameInput: { 
    fontSize: 20, 
    fontWeight: "700", 
    color: COLORS.textPrimary, 
    borderBottomWidth: 1, 
    borderBottomColor: COLORS.lightBorder,
  },
  email: { fontSize: 14, color: COLORS.textSecondary, marginTop: 4 },
  bioSection: { marginTop: 16 },
  sectionLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 8 },
  bioText: { fontSize: 14, color: COLORS.textPrimary, lineHeight: 20 },
  bioInput: { 
    fontSize: 14, 
    color: COLORS.textPrimary, 
    borderWidth: 1, 
    borderColor: COLORS.lightBorder,
    borderRadius: 8,
    padding: 12,
    minHeight: 80,
  },
  charCount: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'right',
    marginTop: 4,
  },
  sectionTitle: { 
    fontSize: 18, 
    fontWeight: "700", 
    color: COLORS.textPrimary, 
    marginBottom: 12,
  },
  detailsCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  detailIcon: { 
    width: 36, 
    height: 36, 
    backgroundColor: COLORS.backgroundBase, 
    borderRadius: 10, 
    justifyContent: 'center', 
    alignItems: 'center',
    marginRight: 12,
  },
  detailContent: { flex: 1 },
  detailLabel: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 2 },
  detailValue: { fontSize: 16, color: COLORS.textPrimary, fontWeight: '500' },
  modalContainer: { flex: 1, backgroundColor: COLORS.backgroundBase },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightBorder,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: COLORS.textPrimary },
  closeButton: { padding: 4 },
  optionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lightBorder,
  },
  optionText: { fontSize: 16, color: COLORS.textPrimary },
  interestsModalContent: { flex: 1, padding: 16 },
  interestsHint: { 
    fontSize: 14, 
    color: COLORS.textSecondary, 
    textAlign: 'center', 
    marginBottom: 16,
  },
  interestsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  interestChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.backgroundBase,
    borderWidth: 1,
    borderColor: COLORS.lightBorder,
    marginBottom: 8,
    minWidth: '48%',
  },
  interestChipSelected: {
    backgroundColor: COLORS.accentBlush,
    borderColor: COLORS.accentBlush,
  },
  interestText: {
    fontSize: 14,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  interestTextSelected: {
    color: COLORS.card,
    fontWeight: '600',
  },
  selectedInterests: {
    marginTop: 16,
    padding: 12,
    backgroundColor: COLORS.backgroundBase,
    borderRadius: 8,
  },
  selectedCount: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  selectedList: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },
  doneButton: {
    backgroundColor: COLORS.accentBlush,
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
  },
  doneButtonText: {
    color: COLORS.card,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});