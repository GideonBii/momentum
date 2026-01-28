import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from '@react-native-async-storage/async-storage'; // ADDED: Offline Storage
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    onSnapshot,
    query,
    serverTimestamp,
    updateDoc,
    where,
} from "firebase/firestore";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { RichEditor, RichToolbar, actions } from "react-native-pell-rich-editor";
import RenderHTML from "react-native-render-html";
import { useApp } from "../context/AppContext";
import { db } from "../firebaseConfig";

const { width } = Dimensions.get("window");

// 🔹 UNIFIED COLOR PALETTE (Matching HomeScreen)
const COLORS = {
    backgroundBase: "#FAFAFA",
    backgroundLayer: "#FAFAFA",
    card: "#FFFFFF",
    textPrimary: "#4A3228",
    textSecondary: "#A98467",
    accentBlush: "#D8A39D",
    accentWarm: "#E3B777",
    nudeShadow: "rgba(216,163,157,0.12)",
    shadowDark: "rgba(0,0,0,0.06)",
    lightBorder: "#E0E0E0",
    completedText: "#888",
    error: "#D64545",
    success: "#5D8B7E",
};

// 🔹 HTML Rendering Styles for Journal Preview
const htmlTagsStyles = {
    body: { 
        fontSize: 14, 
        color: COLORS.textPrimary,
        maxHeight: 80, 
        overflow: 'hidden', 
        lineHeight: 20
    },
    p: { marginBottom: 4, marginTop: 4 }, 
    ul: { margin: 0, paddingLeft: 10 },
    ol: { margin: 0, paddingLeft: 10 },
    li: { marginBottom: 4 },
};

// Tags to ignore during HTML rendering
const ignoredDomTags = ['input', 'form', 'script', 'style'];

