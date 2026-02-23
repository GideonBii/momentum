// screens/NotesScreen.js
// 🎯 ENHANCED NOTES SCREEN - FIXED IMPORTS
// ✅ All imports properly included
// ✅ Better visual feedback for formatting
// ✅ No metadata - clean interface
// ✅ No ScrollView nesting error (using FlatList)

import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BlurView } from 'expo-blur';
import * as Haptics from "expo-haptics";
import { LinearGradient } from 'expo-linear-gradient';
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
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView, // ✅ FIXED: ScrollView is now imported
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { RichEditor, RichToolbar, actions } from "react-native-pell-rich-editor";
import { HTMLElementModel } from "react-native-render-html";
import { useApp } from "../context/AppContext";
import { db } from "../firebaseConfig";

const { width, height } = Dimensions.get("window");

/* ================================================================================
   🎨 COLORS - Enhanced for better visual feedback
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
    
    // 🎯 ENHANCED FORMATTING COLORS - Much more visible
    formatActive: "#D64545", // Bold red when active
    formatInactive: "#8B6F63", // Warm brown when inactive
    formatBackground: "#F5E6E4", // Light blush background for active state
    toolbarActiveBg: "#D8A39D", // Blush background for active button
};

/* ================================================================================
   📝 HTML RENDERING CONFIG - Optimized
   ================================================================================ */

const customHTMLElementModels = {
    input: HTMLElementModel.fromCustomModel({
        tagName: 'input',
        contentModel: 'mixed',
        isOpaque: false,
    })
};

const checkboxRenderer = ({ tnode, key }) => {
    const { type, checked } = tnode.attributes;
    
    if (type === 'checkbox') {
        const isChecked = checked !== undefined;
        
        return (
            <View key={key} style={styles.checkboxContainer}>
                <View style={[
                    styles.checkbox,
                    isChecked && styles.checkboxChecked
                ]}>
                    {isChecked && (
                        <Ionicons name="checkmark" size={12} color="#fff" />
                    )}
                </View>
            </View>
        );
    }
    return null;
};

const listItemRenderer = ({ tnode, key, style }) => {
    const hasCheckbox = tnode.domNode?.children?.some(child => 
        child.name === 'input' && child.attribs?.type === 'checkbox'
    );

    if (hasCheckbox) {
        const extractTextFromNode = (node) => {
            if (!node) return '';
            if (node.name === '#text') return node.data || '';
            if (node.name === 'span' && node.children) {
                return node.children.map(child => extractTextFromNode(child)).join('');
            }
            if (node.children) {
                return node.children.map(child => extractTextFromNode(child)).join('');
            }
            return '';
        };

        const textNodes = tnode.domNode.children
            .filter(child => child.name !== 'input')
            .map(child => extractTextFromNode(child))
            .join(' ')
            .trim();

        return (
            <View key={key} style={[style, styles.checklistItem]}>
                <View style={styles.checkboxContainer}>
                    <View style={[
                        styles.checkbox,
                        tnode.domNode.children.some(child => 
                            child.name === 'input' && child.attribs?.checked !== undefined
                        ) && styles.checkboxChecked
                    ]}>
                        {tnode.domNode.children.some(child => 
                            child.name === 'input' && child.attribs?.checked !== undefined
                        ) && (
                            <Ionicons name="checkmark" size={12} color="#fff" />
                        )}
                    </View>
                </View>
                <Text style={styles.checklistText}>
                    {textNodes || 'Checklist item'}
                </Text>
            </View>
        );
    }

    const extractText = (node) => {
        if (!node) return '';
        if (node.data) return node.data;
        if (node.children) {
            return node.children
                .map(child => extractText(child))
                .join('');
        }
        return '';
    };

    const textContent = tnode.domNode.children
        ? tnode.domNode.children.map(child => extractText(child)).join('').trim()
        : '';

    if (!textContent) return null;

    return (
        <View key={key} style={[style, styles.defaultListItem]}>
            <Text style={styles.defaultListText}>
                • {textContent}
            </Text>
        </View>
    );
};

const htmlTagsStyles = {
    body: { 
        fontSize: 16, 
        color: COLORS.textPrimary,
        lineHeight: 24,
        fontFamily: Platform.OS === 'ios' ? '-apple-system' : 'system-ui',
    },
    p: { 
        marginBottom: 8, 
        marginTop: 0,
        color: COLORS.textPrimary,
    },
    ul: { 
        margin: 0, 
        paddingLeft: 16,
        listStyleType: 'disc',
    },
    ol: { 
        margin: 0, 
        paddingLeft: 16,
    },
    li: { 
        marginBottom: 4,
        color: COLORS.textPrimary,
    },
    strong: {
        fontWeight: '700',
        color: COLORS.textPrimary,
    },
    em: {
        fontStyle: 'italic',
        color: COLORS.textPrimary,
    },
    u: {
        textDecorationLine: 'underline',
        color: COLORS.textPrimary,
    },
};

