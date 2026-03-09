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
    ScrollView,
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
import { supabase } from "../supabaseConfig";

const { width, height } = Dimensions.get("window");

/* ================================================================================
   🎨 COLORS - GREEN THEME MATCHING HOME SCREEN NOTES CARD
   ================================================================================ */

const COLORS = {
    backgroundBase: "#F5F8F6",
    card: "#FFFFFF",
    textPrimary: "#1C2E28",
    textSecondary: "#4A6B5F",
    accentBlush: "#5D8B7E",
    accentWarm: "#052b20",
    sage: "#2C4A3E",
    nudeShadow: "rgba(93,139,126,0.12)",
    shadowDark: "rgba(0,0,0,0.06)",
    danger: "#FF6347",
    success: "#5D8B7E",
    info: "#2196F3",
    warning: "#FFA726",
    surfaceVariant: "#EAF1ED",
    textTertiary: "#6B8F81",
    cardBorder: "rgba(93,139,126,0.2)",

    // ── Gradient tokens (all 3 stops defined, warm-shifted for Android) ──────
    // Pure-green gradients band on 8-bit Android panels; adding a warm ivory
    // base stop forces the GPU to blend across R+G channels, eliminating banding.
    gradientStart: "#F4FAF7", // near-white with a breath of green
    gradientMid:   "#D6EDE4", // soft sage — PREVIOUSLY MISSING (caused black fallback)
    gradientEnd:   "#C2E0D5", // muted seafoam
    gradientLight: "#E8F5EF", // lightest tint for empty-state ring — PREVIOUSLY MISSING

    // ── Header tokens (PREVIOUSLY MISSING — caused undefined-color crashes) ──
    headerText:     "#1C2E28", // legible dark green on light gradient
    headerTextSoft: "#5D8B7E", // secondary label / placeholder in header
    glassBorder:    "rgba(255,255,255,0.22)", // frosted edge on quick-add bar

    overlay: "rgba(28,46,40,0.4)",
    placeholder: "#8AA89B",

    // Formatting
    formatActive:    "#2C4A3E",
    formatInactive:  "#6B8F81",
    formatBackground:"#E0EAE4",
    toolbarActiveBg: "#5D8B7E",
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
   🎯 NOTE CARD - Clean, no metadata with green accents
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

    const wordCount = plainText.split(/\s+/).filter(Boolean).length;

    return (
        <Animated.View
            style={[
                styles.noteCard,
                viewMode === 'grid' ? styles.noteCardGrid : styles.noteCardList,
                { transform: [{ scale: scaleAnim }] }
            ]}
        >
            <TouchableOpacity
                activeOpacity={0.93}
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
                <LinearGradient
                    colors={note.content?.includes('checkbox')
                        ? [COLORS.accentBlush, COLORS.sage]
                        : [COLORS.accentBlush, COLORS.gradientMid]}
                    style={styles.noteTopBar}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                />
                <View style={styles.noteContent}>
                    <Text style={styles.noteTitle} numberOfLines={1}>
                        {note.title || "Untitled Note"}
                    </Text>
                    <Text style={styles.notePreviewText} numberOfLines={viewMode === 'grid' ? 4 : 2}>
                        {previewText}
                    </Text>
                    <View style={styles.noteFooterRow}>
                        <View style={styles.noteWordBadge}>
                            <Ionicons name="document-text-outline" size={11} color={COLORS.textTertiary} />
                            <Text style={styles.noteWordCount}>{wordCount} words</Text>
                        </View>
                        <View style={styles.noteActions}>
                            <TouchableOpacity
                                onPress={(e) => { e.stopPropagation(); onEdit(note); }}
                                style={styles.noteActionButton}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                                <Ionicons name="pencil-outline" size={15} color={COLORS.accentBlush} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={(e) => { e.stopPropagation(); onDelete(note); }}
                                style={styles.noteActionButton}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                                <Ionicons name="trash-outline" size={15} color={COLORS.danger} />
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </TouchableOpacity>
        </Animated.View>
    );
};