export default function JournalScreen() {
    const { user } = useApp();
    const [journals, setJournals] = useState([]);
    const [isFormModalVisible, setIsFormModalVisible] = useState(false);
    const [journalTitle, setJournalTitle] = useState("");
    const [journalContent, setJournalContent] = useState("");
    const [currentJournal, setCurrentJournal] = useState(null);
    const [loading, setLoading] = useState(false);
    
    // Search and Sort states
    const [searchQuery, setSearchQuery] = useState("");
    const [sortOrder, setSortOrder] = useState("newest");

    // Delete Confirmation Modal states
    const [isConfirmModalVisible, setIsConfirmModalVisible] = useState(false);
    const [journalToDelete, setJournalToDelete] = useState(null);

    // Success feedback state
    const [showSuccessMessage, setShowSuccessMessage] = useState(false);
    const [successMessage, setSuccessMessage] = useState("");
    const successOpacity = useRef(new Animated.Value(0)).current;

    // Auto-save draft
    const [draftTitle, setDraftTitle] = useState("");
    const [draftContent, setDraftContent] = useState("");

    const richText = useRef();

    const isSaveDisabled = useMemo(() => {
        return !journalTitle.trim() && !journalContent.trim();
    }, [journalTitle, journalContent]);

    // 🔹 SUCCESS MESSAGE ANIMATION
    const showSuccess = (message) => {
        setSuccessMessage(message);
        setShowSuccessMessage(true);
        Animated.sequence([
            Animated.timing(successOpacity, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
            }),
            Animated.delay(2000),
            Animated.timing(successOpacity, {
                toValue: 0,
                duration: 300,
                useNativeDriver: true,
            }),
        ]).start(() => setShowSuccessMessage(false));
    };

    // 🔹 OFFLINE FIRST: Load Cache on mount
    useEffect(() => {
        async function loadCache() {
            if (!user) return;
            try {
                const cachedData = await AsyncStorage.getItem(`journal_cache_${user.uid}`);
                if (cachedData) {
                    const parsed = JSON.parse(cachedData).map(item => ({
                        ...item,
                        // Rehydrate date strings back to Date objects
                        createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
                    }));
                    setJournals(parsed);
                }
            } catch (error) {
                console.log("Failed to load journal cache", error);
            }
        }
        loadCache();
    }, [user]);

    // 🔹 FIREBASE LISTENER
    useEffect(() => {
        if (!user || !db) return;
        
        const journalsQuery = query(
            collection(db, "journal"),
            where("userId", "==", user.uid)
        );

        const unsubscribe = onSnapshot(journalsQuery, (snapshot) => {
            const fetchedJournals = snapshot.docs.map((doc) => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    createdAt: data.createdAt?.toDate ?
                        data.createdAt.toDate() :
                        new Date(),
                };
            });
            setJournals(fetchedJournals);
            
            // ADDED: Update Cache
            AsyncStorage.setItem(`journal_cache_${user.uid}`, JSON.stringify(fetchedJournals));
        }, (error) => {
            console.error("Firestore listener error:", error);
        });

        return () => unsubscribe();
    }, [user]);

    // 🔹 AUTO-SAVE DRAFT
    useEffect(() => {
        if (isFormModalVisible && (journalTitle || journalContent)) {
            setDraftTitle(journalTitle);
            setDraftContent(journalContent);
        }
    }, [journalTitle, journalContent, isFormModalVisible]);

    // 🔹 MODAL HANDLERS
    const closeJournalModal = () => {
        if ((journalTitle.trim() || journalContent.trim()) && !currentJournal) {
            setDraftTitle(journalTitle);
            setDraftContent(journalContent);
        }
        
        setIsFormModalVisible(false);
        setCurrentJournal(null);
        setJournalTitle("");
        setJournalContent("");
    };

    const openJournalModal = (journal = null) => {
        if (journal) {
            setCurrentJournal(journal);
            setJournalTitle(journal.title);
            setJournalContent(journal.content);
        } else {
            setCurrentJournal(null);
            setJournalTitle(draftTitle);
            setJournalContent(draftContent);
        }
        setIsFormModalVisible(true);
    };

    // 🔹 CRUD OPERATIONS
    const handleSaveJournal = async () => {
        if (isSaveDisabled) return;

        setLoading(true);
        try {
            const journalData = {
                title: journalTitle,
                content: journalContent,
                userId: user.uid,
                createdAt: currentJournal?.createdAt || serverTimestamp(), 
            };

            if (currentJournal) {
                const updatedData = { ...journalData };
                delete updatedData.createdAt;
                await updateDoc(doc(db, "journal", currentJournal.id), updatedData);
                showSuccess("Journal updated successfully!");
            } else {
                await addDoc(collection(db, "journal"), journalData);
                showSuccess("Journal created successfully!");
                setDraftTitle("");
                setDraftContent("");
            }
            closeJournalModal();
        } catch (error) {
            console.error("Error saving journal:", error);
            showSuccess("Error saving journal. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const confirmDelete = (journal) => {
        setJournalToDelete(journal);
        setIsConfirmModalVisible(true);
    };

    const handleDeleteJournal = async () => {
        if (!journalToDelete) return;
        try {
            await deleteDoc(doc(db, "journal", journalToDelete.id));
            setIsConfirmModalVisible(false);
            setJournalToDelete(null);
            showSuccess("Journal deleted successfully!");
        } catch (error) {
            console.error("Error deleting journal:", error);
            showSuccess("Error deleting journal. Please try again.");
        }
    };

    // 🔹 SEARCH & SORT LOGIC
    const filteredAndSortedJournals = useMemo(() => {
        let filtered = journals.filter(journal =>
            journal.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            journal.content.toLowerCase().includes(searchQuery.toLowerCase())
        );

        if (sortOrder === "newest") {
            filtered.sort((a, b) => b.createdAt - a.createdAt);
        } else {
            filtered.sort((a, b) => a.createdAt - b.createdAt);
        }

        return filtered;
    }, [journals, searchQuery, sortOrder]);

    const toggleSortOrder = () => {
        setSortOrder(sortOrder === "newest" ? "oldest" : "newest");
    };

    const clearSearch = () => {
        setSearchQuery("");
    };

    // 🔹 RENDER FUNCTIONS
    const renderJournalCard = (journal) => (
        <TouchableOpacity 
            key={journal.id} 
            style={styles.journalCard}
            onPress={() => openJournalModal(journal)}
            activeOpacity={0.7}
        >
            <View style={styles.journalHeader}>
                <Text style={styles.journalTitle} numberOfLines={1}>
                    {journal.title || "Untitled Entry"}
                </Text>
                <View style={styles.journalActions}>
                    <TouchableOpacity
                        onPress={(e) => {
                            e.stopPropagation();
                            openJournalModal(journal);
                        }}
                        style={styles.actionButton}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <Ionicons name="create-outline" size={20} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={(e) => {
                            e.stopPropagation();
                            confirmDelete(journal);
                        }}
                        style={styles.actionButton}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <Ionicons name="trash-outline" size={20} color={COLORS.error} />
                    </TouchableOpacity>
                </View>
            </View>
            <Text style={styles.journalDate}>
                {`${journal.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at ${journal.createdAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`}
            </Text>
            <RenderHTML
                contentWidth={width - 60}
                source={{ html: journal.content || "<p>No content</p>" }}
                tagsStyles={htmlTagsStyles} 
                defaultTextProps={{ selectable: false }}
                enableExperimentalMarginCollapsing={true}
                ignoredDomTags={ignoredDomTags}
            />
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <View>
                    <Text style={styles.headerTitle}>My Journal</Text>
                    <Text style={styles.headerSubtitle}>{journals.length} {journals.length === 1 ? 'entry' : 'entries'}</Text>
                </View>
                <TouchableOpacity
                    style={styles.addButton}
                    onPress={() => openJournalModal()}
                    activeOpacity={0.8}
                >
                    <Ionicons name="add" size={24} color="#fff" />
                </TouchableOpacity>
            </View>

            {/* Search and Sort bar */}
            <View style={styles.searchSortContainer}>
                <View style={styles.searchInputContainer}>
                    <Ionicons name="search" size={20} color={COLORS.completedText} style={styles.searchIcon} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search journal entries..."
                        placeholderTextColor={COLORS.completedText}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                    {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={clearSearch} style={styles.clearButton}>
                            <Ionicons name="close-circle" size={20} color={COLORS.completedText} />
                        </TouchableOpacity>
                    )}
                </View>
                <TouchableOpacity 
                    style={styles.sortButton} 
                    onPress={toggleSortOrder}
                    activeOpacity={0.7}
                >
                    <Ionicons
                        name={sortOrder === 'newest' ? "arrow-down" : "arrow-up"}
                        size={20}
                        color={COLORS.textSecondary}
                    />
                </TouchableOpacity>
            </View>

            {/* Journals List */}
            <ScrollView 
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {filteredAndSortedJournals.length === 0 && !searchQuery ? (
                    <View style={styles.emptyContainer}>
                        <Ionicons name="book-outline" size={80} color={COLORS.lightBorder} />
                        <Text style={styles.emptyText}>No journal entries yet</Text>
                        <Text style={styles.emptySubtext}>Tap the + button to create your first entry</Text>
                    </View>
                ) : filteredAndSortedJournals.length === 0 && searchQuery ? (
                    <View style={styles.emptyContainer}>
                        <Ionicons name="search-outline" size={80} color={COLORS.lightBorder} />
                        <Text style={styles.emptyText}>No results found</Text>
                        <Text style={styles.emptySubtext}>Try a different search term</Text>
                    </View>
                ) : (
                    filteredAndSortedJournals.map(renderJournalCard)
                )}
            </ScrollView>

            {/* Success Message */}
            {showSuccessMessage && (
                <Animated.View style={[styles.successMessage, { opacity: successOpacity }]}>
                    <Ionicons name="checkmark-circle" size={20} color="#fff" />
                    <Text style={styles.successText}>{successMessage}</Text>
                </Animated.View>
            )}

            {/* Editor Modal */}
            <Modal visible={isFormModalVisible} transparent={true} animationType="slide">
                <KeyboardAvoidingView
                    style={styles.modalOverlay}
                    behavior={Platform.OS === "ios" ? "padding" : undefined}
                    keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
                >
                    <View style={styles.modalContainer}>
                        {/* Header */}
                        <View style={styles.modalHeader}>
                            <View>
                                <Text style={styles.modalTitle}>
                                    {currentJournal ? "Edit Entry" : "New Entry"}
                                </Text>
                                {currentJournal && (
                                    <Text style={styles.modalSubtitle}>
                                        Last edited {currentJournal.createdAt.toLocaleDateString()}
                                    </Text>
                                )}
                            </View>
                            <TouchableOpacity onPress={closeJournalModal} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                <Ionicons name="close" size={28} color={COLORS.textPrimary} />
                            </TouchableOpacity>
                        </View>

                        {/* Title Input with Character Count */}
                        <View style={styles.titleInputContainer}>
                            <TextInput
                                style={styles.titleInput}
                                placeholder="Entry title"
                                placeholderTextColor={COLORS.completedText}
                                value={journalTitle}
                                onChangeText={setJournalTitle}
                                autoFocus={!currentJournal}
                                maxLength={100}
                                returnKeyType="next"
                                onSubmitEditing={() => richText.current?.focusContentEditor()}
                            />
                            {journalTitle.length > 0 && (
                                <Text style={styles.characterCount}>{journalTitle.length}/100</Text>
                            )}
                        </View>

                        {/* Enhanced Rich Toolbar with Labels */}
                        <View style={styles.toolbarContainer}>
                            <Text style={styles.toolbarLabel}>Format:</Text>
                            <RichToolbar
                                editor={richText}
                                actions={[
                                    actions.setBold,
                                    actions.setItalic,
                                    actions.setUnderline,
                                    actions.insertBulletsList,
                                    actions.insertOrderedList,
                                    actions.checkboxList,
                                    actions.undo,
                                    actions.redo,
                                ]}
                                iconMap={{
                                    [actions.setBold]: ({ tintColor }) => (
                                        <View style={styles.toolbarIconContainer}>
                                            <Text style={[styles.toolbarText, { color: tintColor, fontWeight: 'bold' }]}>B</Text>
                                        </View>
                                    ),
                                    [actions.setItalic]: ({ tintColor }) => (
                                        <View style={styles.toolbarIconContainer}>
                                            <Text style={[styles.toolbarText, { color: tintColor, fontStyle: 'italic' }]}>I</Text>
                                        </View>
                                    ),
                                    [actions.setUnderline]: ({ tintColor }) => (
                                        <View style={styles.toolbarIconContainer}>
                                            <Text style={[styles.toolbarText, { color: tintColor, textDecorationLine: 'underline' }]}>U</Text>
                                        </View>
                                    ),
                                    [actions.insertBulletsList]: ({ tintColor }) => (
                                        <View style={styles.toolbarIconContainer}>
                                            <Ionicons name="list-outline" size={22} color={tintColor} />
                                        </View>
                                    ),
                                    [actions.insertOrderedList]: ({ tintColor }) => (
                                        <View style={styles.toolbarIconContainer}>
                                            <Ionicons name="list" size={22} color={tintColor} />
                                        </View>
                                    ),
                                    [actions.checkboxList]: ({ tintColor }) => (
                                        <View style={styles.toolbarIconContainer}>
                                            <Ionicons name="checkbox-outline" size={22} color={tintColor} />
                                        </View>
                                    ),
                                    [actions.undo]: ({ tintColor }) => (
                                        <View style={styles.toolbarIconContainer}>
                                            <Ionicons name="arrow-undo" size={22} color={tintColor} />
                                        </View>
                                    ),
                                    [actions.redo]: ({ tintColor }) => (
                                        <View style={styles.toolbarIconContainer}>
                                            <Ionicons name="arrow-redo" size={22} color={tintColor} />
                                        </View>
                                    ),
                                }}
                                style={styles.richToolbar}
                                selectedIconTint={COLORS.accentBlush}
                                iconTint={COLORS.textSecondary}
                                disabled={false}
                            />
                        </View>

                        {/* Rich Editor with Enhanced Styling */}
                        <ScrollView 
                            style={styles.editorScrollView} 
                            keyboardShouldPersistTaps="handled"
                            contentContainerStyle={styles.editorScrollContent}
                        >
                            <RichEditor
                                ref={richText}
                                style={styles.richEditor}
                                placeholder="Write your journal entry here...&#10;&#10;• Use the toolbar above to format text&#10;• Add bullet points or numbered lists&#10;• Create checklists for tasks"
                                initialContentHTML={journalContent}
                                onChange={setJournalContent}
                                androidHardwareAccelerationDisabled={true}
                                editorStyle={{
                                    backgroundColor: COLORS.card,
                                    color: COLORS.textPrimary,
                                    placeholderColor: COLORS.completedText,
                                    contentCSSText: `
                                        font-size: 16px; 
                                        line-height: 1.6;
                                        padding: 12px;
                                        font-family: -apple-system, system-ui;
                                    `
                                }}
                                useContainer={true}
                                enterKeyHint="enter"
                            />
                        </ScrollView>

                        {/* Helper Text */}
                        <View style={styles.editorFooter}>
                            <Text style={styles.editorHelper}>
                                Tip: Press and hold to format selected text
                            </Text>
                        </View>

                        {/* Save Button */}
                        <TouchableOpacity
                            style={[styles.saveButton, isSaveDisabled && styles.saveButtonDisabled]}
                            onPress={handleSaveJournal}
                            disabled={isSaveDisabled || loading}
                            activeOpacity={0.8}
                        >
                            {loading ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <>
                                    <Ionicons name="checkmark" size={20} color="#fff" style={{ marginRight: 8 }} />
                                    <Text style={styles.saveButtonText}>
                                        {currentJournal ? "Update Entry" : "Save Entry"}
                                    </Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
            
            {/* Delete Confirmation Modal */}
            <Modal
                visible={isConfirmModalVisible}
                transparent={true}
                animationType="fade"
            >
                <View style={styles.confirmModalOverlay}>
                    <View style={styles.confirmModalContainer}>
                        <View style={styles.confirmIconContainer}>
                            <Ionicons name="warning" size={48} color={COLORS.error} />
                        </View>
                        <Text style={styles.confirmModalTitle}>Delete Entry?</Text>
                        <Text style={styles.confirmModalText}>
                            This action cannot be undone. The journal entry will be permanently deleted.
                        </Text>
                        <View style={styles.confirmModalButtons}>
                            <TouchableOpacity
                                style={[styles.confirmButton, styles.cancelConfirmButton]}
                                onPress={() => setIsConfirmModalVisible(false)}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.cancelButtonText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.confirmButton, styles.deleteConfirmButton]}
                                onPress={handleDeleteJournal}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.confirmButtonText}>Delete</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.backgroundBase },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingTop: 50,
        paddingHorizontal: 20,
        marginBottom: 20,
    },
    headerTitle: { 
        fontSize: 28, 
        fontWeight: "700", 
        color: COLORS.textPrimary,
        letterSpacing: -0.4,
    },
    headerSubtitle: { 
        fontSize: 13, 
        color: COLORS.textSecondary, 
        marginTop: 4,
        fontWeight: "600",
    },
    addButton: {
        backgroundColor: COLORS.accentBlush, 
        borderRadius: 50,
        width: 50,
        height: 50,
        alignItems: "center",
        justifyContent: "center",
        shadowColor: COLORS.nudeShadow,
        shadowOpacity: 1,
        shadowOffset: { width: 0, height: 6 },
        shadowRadius: 14,
        elevation: 4,
    },
    searchSortContainer: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 20,
        marginBottom: 20,
    },
    searchInputContainer: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        height: 48,
        borderColor: COLORS.lightBorder,
        borderWidth: 0.5,
        borderRadius: 12,
        backgroundColor: COLORS.card,
        marginRight: 10,
        paddingHorizontal: 15,
        shadowColor: COLORS.nudeShadow,
        shadowOpacity: 1,
        shadowOffset: { width: 0, height: 6 },
        shadowRadius: 14,
        elevation: 2,
    },
    searchIcon: {
        marginRight: 8,
    },
    searchInput: {
        flex: 1,
        color: COLORS.textPrimary,
        fontSize: 15,
    },
    clearButton: {
        padding: 4,
    },
    sortButton: {
        width: 48,
        height: 48,
        justifyContent: "center",
        alignItems: "center",
        borderColor: COLORS.lightBorder,
        borderWidth: 0.5,
        borderRadius: 12,
        backgroundColor: COLORS.card,
        shadowColor: COLORS.nudeShadow,
        shadowOpacity: 1,
        shadowOffset: { width: 0, height: 6 },
        shadowRadius: 14,
        elevation: 2,
    },
    scrollContent: { padding: 20, flexGrow: 1 },
    emptyContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingVertical: 60,
    },
    emptyText: { 
        textAlign: "center", 
        marginTop: 20, 
        color: COLORS.textPrimary, 
        fontSize: 18,
        fontWeight: "700",
        letterSpacing: -0.3,
    },
    emptySubtext: {
        textAlign: "center",
        marginTop: 8,
        color: COLORS.completedText,
        fontSize: 14,
    },
    journalCard: {
        backgroundColor: COLORS.card,
        borderRadius: 14,
        padding: 18,
        marginBottom: 15,
        borderWidth: 0.5,
        borderColor: COLORS.accentBlush + "06",
        shadowColor: COLORS.nudeShadow,
        shadowOpacity: 0.8,
        shadowOffset: { width: 0, height: 8 },
        shadowRadius: 18,
        elevation: 6, 
    },
    journalHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        borderBottomWidth: 1,
        borderBottomColor: COLORS.lightBorder,
        paddingBottom: 10,
        marginBottom: 10,
    },
    journalTitle: { 
        fontSize: 18, 
        fontWeight: "700", 
        color: COLORS.textPrimary, 
        flexShrink: 1,
        letterSpacing: -0.3,
    },
    journalActions: { flexDirection: "row" },
    actionButton: { 
        marginLeft: 10,
        padding: 4,
    },
    journalDate: { 
        fontSize: 12, 
        color: COLORS.textSecondary, 
        marginBottom: 10, 
        fontWeight: "600",
    },

    // Success Message
    successMessage: {
        position: "absolute",
        bottom: 40,
        left: 20,
        right: 20,
        backgroundColor: COLORS.success,
        borderRadius: 12,
        padding: 16,
        flexDirection: "row",
        alignItems: "center",
        shadowColor: "#000",
        shadowOpacity: 0.3,
        shadowOffset: { width: 0, height: 4 },
        shadowRadius: 8,
        elevation: 6,
    },
    successText: {
        color: "#fff",
        fontSize: 15,
        fontWeight: "600",
        marginLeft: 10,
    },

    // Editor Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.3)",
    },
    modalContainer: {
        flex: 1,
        backgroundColor: COLORS.backgroundBase,
        padding: 20,
        paddingTop: Platform.OS === "android" ? 40 : 60,
    },
    modalHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 15,
    },
    modalTitle: { 
        fontSize: 24, 
        fontWeight: "700", 
        color: COLORS.textPrimary,
        letterSpacing: -0.4,
    },
    modalSubtitle: { 
        fontSize: 12, 
        color: COLORS.textSecondary, 
        marginTop: 4,
        fontWeight: "600",
    },
    titleInputContainer: {
        marginBottom: 15,
    },
    titleInput: {
        backgroundColor: COLORS.card,
        paddingHorizontal: 15,
        paddingVertical: 16,
        fontSize: 20,
        fontWeight: "bold",
        color: COLORS.textPrimary,
        borderRadius: 12,
        borderWidth: 0.5,
        borderColor: COLORS.accentBlush + "22",
        shadowColor: COLORS.nudeShadow,
        shadowOpacity: 1,
        shadowOffset: { width: 0, height: 6 },
        shadowRadius: 14,
        elevation: 3,
    },
    characterCount: {
        position: 'absolute',
        right: 12,
        bottom: -20,
        fontSize: 12,
        color: COLORS.textSecondary,
        fontWeight: "600",
    },
    toolbarContainer: {
        marginBottom: 15,
        marginTop: 5,
    },
    toolbarLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: COLORS.textSecondary,
        marginBottom: 8,
        marginLeft: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    richToolbar: {
        backgroundColor: COLORS.card,
        borderWidth: 0.5,
        borderColor: COLORS.accentBlush + "22",
        borderRadius: 12,
        paddingVertical: 8,
        paddingHorizontal: 6,
        shadowColor: COLORS.nudeShadow,
        shadowOpacity: 1,
        shadowOffset: { width: 0, height: 6 },
        shadowRadius: 14,
        elevation: 3,
        minHeight: 50,
    },
    toolbarIconContainer: {
        width: 36,
        height: 36,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 8,
        marginHorizontal: 2,
    },
    toolbarText: {
        fontSize: 18,
        color: COLORS.textSecondary,
    },
    editorScrollView: {
        flex: 1,
        marginBottom: 5,
    },
    editorScrollContent: {
        flexGrow: 1,
    },
    richEditor: {
        flex: 1,
        backgroundColor: COLORS.card,
        color: COLORS.textPrimary,
        borderColor: COLORS.accentBlush + "22",
        borderWidth: 0.5,
        borderRadius: 12,
        minHeight: 350,
        shadowColor: COLORS.nudeShadow,
        shadowOpacity: 1,
        shadowOffset: { width: 0, height: 6 },
        shadowRadius: 14,
        elevation: 3,
    },
    editorFooter: {
        paddingVertical: 8,
        paddingHorizontal: 4,
    },
    editorHelper: {
        fontSize: 12,
        color: COLORS.textSecondary,
        fontStyle: 'italic',
        textAlign: 'center',
    },
    saveButton: {
        backgroundColor: COLORS.textPrimary,
        borderRadius: 12,
        paddingVertical: 15,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        marginTop: 10,
        shadowColor: COLORS.nudeShadow,
        shadowOpacity: 1,
        shadowOffset: { width: 0, height: 8 },
        shadowRadius: 16,
        elevation: 6,
    },
    saveButtonDisabled: {
        backgroundColor: COLORS.completedText,
    },
    saveButtonText: { 
        color: "#fff", 
        fontSize: 17, 
        fontWeight: "700",
    },

    // Confirmation Modal Styles
    confirmModalOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    confirmModalContainer: {
        width: '85%',
        backgroundColor: COLORS.card,
        borderRadius: 18,
        padding: 25,
        alignItems: 'center',
        shadowColor: COLORS.nudeShadow,
        shadowOpacity: 1,
        shadowOffset: { width: 0, height: 12 },
        shadowRadius: 20,
        elevation: 10,
    },
    confirmIconContainer: {
        marginBottom: 15,
    },
    confirmModalTitle: {
        fontSize: 20,
        fontWeight: "700",
        color: COLORS.textPrimary,
        marginBottom: 10,
        letterSpacing: -0.3,
    },
    confirmModalText: {
        fontSize: 15,
        textAlign: 'center',
        marginBottom: 25,
        color: COLORS.textSecondary,
        lineHeight: 22,
    },
    confirmModalButtons: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
    },
    confirmButton: {
        flex: 1,
        padding: 14,
        borderRadius: 12,
        alignItems: 'center',
        marginHorizontal: 5,
        shadowColor: COLORS.nudeShadow,
        shadowOpacity: 0.8,
        shadowOffset: { width: 0, height: 6 },
        shadowRadius: 12,
        elevation: 4,
    },
    deleteConfirmButton: {
        backgroundColor: COLORS.error,
    },
    cancelConfirmButton: {
        backgroundColor: COLORS.textSecondary,
    },
    confirmButtonText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 16,
    },
    cancelButtonText: {
        color: COLORS.card,
        fontWeight: '700',
        fontSize: 16,
    }
});