const customRenderers = {
    input: checkboxRenderer,
    li: listItemRenderer
};

/* ================================================================================
   🎯 NOTE CARD - Clean, no metadata
   ================================================================================ */

const NoteCard = ({ note, onPress, onEdit, onDelete, viewMode }) => {
    const scaleAnim = useRef(new Animated.Value(1)).current;
    
    const handlePressIn = () => {
        Animated.spring(scaleAnim, {
            toValue: 0.98,
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
    
    // Strip HTML tags and get plain text preview
    const getPlainText = (html) => {
        if (!html) return "";
        return html
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    };
    
    const plainText = getPlainText(note.content);
    const previewText = plainText || "No content";

    return (
        <Animated.View 
            style={[
                styles.noteCard,
                viewMode === 'grid' ? styles.noteCardGrid : styles.noteCardList,
                { transform: [{ scale: scaleAnim }] }
            ]}
        >
            <BlurView intensity={90} tint="light" style={styles.noteCardBlur}>
                <TouchableOpacity
                    activeOpacity={0.9}
                    onPressIn={handlePressIn}
                    onPressOut={handlePressOut}
                    onPress={() => onPress(note)}
                    onLongPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                        onEdit(note);
                    }}
                    delayLongPress={500}
                    style={styles.noteCardTouchable}
                >
                    <View style={styles.noteCardHeader}>
                        {/* Accent stripe - color based on content type */}
                        <View style={[
                            styles.noteAccent, 
                            { 
                                backgroundColor: note.content?.includes('checkbox') 
                                    ? COLORS.sage 
                                    : COLORS.accentBlush 
                            }
                        ]} />
                        
                        <View style={styles.noteContent}>
                            {/* Title - Only essential info */}
                            <Text style={styles.noteTitle} numberOfLines={1}>
                                {note.title || "Untitled Note"}
                            </Text>
                            
                            {/* Preview text - Clean preview */}
                            <Text style={styles.notePreviewText} numberOfLines={viewMode === 'grid' ? 3 : 2}>
                                {previewText}
                            </Text>
                        </View>
                    </View>
                </TouchableOpacity>
                
                {/* Action buttons - Clean overlay */}
                <View style={styles.noteActionsOverlay}>
                    <TouchableOpacity
                        onPress={(e) => {
                            e.stopPropagation();
                            onEdit(note);
                        }}
                        style={styles.noteActionButton}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <Ionicons name="create-outline" size={16} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={(e) => {
                            e.stopPropagation();
                            onDelete(note);
                        }}
                        style={styles.noteActionButton}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
                    </TouchableOpacity>
                </View>
            </BlurView>
        </Animated.View>
    );
};

/* ================================================================================
   🎯 QUICK ADD BAR - iPhone Notes Style
   ================================================================================ */

const QuickAddBar = ({ onAdd }) => {
    const [text, setText] = useState("");
    const [isFocused, setIsFocused] = useState(false);
    const scaleAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        Animated.spring(scaleAnim, {
            toValue: isFocused ? 1.02 : 1,
            useNativeDriver: true,
            friction: 8,
        }).start();
    }, [isFocused]);

    const handleSubmit = () => {
        if (text.trim()) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onAdd({
                title: text.trim(),
                content: "<p></p>",
            });
            setText("");
        }
    };

    return (
        <Animated.View style={[styles.quickAddContainer, { transform: [{ scale: scaleAnim }] }]}>
            <BlurView intensity={90} tint="light" style={styles.quickAddBlur}>
                <View style={styles.quickAddInner}>
                    <Ionicons name="create-outline" size={24} color={COLORS.accentBlush} />
                    
                    <TextInput
                        style={styles.quickAddInput}
                        placeholder="New note..."
                        placeholderTextColor={COLORS.placeholder}
                        value={text}
                        onChangeText={setText}
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => setIsFocused(false)}
                        onSubmitEditing={handleSubmit}
                        returnKeyType="done"
                    />
                    
                    {text.length > 0 && (
                        <TouchableOpacity onPress={handleSubmit} style={styles.quickAddSubmit}>
                            <LinearGradient
                                colors={[COLORS.accentBlush, COLORS.accentWarm]}
                                style={styles.quickAddSubmitGradient}
                            >
                                <Ionicons name="arrow-forward" size={20} color="white" />
                            </LinearGradient>
                        </TouchableOpacity>
                    )}
                </View>
            </BlurView>
        </Animated.View>
    );
};

/* ================================================================================
   🏆 MAIN NOTES SCREEN - FIXED: All imports included
   ================================================================================ */