/* ================================================================================
   🎯 QUICK ADD BAR - iPhone Notes Style with green theme
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
            <BlurView intensity={80} tint="light" style={styles.quickAddBlur}>
                <LinearGradient
                    colors={["rgba(255,255,255,0.95)", "rgba(237,245,240,0.95)"]}
                    style={styles.quickAddInner}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                >
                    <View style={styles.quickAddIconWrap}>
                        <Ionicons name="pencil" size={16} color="#FFFFFF" />
                    </View>

                    <TextInput
                        style={styles.quickAddInput}
                        placeholder="Quick note..."
                        placeholderTextColor={COLORS.placeholder}
                        value={text}
                        onChangeText={setText}
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => setIsFocused(false)}
                        onSubmitEditing={handleSubmit}
                        returnKeyType="done"
                    />

                    {text.length > 0 && (
                        <TouchableOpacity onPress={handleSubmit} style={styles.quickAddSubmit} activeOpacity={0.8}>
                            <LinearGradient
                                colors={[COLORS.accentBlush, COLORS.sage]}
                                style={styles.quickAddSubmitGradient}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                            >
                                <Ionicons name="arrow-up" size={18} color="white" />
                            </LinearGradient>
                        </TouchableOpacity>
                    )}
                </LinearGradient>
            </BlurView>
        </Animated.View>
    );
};

/* ================================================================================
   🏆 MAIN NOTES SCREEN - Green theme matching home screen
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
       🔥 SUPABASE LISTENER
       ================================================================================ */

    useEffect(() => {
        if (!user) {
            setNotes([]);
            setLoading(false);
            return;
        }

        const fetchNotes = async () => {
            if (!isMounted.current) return;
            const { data, error } = await supabase
                .from("notes")
                .select("*")
                .eq("user_id", user.id)
                .order("created_at", { ascending: false });

            if (error) {
                console.error("Notes fetch error:", error);
                if (isMounted.current) setLoading(false);
                return;
            }

            const noteList = (data || []).map(row => ({
                ...row,
                createdAt: row.created_at ? new Date(row.created_at) : new Date(),
                updatedAt: row.updated_at ? new Date(row.updated_at) : null,
            }));

            if (isMounted.current) {
                setNotes(noteList);
                setLoading(false);
                AsyncStorage.setItem(`notes_cache_${user.id}`, JSON.stringify(noteList)).catch(console.error);
            }
        };

        fetchNotes();

        const channel = supabase.channel(`notes-${user.id}`)
            .on("postgres_changes", {
                event: "*", schema: "public", table: "notes",
                filter: `user_id=eq.${user.id}`,
            }, fetchNotes)
            .subscribe();

        return () => supabase.removeChannel(channel);
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
            await supabase.from("notes").insert({
                title: title.trim(),
                content: content || "<p></p>",
                user_id: user.id,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
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
                await supabase.from("notes").update({
                    title: noteTitle.trim() || "Untitled Note",
                    content: noteContent || "<p></p>",
                    updated_at: new Date().toISOString(),
                }).eq("id", currentNote.id);
                
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } else {
                await supabase.from("notes").insert({
                    title: noteTitle.trim() || "Untitled Note",
                    content: noteContent || "<p></p>",
                    user_id: user.id,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
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
            await supabase.from("notes").delete().eq("id", noteToDelete.id);
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
            
            {/* ── PREMIUM HEADER — deep green gradient ── */}
            <Animated.View style={[styles.header, { height: headerHeight }]}>
                <LinearGradient
                    colors={[COLORS.gradientStart, COLORS.gradientMid, COLORS.gradientEnd]}
                    style={StyleSheet.absoluteFill}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                />
                {/* subtle noise texture overlay */}
                <View style={styles.headerNoiseOverlay} />

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
                            {/* view toggle */}
                            <View style={styles.viewModeToggle}>
                                <TouchableOpacity
                                    style={[styles.viewModeButton, viewMode === 'list' && styles.viewModeButtonActive]}
                                    onPress={() => setViewMode('list')}
                                >
                                    <Ionicons name="list" size={18}
                                        color={viewMode === 'list' ? COLORS.sage : COLORS.headerTextSoft} />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.viewModeButton, viewMode === 'grid' && styles.viewModeButtonActive]}
                                    onPress={() => setViewMode('grid')}
                                >
                                    <Ionicons name="grid" size={16}
                                        color={viewMode === 'grid' ? COLORS.sage : COLORS.headerTextSoft} />
                                </TouchableOpacity>
                            </View>

                            {/* FAB-style add button */}
                            <TouchableOpacity
                                style={styles.addButton}
                                onPress={() => { resetForm(); setIsFormVisible(true); }}
                                activeOpacity={0.85}
                            >
                                <View style={styles.addButtonInner}>
                                    <Ionicons name="add" size={26} color={COLORS.sage} />
                                </View>
                            </TouchableOpacity>
                        </View>
                    </View>

                </View>
            </Animated.View>
            
            {/* Sort Bar */}
            <View style={styles.sortBar}>
                <TouchableOpacity style={styles.sortChip} onPress={toggleSortOrder} activeOpacity={0.75}>
                    <Ionicons
                        name={sortOrder === 'newest' ? "arrow-down-outline" : "arrow-up-outline"}
                        size={13} color={COLORS.accentBlush}
                    />
                    <Text style={styles.sortChipText}>
                        {sortOrder === "newest" ? "Newest" : "Oldest"}
                    </Text>
                </TouchableOpacity>
                <Text style={styles.sortCountText}>
                    {filteredNotes.length} {filteredNotes.length === 1 ? 'note' : 'notes'}
                </Text>
            </View>
            
            {/* 🎯 FIXED: Using FlatList instead of ScrollView - NO NESTING ERROR */}
            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={COLORS.accentBlush} />
                    <Text style={styles.loadingText}>Loading your notes...</Text>
                </View>
            ) : filteredNotes.length === 0 ? (
                <View style={styles.emptyState}>
                    <LinearGradient
                        colors={[COLORS.surfaceVariant, COLORS.gradientLight]}
                        style={styles.emptyIconRing}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                    >
                        <Ionicons name="leaf-outline" size={44} color={COLORS.accentBlush} />
                    </LinearGradient>
                    <Text style={styles.emptyTitle}>
                        {searchQuery ? "Nothing found" : "Your notes await"}
                    </Text>
                    <Text style={styles.emptyText}>
                        {searchQuery
                            ? "Try a different search term"
                            : "Capture your thoughts, ideas,and everything in between."}
                    </Text>
                    {!searchQuery && (
                        <TouchableOpacity
                            style={styles.emptyButton}
                            onPress={() => { resetForm(); setIsFormVisible(true); }}
                            activeOpacity={0.85}
                        >
                            <LinearGradient
                                colors={[COLORS.accentBlush, COLORS.sage]}
                                style={styles.emptyButtonGradient}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                            >
                                <Ionicons name="add" size={20} color="white" />
                                <Text style={styles.emptyButtonText}>New Note</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    )}
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
               📝 NOTE EDITOR MODAL - ENHANCED GREEN THEME FORMATTING
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
                            
                            {/* 🎯 ENHANCED FORMATTING TOOLBAR - Green theme */}
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
   🎨 STYLES - ENHANCED GREEN THEME
   ================================================================================ */

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: COLORS.backgroundBase,
    },

    // ── HEADER ──────────────────────────────────────────────────────────────
    header: {
        borderBottomLeftRadius: 28,
        borderBottomRightRadius: 28,
        overflow: 'hidden',
        shadowColor: COLORS.gradientStart,
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.45,
        shadowRadius: 24,
        elevation: 12,
    },
    headerNoiseOverlay: {
        ...StyleSheet.absoluteFillObject,
        opacity: 0.04,
        backgroundColor: '#FFFFFF',
    },
    headerContent: {
        flex: 1,
        paddingHorizontal: 22,
        paddingTop: Platform.OS === 'ios' ? 54 : 20,
        paddingBottom: 18,
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 18,
    },
    headerTitle: {
        fontWeight: '800',
        color: COLORS.headerText,
        letterSpacing: -1,
    },
    headerSubtitle: {
        fontSize: 13,
        color: COLORS.headerTextSoft,
        marginTop: 3,
        fontWeight: '500',
        letterSpacing: 0.2,
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },


    // View Mode Toggle (inside dark header)
    viewModeToggle: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.14)',
        borderRadius: 12,
        padding: 3,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
    },
    viewModeButton: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 9,
    },
    viewModeButtonActive: {
        backgroundColor: 'rgba(255,255,255,0.92)',
    },

    // Add Button — glowing white pill
    addButton: {
        borderRadius: 14,
        shadowColor: '#FFFFFF',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
        elevation: 6,
    },
    addButtonInner: {
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.92)',
        justifyContent: 'center',
        alignItems: 'center',
    },

    // ── SORT BAR ─────────────────────────────────────────────────────────────
    sortBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 10,
    },
    sortChip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.card,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
        gap: 5,
        shadowColor: COLORS.nudeShadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.6,
        shadowRadius: 4,
        elevation: 2,
    },
    sortChipText: {
        fontSize: 12,
        color: COLORS.accentBlush,
        fontWeight: '600',
        letterSpacing: 0.2,
    },
    sortCountText: {
        fontSize: 12,
        color: COLORS.textTertiary,
        fontWeight: '500',
    },

    // ── NOTE LIST ─────────────────────────────────────────────────────────────
    notesListContent: {
        paddingHorizontal: 16,
        paddingTop: 4,
    },

    // ── NOTE CARD ─────────────────────────────────────────────────────────────
    noteCard: {
        marginBottom: 10,
        borderRadius: 18,
        backgroundColor: COLORS.card,
        shadowColor: COLORS.nudeShadow,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 1,
        shadowRadius: 14,
        elevation: 4,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
        overflow: 'hidden',
    },
    noteCardList: {
        width: '100%',
    },
    noteCardGrid: {
        width: (width - 44) / 2,
        marginHorizontal: 0,
    },
    noteCardTouchable: {
        flex: 1,
    },
    // Thin gradient bar at top of card
    noteTopBar: {
        height: 3,
        width: '100%',
    },
    noteContent: {
        padding: 14,
        paddingTop: 12,
    },
    noteTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: COLORS.textPrimary,
        marginBottom: 5,
        letterSpacing: -0.2,
    },
    notePreviewText: {
        fontSize: 13,
        color: COLORS.textTertiary,
        lineHeight: 19,
        marginBottom: 10,
    },
    noteFooterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    noteWordBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    noteWordCount: {
        fontSize: 11,
        color: COLORS.textTertiary,
        fontWeight: '500',
    },
    noteActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    noteActionButton: {
        padding: 5,
        borderRadius: 8,
        backgroundColor: COLORS.surfaceVariant,
    },

    // ── QUICK ADD ─────────────────────────────────────────────────────────────
    quickAddContainer: {
        position: 'absolute',
        bottom: 24,
        left: 20,
        right: 20,
        zIndex: 100,
        shadowColor: COLORS.gradientStart,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.28,
        shadowRadius: 20,
        elevation: 10,
    },
    quickAddBlur: {
        borderRadius: 22,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: COLORS.glassBorder,
    },
    quickAddInner: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: Platform.OS === 'ios' ? 12 : 9,
        borderRadius: 22,
    },
    quickAddIconWrap: {
        width: 30,
        height: 30,
        borderRadius: 10,
        backgroundColor: COLORS.accentBlush,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
    },
    quickAddInput: {
        flex: 1,
        fontSize: 15,
        color: COLORS.textPrimary,
        fontWeight: '400',
    },
    quickAddSubmit: {
        marginLeft: 8,
        borderRadius: 14,
        overflow: 'hidden',
    },
    quickAddSubmitGradient: {
        width: 34,
        height: 34,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },

    // ── LOADING ───────────────────────────────────────────────────────────────
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingText: {
        marginTop: 14,
        fontSize: 15,
        color: COLORS.textSecondary,
        fontWeight: '500',
    },

    // ── EMPTY STATE ───────────────────────────────────────────────────────────
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 40,
    },
    emptyIconRing: {
        width: 100,
        height: 100,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
        shadowColor: COLORS.accentBlush,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.2,
        shadowRadius: 14,
        elevation: 6,
    },
    emptyTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: COLORS.textPrimary,
        marginBottom: 10,
        letterSpacing: -0.5,
    },
    emptyText: {
        fontSize: 14,
        color: COLORS.textTertiary,
        textAlign: 'center',
        marginBottom: 28,
        lineHeight: 21,
    },
    emptyButton: {
        borderRadius: 18,
        overflow: 'hidden',
        shadowColor: COLORS.gradientStart,
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 12,
        elevation: 6,
    },
    emptyButtonGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 28,
        paddingVertical: 14,
        gap: 8,
    },
    emptyButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '700',
        letterSpacing: -0.2,
    },
    emptyStateIcon: { marginBottom: 16 },

    // ── CHECKLIST ─────────────────────────────────────────────────────────────
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
        borderRadius: 5,
        borderWidth: 1.5,
        borderColor: COLORS.accentBlush,
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
    defaultListItem: { marginBottom: 4 },
    defaultListText: {
        fontSize: 14,
        color: COLORS.textPrimary,
        lineHeight: 20,
    },

    // ── MODAL EDITOR ──────────────────────────────────────────────────────────
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.55)',
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
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingBottom: 14,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.cardBorder,
    },
    modalCancelButton: {
        paddingVertical: 8,
        paddingHorizontal: 4,
    },
    modalCancelText: {
        fontSize: 16,
        color: COLORS.textTertiary,
        fontWeight: '500',
    },
    modalTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: COLORS.textPrimary,
        letterSpacing: -0.3,
    },
    modalDoneButton: {
        paddingVertical: 8,
        paddingHorizontal: 4,
    },
    modalDoneButtonDisabled: { opacity: 0.4 },
    modalDoneText: {
        fontSize: 16,
        color: COLORS.accentBlush,
        fontWeight: '700',
    },
    modalDoneTextDisabled: {
        color: COLORS.textTertiary,
    },

    // Title Input
    titleSection: {
        paddingHorizontal: 20,
        paddingTop: 18,
        paddingBottom: 10,
        backgroundColor: COLORS.card,
    },
    titleInput: {
        fontSize: 26,
        fontWeight: '800',
        color: COLORS.textPrimary,
        padding: 0,
        marginBottom: 4,
        letterSpacing: -0.8,
    },

    // Toolbar
    toolbarWrapper: {
        borderTopWidth: 1,
        borderTopColor: COLORS.cardBorder,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.cardBorder,
        backgroundColor: COLORS.surfaceVariant,
        paddingVertical: 6,
    },
    toolbarScrollContent: {
        paddingHorizontal: 12,
        gap: 2,
    },
    richToolbar: {
        backgroundColor: 'transparent',
        borderWidth: 0,
        padding: 0,
        minHeight: 44,
    },
    toolbarIconContainer: {
        width: 42,
        height: 42,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 10,
        marginHorizontal: 2,
    },
    toolbarIconContainerActive: {
        backgroundColor: COLORS.formatActive,
        shadowColor: COLORS.formatActive,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 3,
    },
    toolbarText: { fontSize: 19 },
    toolbarTextBold: { fontWeight: '800' },
    toolbarTextItalic: { fontStyle: 'italic' },
    toolbarTextUnderline: {
        textDecorationLine: 'underline',
        textDecorationColor: COLORS.formatInactive,
    },
    toolbarSeparator: {
        width: 1,
        height: 22,
        backgroundColor: COLORS.cardBorder,
        marginHorizontal: 6,
        alignSelf: 'center',
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
    editorFooter: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        backgroundColor: COLORS.card,
        borderTopWidth: 1,
        borderTopColor: COLORS.cardBorder,
    },
    editorHelper: {
        fontSize: 12,
        color: COLORS.textTertiary,
        textAlign: 'center',
    },

    // ── CONFIRM DELETE MODAL ──────────────────────────────────────────────────
    confirmOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    confirmContainer: {
        width: width * 0.84,
        backgroundColor: COLORS.card,
        borderRadius: 22,
        padding: 28,
        alignItems: 'center',
        shadowColor: COLORS.nudeShadow,
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 1,
        shadowRadius: 28,
        elevation: 12,
    },
    confirmIcon: {
        width: 64,
        height: 64,
        borderRadius: 20,
        backgroundColor: COLORS.danger + '12',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 18,
    },
    confirmTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: COLORS.textPrimary,
        marginBottom: 8,
        letterSpacing: -0.5,
    },
    confirmText: {
        fontSize: 14,
        color: COLORS.textSecondary,
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 21,
    },
    confirmButtons: {
        flexDirection: 'row',
        width: '100%',
        gap: 10,
    },
    confirmButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: 'center',
    },
    cancelButton: {
        backgroundColor: COLORS.surfaceVariant,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
    },
    cancelButtonText: {
        fontSize: 15,
        fontWeight: '600',
        color: COLORS.textSecondary,
    },
    deleteButton: {
        backgroundColor: COLORS.danger,
    },
    deleteButtonText: {
        fontSize: 15,
        fontWeight: '700',
        color: 'white',
    },
});