export default function NotesScreen() {
    const { user } = useApp();
    
    // State
    const [notes, setNotes] = useState([]);
    const [filteredNotes, setFilteredNotes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isFormVisible, setIsFormVisible] = useState(false);
    const [currentNote, setCurrentNote] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [sortOrder, setSortOrder] = useState("newest");
    const [viewMode, setViewMode] = useState("list");
    
    // Form state
    const [noteTitle, setNoteTitle] = useState("");
    const [noteContent, setNoteContent] = useState("");
    
    // Delete confirmation
    const [isConfirmVisible, setIsConfirmVisible] = useState(false);
    const [noteToDelete, setNoteToDelete] = useState(null);
    
    // Editor state - 🎯 Track active formats for better visual feedback
    const [activeFormats, setActiveFormats] = useState({
        bold: false,
        italic: false,
        underline: false,
    });
    
    // Refs
    const richText = useRef();
    const scrollY = useRef(new Animated.Value(0)).current;
    const isMounted = useRef(true);
    const flatListRef = useRef();
    
    // Draft state
    const [draftTitle, setDraftTitle] = useState("");
    const [draftContent, setDraftContent] = useState("");

    // Memoized HTML render props
    const htmlRenderProps = useMemo(() => ({
        contentWidth: width - 72,
        tagsStyles: htmlTagsStyles,
        customHTMLElementModels,
        renderers: customRenderers,
        defaultTextProps: { selectable: false },
        enableExperimentalMarginCollapsing: true,
        systemFonts: ['-apple-system', 'system-ui'],
    }), []);

    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    const isSaveDisabled = useMemo(() => {
        return !noteTitle.trim() && !noteContent.trim();
    }, [noteTitle, noteContent]);

    /* ================================================================================
       🔥 FIRESTORE LISTENER
       ================================================================================ */

    useEffect(() => {
        if (!user) {
            setNotes([]);
            setLoading(false);
            return;
        }

        const q = query(
            collection(db, "notes"),
            where("userId", "==", user.uid)
        );

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const noteList = snapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        ...data,
                        createdAt: data.createdAt?.toDate?.() || data.createdAt || new Date(),
                        updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
                    };
                });

                noteList.sort((a, b) => b.createdAt - a.createdAt);

                if (isMounted.current) {
                    setNotes(noteList);
                    setLoading(false);
                    
                    // Cache notes
                    AsyncStorage.setItem(`notes_cache_${user.uid}`, JSON.stringify(noteList)).catch(console.error);
                }
            },
            (error) => {
                console.error("Notes listener error:", error);
                if (isMounted.current) {
                    setLoading(false);
                }
            }
        );

        return () => unsubscribe();
    }, [user]);

    /* ================================================================================
       🔍 FILTERING & SEARCH
       ================================================================================ */

    useEffect(() => {
        let filtered = [...notes];
        
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(n => {
                const title = n.title?.toLowerCase() || "";
                const content = n.content?.toLowerCase() || "";
                return title.includes(query) || content.includes(query);
            });
        }
        
        filtered.sort((a, b) => {
            if (sortOrder === "newest") {
                return b.createdAt - a.createdAt;
            } else {
                return a.createdAt - b.createdAt;
            }
        });
        
        setFilteredNotes(filtered);
    }, [notes, searchQuery, sortOrder]);

    /* ================================================================================
       🎯 NOTE OPERATIONS
       ================================================================================ */

    const showMessage = useCallback((message) => {
        Alert.alert(message);
    }, []);

    const handleQuickAdd = async ({ title, content }) => {
        if (!user) return;
        
        try {
            await addDoc(collection(db, "notes"), {
                title: title.trim(),
                content: content || "<p></p>",
                userId: user.uid,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
            
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch (error) {
            console.error("Quick add error:", error);
            Alert.alert("Error", "Failed to create note");
        }
    };

    const handleSaveNote = async () => {
        if (isSaveDisabled) {
            Alert.alert("Error", "Please enter a title or content");
            return;
        }
        
        if (!user) return;
        
        setLoading(true);
        
        try {
            if (currentNote) {
                await updateDoc(doc(db, "notes", currentNote.id), {
                    title: noteTitle.trim() || "Untitled Note",
                    content: noteContent || "<p></p>",
                    updatedAt: serverTimestamp(),
                });
                
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } else {
                await addDoc(collection(db, "notes"), {
                    title: noteTitle.trim() || "Untitled Note",
                    content: noteContent || "<p></p>",
                    userId: user.uid,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                });
                
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                
                // Clear draft
                setDraftTitle("");
                setDraftContent("");
            }
            
            setIsFormVisible(false);
            resetForm();
        } catch (error) {
            console.error("Save note error:", error);
            Alert.alert("Error", "Failed to save note");
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setCurrentNote(null);
        setNoteTitle("");
        setNoteContent("");
        setActiveFormats({ bold: false, italic: false, underline: false });
    };

    const handleEditNote = (note) => {
        setCurrentNote(note);
        setNoteTitle(note.title || "");
        setNoteContent(note.content || "");
        setIsFormVisible(true);
    };

    const handleDeleteNote = async () => {
        if (!noteToDelete) return;
        
        try {
            await deleteDoc(doc(db, "notes", noteToDelete.id));
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setIsConfirmVisible(false);
            setNoteToDelete(null);
        } catch (error) {
            console.error("Delete note error:", error);
            Alert.alert("Error", "Failed to delete note");
        }
    };

    const confirmDelete = (note) => {
        setNoteToDelete(note);
        setIsConfirmVisible(true);
    };

    const toggleSortOrder = () => {
        setSortOrder(sortOrder === "newest" ? "oldest" : "newest");
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const clearSearch = () => {
        setSearchQuery("");
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    // 🎯 Handle editor initialization and format tracking
    const handleEditorInitialized = () => {
        // You can add format tracking logic here if needed
    };

    // 🎯 FlatList render item
    const renderNoteItem = ({ item }) => (
        <NoteCard
            note={item}
            onPress={handleEditNote}
            onEdit={handleEditNote}
            onDelete={confirmDelete}
            viewMode={viewMode}
        />
    );

    /* ================================================================================
       🎨 RENDER
       ================================================================================ */

    const headerHeight = scrollY.interpolate({
        inputRange: [0, 100],
        outputRange: [Platform.OS === 'ios' ? 140 : 120, 100],
        extrapolate: 'clamp',
    });

    const headerTitleSize = scrollY.interpolate({
        inputRange: [0, 100],
        outputRange: [32, 24],
        extrapolate: 'clamp',
    });

    return (
        <View style={styles.screen}>
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.backgroundBase} />
            
            {/* Animated Header */}
            <Animated.View style={[styles.header, { height: headerHeight }]}>
                <LinearGradient
                    colors={[COLORS.gradientStart, COLORS.gradientEnd]}
                    style={StyleSheet.absoluteFill}
                />
                
                <View style={styles.headerContent}>
                    <View style={styles.headerTop}>
                        <View>
                            <Animated.Text style={[styles.headerTitle, { fontSize: headerTitleSize }]}>
                                Notes
                            </Animated.Text>
                            <Text style={styles.headerSubtitle}>
                                {notes.length} {notes.length === 1 ? 'note' : 'notes'}
                            </Text>
                        </View>
                        
                        <View style={styles.headerRight}>
                            <View style={styles.viewModeToggle}>
                                <TouchableOpacity
                                    style={[styles.viewModeButton, viewMode === 'list' && styles.viewModeButtonActive]}
                                    onPress={() => setViewMode('list')}
                                >
                                    <Ionicons 
                                        name="list" 
                                        size={20} 
                                        color={viewMode === 'list' ? COLORS.accentBlush : COLORS.textTertiary} 
                                    />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.viewModeButton, viewMode === 'grid' && styles.viewModeButtonActive]}
                                    onPress={() => setViewMode('grid')}
                                >
                                    <Ionicons 
                                        name="grid" 
                                        size={20} 
                                        color={viewMode === 'grid' ? COLORS.accentBlush : COLORS.textTertiary} 
                                    />
                                </TouchableOpacity>
                            </View>
                            
                            <TouchableOpacity 
                                style={styles.addButton}
                                onPress={() => {
                                    resetForm();
                                    setIsFormVisible(true);
                                }}
                            >
                                <LinearGradient
                                    colors={[COLORS.accentBlush, COLORS.accentWarm]}
                                    style={styles.addButtonGradient}
                                >
                                    <Ionicons name="add" size={24} color="white" />
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    </View>
                    
                    {/* Search Bar */}
                    <View style={styles.searchContainer}>
                        <Ionicons name="search" size={18} color={COLORS.textTertiary} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Search notes..."
                            placeholderTextColor={COLORS.placeholder}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                        {searchQuery ? (
                            <TouchableOpacity onPress={clearSearch}>
                                <Ionicons name="close-circle" size={18} color={COLORS.textTertiary} />
                            </TouchableOpacity>
                        ) : null}
                    </View>
                </View>
            </Animated.View>
            
            {/* Sort Bar - Clean */}
            <View style={styles.sortBar}>
                <Text style={styles.sortLabel}>Sort by:</Text>
                <TouchableOpacity 
                    style={styles.sortButton} 
                    onPress={toggleSortOrder}
                >
                    <Text style={styles.sortButtonText}>
                        {sortOrder === "newest" ? "Newest first" : "Oldest first"}
                    </Text>
                    <Ionicons
                        name={sortOrder === 'newest' ? "arrow-down" : "arrow-up"}
                        size={16}
                        color={COLORS.sage}
                    />
                </TouchableOpacity>
            </View>
            
            {/* 🎯 FIXED: Using FlatList instead of ScrollView - NO NESTING ERROR */}
            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={COLORS.accentBlush} />
                    <Text style={styles.loadingText}>Loading your notes...</Text>
                </View>
            ) : filteredNotes.length === 0 ? (
                <View style={styles.emptyState}>
                    <View style={styles.emptyStateIcon}>
                        <Ionicons name="document-text-outline" size={64} color={COLORS.textTertiary} />
                    </View>
                    <Text style={styles.emptyTitle}>
                        {searchQuery ? "No notes found" : "No notes yet"}
                    </Text>
                    <Text style={styles.emptyText}>
                        {searchQuery 
                            ? "Try a different search term" 
                            : "Create your first note to get started"}
                    </Text>
                    <TouchableOpacity
                        style={styles.emptyButton}
                        onPress={() => {
                            resetForm();
                            setIsFormVisible(true);
                        }}
                    >
                        <LinearGradient
                            colors={[COLORS.accentBlush, COLORS.accentWarm]}
                            style={styles.emptyButtonGradient}
                        >
                            <Ionicons name="add" size={20} color="white" />
                            <Text style={styles.emptyButtonText}>Create Note</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlatList
                    ref={flatListRef}
                    data={filteredNotes}
                    renderItem={renderNoteItem}
                    keyExtractor={(item) => item.id}
                    numColumns={viewMode === 'grid' ? 2 : 1}
                    key={viewMode} // Force re-render when view mode changes
                    contentContainerStyle={styles.notesListContent}
                    showsVerticalScrollIndicator={false}
                    onScroll={Animated.event(
                        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                        { useNativeDriver: false }
                    )}
                    scrollEventThrottle={16}
                    ListFooterComponent={<View style={{ height: 100 }} />}
                />
            )}
            
            {/* Quick Add Bar */}
            {viewMode === 'list' && !loading && filteredNotes.length > 0 && (
                <QuickAddBar onAdd={handleQuickAdd} />
            )}
            
            {/* ================================================================================
               📝 NOTE EDITOR MODAL - ENHANCED FORMATTING VISIBILITY
               ================================================================================ */}
            
            <Modal
                visible={isFormVisible}
                animationType="slide"
                transparent
                onRequestClose={() => setIsFormVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
                    
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={styles.modalKeyboard}
                        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
                    >
                        <View style={styles.modalContainer}>
                            {/* Modal Header */}
                            <View style={styles.modalHeader}>
                                <TouchableOpacity
                                    onPress={() => {
                                        setIsFormVisible(false);
                                        resetForm();
                                    }}
                                    style={styles.modalCancelButton}
                                >
                                    <Text style={styles.modalCancelText}>Cancel</Text>
                                </TouchableOpacity>
                                
                                <Text style={styles.modalTitle}>
                                    {currentNote ? "Edit Note" : "New Note"}
                                </Text>
                                
                                <TouchableOpacity
                                    onPress={handleSaveNote}
                                    disabled={isSaveDisabled || loading}
                                    style={[
                                        styles.modalDoneButton,
                                        (isSaveDisabled || loading) && styles.modalDoneButtonDisabled
                                    ]}
                                >
                                    {loading ? (
                                        <ActivityIndicator size="small" color={COLORS.sage} />
                                    ) : (
                                        <Text style={[
                                            styles.modalDoneText,
                                            isSaveDisabled && styles.modalDoneTextDisabled
                                        ]}>
                                            Save
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                            
                            {/* Title Input */}
                            <View style={styles.titleSection}>
                                <TextInput
                                    style={styles.titleInput}
                                    placeholder="Title"
                                    placeholderTextColor={COLORS.placeholder}
                                    value={noteTitle}
                                    onChangeText={setNoteTitle}
                                    maxLength={200}
                                    autoFocus={!currentNote}
                                />
                            </View>
                            
                            {/* 🎯 ENHANCED FORMATTING TOOLBAR - Much better visual feedback */}
                            <View style={styles.toolbarWrapper}>
                                <ScrollView 
                                    horizontal 
                                    showsHorizontalScrollIndicator={false}
                                    contentContainerStyle={styles.toolbarScrollContent}
                                >
                                    <RichToolbar
                                        editor={richText}
                                        actions={[
                                            actions.setBold,
                                            actions.setItalic,
                                            actions.setUnderline,
                                            actions.insertBulletsList,
                                            actions.insertOrderedList,
                                            actions.checkboxList,
                                            'separator',
                                            actions.undo,
                                            actions.redo,
                                        ]}
                                        iconMap={{
                                            [actions.setBold]: ({ tintColor }) => (
                                                <View style={[
                                                    styles.toolbarIconContainer,
                                                    activeFormats.bold && styles.toolbarIconContainerActive
                                                ]}>
                                                    <Text style={[
                                                        styles.toolbarText,
                                                        { color: activeFormats.bold ? '#FFFFFF' : COLORS.formatInactive },
                                                        styles.toolbarTextBold
                                                    ]}>B</Text>
                                                </View>
                                            ),
                                            [actions.setItalic]: ({ tintColor }) => (
                                                <View style={[
                                                    styles.toolbarIconContainer,
                                                    activeFormats.italic && styles.toolbarIconContainerActive
                                                ]}>
                                                    <Text style={[
                                                        styles.toolbarText,
                                                        { color: activeFormats.italic ? '#FFFFFF' : COLORS.formatInactive },
                                                        styles.toolbarTextItalic
                                                    ]}>I</Text>
                                                </View>
                                            ),
                                            [actions.setUnderline]: ({ tintColor }) => (
                                                <View style={[
                                                    styles.toolbarIconContainer,
                                                    activeFormats.underline && styles.toolbarIconContainerActive
                                                ]}>
                                                    <Text style={[
                                                        styles.toolbarText,
                                                        { color: activeFormats.underline ? '#FFFFFF' : COLORS.formatInactive },
                                                        styles.toolbarTextUnderline
                                                    ]}>U</Text>
                                                </View>
                                            ),
                                            [actions.insertBulletsList]: ({ tintColor }) => (
                                                <View style={[
                                                    styles.toolbarIconContainer,
                                                    tintColor === COLORS.formatActive && styles.toolbarIconContainerActive
                                                ]}>
                                                    <Ionicons 
                                                        name="list-outline" 
                                                        size={22} 
                                                        color={tintColor === COLORS.formatActive ? '#FFFFFF' : COLORS.formatInactive} 
                                                    />
                                                </View>
                                            ),
                                            [actions.insertOrderedList]: ({ tintColor }) => (
                                                <View style={[
                                                    styles.toolbarIconContainer,
                                                    tintColor === COLORS.formatActive && styles.toolbarIconContainerActive
                                                ]}>
                                                    <Ionicons 
                                                        name="list" 
                                                        size={22} 
                                                        color={tintColor === COLORS.formatActive ? '#FFFFFF' : COLORS.formatInactive} 
                                                    />
                                                </View>
                                            ),
                                            [actions.checkboxList]: ({ tintColor }) => (
                                                <View style={[
                                                    styles.toolbarIconContainer,
                                                    tintColor === COLORS.formatActive && styles.toolbarIconContainerActive
                                                ]}>
                                                    <Ionicons 
                                                        name="checkbox-outline" 
                                                        size={22} 
                                                        color={tintColor === COLORS.formatActive ? '#FFFFFF' : COLORS.formatInactive} 
                                                    />
                                                </View>
                                            ),
                                            [actions.undo]: ({ tintColor }) => (
                                                <View style={styles.toolbarIconContainer}>
                                                    <Ionicons name="arrow-undo" size={20} color={COLORS.formatInactive} />
                                                </View>
                                            ),
                                            [actions.redo]: ({ tintColor }) => (
                                                <View style={styles.toolbarIconContainer}>
                                                    <Ionicons name="arrow-redo" size={20} color={COLORS.formatInactive} />
                                                </View>
                                            ),
                                            'separator': () => (
                                                <View style={styles.toolbarSeparator} />
                                            ),
                                        }}
                                        style={styles.richToolbar}
                                        selectedIconTint={COLORS.formatActive}
                                        iconTint={COLORS.formatInactive}
                                        onPressAddImage={() => {}}
                                    />
                                </ScrollView>
                            </View>
                            
                            {/* Rich Text Editor */}
                            <View style={styles.editorContainer}>
                                <RichEditor
                                    ref={richText}
                                    style={styles.richEditor}
                                    placeholder="Start writing..."
                                    placeholderTextColor={COLORS.placeholder}
                                    initialContentHTML={noteContent}
                                    onChange={setNoteContent}
                                    onInitialized={handleEditorInitialized}
                                    editorStyle={{
                                        backgroundColor: COLORS.card,
                                        color: COLORS.textPrimary,
                                        placeholderColor: COLORS.placeholder,
                                        contentCSSText: `
                                            font-size: 17px;
                                            line-height: 1.6;
                                            padding: 16px;
                                            font-family: -apple-system, system-ui;
                                            color: ${COLORS.textPrimary};
                                        `
                                    }}
                                    useContainer={false}
                                />
                            </View>
                            
                            {/* Simple Footer - No metadata */}
                            <View style={styles.editorFooter}>
                                <Text style={styles.editorHelper}>
                                    <Ionicons name="information-circle-outline" size={14} color={COLORS.textTertiary} /> 
                                    {' '}Tap to format, double-tap to select
                                </Text>
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>
            
            {/* Delete Confirmation Modal */}
            <Modal
                visible={isConfirmVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setIsConfirmVisible(false)}
            >
                <View style={styles.confirmOverlay}>
                    <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
                    <View style={styles.confirmContainer}>
                        <View style={styles.confirmIcon}>
                            <Ionicons name="warning" size={48} color={COLORS.danger} />
                        </View>
                        <Text style={styles.confirmTitle}>Delete Note?</Text>
                        <Text style={styles.confirmText}>
                            This action cannot be undone. The note will be permanently deleted.
                        </Text>
                        <View style={styles.confirmButtons}>
                            <TouchableOpacity
                                style={[styles.confirmButton, styles.cancelButton]}
                                onPress={() => setIsConfirmVisible(false)}
                            >
                                <Text style={styles.cancelButtonText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.confirmButton, styles.deleteButton]}
                                onPress={handleDeleteNote}
                            >
                                <Text style={styles.deleteButtonText}>Delete</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

/* ================================================================================
   🎨 STYLES - ENHANCED FORMATTING VISIBILITY
   ================================================================================ */

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: COLORS.backgroundBase,
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
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'ios' ? 50 : 18,
        paddingBottom: 16,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    headerTitle: {
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
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    
    // View Mode Toggle
    viewModeToggle: {
        flexDirection: 'row',
        backgroundColor: COLORS.surfaceVariant,
        borderRadius: 20,
        padding: 4,
    },
    viewModeButton: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 16,
    },
    viewModeButtonActive: {
        backgroundColor: COLORS.card,
        shadowColor: COLORS.nudeShadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.4,
        shadowRadius: 4,
        elevation: 2,
    },
    
    // Add Button
    addButton: {
        borderRadius: 24,
        overflow: 'hidden',
        shadowColor: COLORS.accentBlush,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    addButtonGradient: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
    },
    
    // Search
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.surfaceVariant,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: Platform.OS === 'ios' ? 10 : 6,
        borderWidth: 0,
    },
    searchInput: {
        flex: 1,
        marginLeft: 8,
        fontSize: 16,
        color: COLORS.textPrimary,
    },
    
    // Sort Bar
    sortBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 12,
        backgroundColor: COLORS.backgroundBase,
    },
    sortLabel: {
        fontSize: 13,
        color: COLORS.textSecondary,
        fontWeight: '600',
    },
    sortButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.card,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        gap: 8,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
    },
    sortButtonText: {
        fontSize: 13,
        color: COLORS.sage,
        fontWeight: '600',
    },
    
    // Notes List - Using FlatList now
    notesListContent: {
        paddingHorizontal: 20,
        paddingTop: 8,
    },
    
    // Note Card - Clean, no metadata
    noteCard: {
        marginBottom: 12,
        borderRadius: 16,
        overflow: 'hidden',
        shadowColor: COLORS.nudeShadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 3,
    },
    noteCardList: {
        width: '100%',
    },
    noteCardGrid: {
        width: (width - 52) / 2,
    },
    noteCardBlur: {
        borderRadius: 16,
        overflow: 'hidden',
    },
    noteCardTouchable: {
        flex: 1,
    },
    noteCardHeader: {
        flexDirection: 'row',
    },
    noteAccent: {
        width: 4,
        height: '100%',
    },
    noteContent: {
        flex: 1,
        padding: 16,
    },
    noteTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: COLORS.textPrimary,
        marginBottom: 6,
    },
    notePreviewText: {
        fontSize: 14,
        color: COLORS.textTertiary,
        lineHeight: 20,
    },
    noteActionsOverlay: {
        position: 'absolute',
        top: 12,
        right: 12,
        flexDirection: 'row',
        gap: 8,
        backgroundColor: COLORS.card + 'CC',
        borderRadius: 20,
        padding: 4,
    },
    noteActionButton: {
        padding: 6,
        borderRadius: 16,
    },
    
    // Quick Add
    quickAddContainer: {
        position: 'absolute',
        bottom: 20,
        left: 20,
        right: 20,
        zIndex: 100,
    },
    quickAddBlur: {
        borderRadius: 30,
        overflow: 'hidden',
    },
    quickAddInner: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: Platform.OS === 'ios' ? 12 : 8,
        backgroundColor: COLORS.card,
        borderRadius: 30,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
    },
    quickAddInput: {
        flex: 1,
        marginLeft: 12,
        fontSize: 16,
        color: COLORS.textPrimary,
    },
    quickAddSubmit: {
        marginLeft: 8,
        borderRadius: 20,
        overflow: 'hidden',
    },
    quickAddSubmitGradient: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
    },
    
    // Loading
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingText: {
        marginTop: 12,
        fontSize: 16,
        color: COLORS.textSecondary,
        fontWeight: '500',
    },
    
    // Empty State
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 20,
    },
    emptyStateIcon: {
        marginBottom: 16,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: COLORS.textPrimary,
        marginBottom: 8,
    },
    emptyText: {
        fontSize: 15,
        color: COLORS.textTertiary,
        textAlign: 'center',
        marginBottom: 24,
        paddingHorizontal: 40,
    },
    emptyButton: {
        borderRadius: 30,
        overflow: 'hidden',
        shadowColor: COLORS.accentBlush,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    emptyButtonGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingVertical: 14,
        gap: 8,
    },
    emptyButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '700',
    },
    
    // Checklist Styles
    checklistItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 4,
    },
    checkboxContainer: {
        marginRight: 8,
        marginTop: 2,
    },
    checkbox: {
        width: 18,
        height: 18,
        borderRadius: 4,
        borderWidth: 2,
        borderColor: COLORS.textSecondary,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'transparent',
    },
    checkboxChecked: {
        backgroundColor: COLORS.accentBlush,
        borderColor: COLORS.accentBlush,
    },
    checklistText: {
        fontSize: 14,
        color: COLORS.textPrimary,
        flex: 1,
        lineHeight: 20,
    },
    defaultListItem: {
        marginBottom: 4,
    },
    defaultListText: {
        fontSize: 14,
        color: COLORS.textPrimary,
        lineHeight: 20,
    },
    
    // ==============================================================================
    // 📝 NOTE EDITOR MODAL - ENHANCED FORMATTING VISIBILITY
    // ==============================================================================
    
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    modalKeyboard: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    modalContainer: {
        flex: 1,
        backgroundColor: COLORS.card,
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
    },
    
    // Modal Header
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.cardBorder,
    },
    modalCancelButton: {
        paddingVertical: 8,
        paddingHorizontal: 4,
    },
    modalCancelText: {
        fontSize: 17,
        color: COLORS.accentBlush,
        fontWeight: '400',
    },
    modalTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: COLORS.textPrimary,
    },
    modalDoneButton: {
        paddingVertical: 8,
        paddingHorizontal: 4,
    },
    modalDoneButtonDisabled: {
        opacity: 0.5,
    },
    modalDoneText: {
        fontSize: 17,
        color: COLORS.sage,
        fontWeight: '600',
    },
    modalDoneTextDisabled: {
        color: COLORS.textTertiary,
    },
    
    // Title Input
    titleSection: {
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 8,
        backgroundColor: COLORS.card,
    },
    titleInput: {
        fontSize: 28,
        fontWeight: '700',
        color: COLORS.textPrimary,
        padding: 0,
        marginBottom: 4,
    },
    
    // 🎯 ENHANCED FORMATTING TOOLBAR
    toolbarWrapper: {
        borderTopWidth: 1,
        borderTopColor: COLORS.cardBorder,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.cardBorder,
        backgroundColor: COLORS.surfaceVariant,
        paddingVertical: 8,
    },
    toolbarScrollContent: {
        paddingHorizontal: 16,
        gap: 4,
    },
    richToolbar: {
        backgroundColor: 'transparent',
        borderWidth: 0,
        padding: 0,
        minHeight: 44,
    },
    toolbarIconContainer: {
        width: 44,
        height: 44,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 8,
        marginHorizontal: 2,
    },
    // 🎯 ACTIVE STATE - Much more visible
    toolbarIconContainerActive: {
        backgroundColor: COLORS.formatActive,
        shadowColor: COLORS.formatActive,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 3,
    },
    toolbarText: {
        fontSize: 20,
    },
    toolbarTextBold: {
        fontWeight: '800',
    },
    toolbarTextItalic: {
        fontStyle: 'italic',
    },
    toolbarTextUnderline: {
        textDecorationLine: 'underline',
        textDecorationColor: COLORS.formatInactive,
    },
    toolbarSeparator: {
        width: 1,
        height: 24,
        backgroundColor: COLORS.cardBorder,
        marginHorizontal: 8,
    },
    
    // Editor
    editorContainer: {
        flex: 1,
        backgroundColor: COLORS.card,
    },
    richEditor: {
        flex: 1,
        backgroundColor: COLORS.card,
    },
    
    // Editor Footer - Simple, no metadata
    editorFooter: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        backgroundColor: COLORS.card,
        borderTopWidth: 1,
        borderTopColor: COLORS.cardBorder,
    },
    editorHelper: {
        fontSize: 13,
        color: COLORS.textTertiary,
        textAlign: 'center',
    },
    
    // Confirmation Modal
    confirmOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    confirmContainer: {
        width: width * 0.85,
        backgroundColor: COLORS.card,
        borderRadius: 14,
        padding: 24,
        alignItems: 'center',
        shadowColor: COLORS.nudeShadow,
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.8,
        shadowRadius: 20,
        elevation: 10,
    },
    confirmIcon: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: COLORS.danger + '15',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    confirmTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: COLORS.textPrimary,
        marginBottom: 8,
    },
    confirmText: {
        fontSize: 15,
        color: COLORS.textSecondary,
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 22,
    },
    confirmButtons: {
        flexDirection: 'row',
        width: '100%',
        gap: 12,
    },
    confirmButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
    },
    cancelButton: {
        backgroundColor: COLORS.surfaceVariant,
    },
    cancelButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: COLORS.textSecondary,
    },
    deleteButton: {
        backgroundColor: COLORS.danger,
    },
    deleteButtonText: {
        fontSize: 16,
        fontWeight: '700',
        color: 'white',
    },
});