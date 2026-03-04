// screens/JournalScreen.js
// 🎯 COMPLETE REDESIGN - iPhone/Samsung Notes Style
// ✅ Matches NotesScreen aesthetic perfectly
// ✅ Glass-morphism design with BlurView
// ✅ Animated header with scroll effect
// ✅ Enhanced formatting visibility
// ✅ Clean, metadata-free cards
// ✅ No ScrollView nesting errors (using FlatList)
// ✅ UPDATED: Journal theme matching home screen (deep burgundy)

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
   🎨 COLORS - JOURNAL THEME MATCHING HOME SCREEN
   ================================================================================ */

const COLORS = {
    backgroundBase: "#FAF3F6",
    card: "#FFFFFF",
    textPrimary: "#2A1520",
    textSecondary: "#7A4558",
    accentBlush: "#811855",
    accentWarm: "#383531",
    sage: "#5C2E43",
    nudeShadow: "rgba(129,24,85,0.14)",
    shadowDark: "rgba(0,0,0,0.08)",
    danger: "#E8533A",
    success: "#811855",
    info: "#2196F3",
    warning: "#FFA726",
    surfaceVariant: "#F5E8EE",
    textTertiary: "#A67A8E",
    cardBorder: "rgba(129,24,85,0.13)",
    gradientStart: "#4A0E2A",
    gradientMid: "#6B1840",
    gradientEnd: "#8B2255",
    gradientLight: "#F9EEF3",
    overlay: "rgba(42,21,32,0.55)",
    placeholder: "#B08898",
    headerText: "#FFFFFF",
    headerTextSoft: "rgba(255,255,255,0.62)",
    glassWhite: "rgba(255,255,255,0.92)",
    glassBorder: "rgba(255,255,255,0.32)",

    // Formatting
    formatActive: "#4A0E2A",
    formatInactive: "#A67A8E",
    formatBackground: "#F0DDE6",
    toolbarActiveBg: "#811855",
};

/* ================================================================================
   📝 HTML RENDERING CONFIG - Optimized for journal entries
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
   🎯 JOURNAL CARD - Clean, no metadata, with burgundy theme
   ================================================================================ */

const JournalCard = ({ journal, onPress, onEdit, onDelete, viewMode }) => {
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
    
    const plainText = getPlainText(journal.content);
    const previewText = plainText || "No content";
    
    // Format date as relative time
    const formatDate = (date) => {
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) return "Just now";
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric' 
        });
    };

    const wordCount = plainText.split(/\s+/).filter(Boolean).length;

    return (
        <Animated.View
            style={[
                styles.journalCard,
                viewMode === 'grid' ? styles.journalCardGrid : styles.journalCardList,
                { transform: [{ scale: scaleAnim }] }
            ]}
        >
            <TouchableOpacity
                activeOpacity={0.93}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
                onPress={() => onPress(journal)}
                onLongPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                    onEdit(journal);
                }}
                delayLongPress={500}
                style={styles.journalCardTouchable}
            >
                {/* Top gradient bar */}
                <LinearGradient
                    colors={[COLORS.accentBlush, COLORS.gradientEnd]}
                    style={styles.journalTopBar}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                />

                <View style={styles.journalContent}>
                    <Text style={styles.journalTitle} numberOfLines={1}>
                        {journal.title || "Untitled Entry"}
                    </Text>
                    <Text style={styles.journalPreviewText} numberOfLines={viewMode === 'grid' ? 4 : 2}>
                        {previewText}
                    </Text>

                    {/* Footer row */}
                    <View style={styles.journalFooterRow}>
                        <View style={styles.journalDateBadge}>
                            <Ionicons name="time-outline" size={11} color={COLORS.textTertiary} />
                            <Text style={styles.journalDateText}>{formatDate(journal.createdAt)}</Text>
                        </View>
                        <View style={styles.journalActions}>
                            <TouchableOpacity
                                onPress={(e) => { e.stopPropagation(); onEdit(journal); }}
                                style={styles.journalActionButton}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                                <Ionicons name="pencil-outline" size={15} color={COLORS.accentBlush} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={(e) => { e.stopPropagation(); onDelete(journal); }}
                                style={styles.journalActionButton}
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
   🎯 QUICK ADD BAR - Matching burgundy theme
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
                    colors={["rgba(255,255,255,0.95)", "rgba(250,240,244,0.95)"]}
                    style={styles.quickAddInner}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                >
                    <View style={styles.quickAddIconWrap}>
                        <Ionicons name="book" size={16} color="#FFFFFF" />
                    </View>

                    <TextInput
                        style={styles.quickAddInput}
                        placeholder="Quick entry..."
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
                                colors={[COLORS.accentBlush, COLORS.gradientStart]}
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
   🏆 MAIN JOURNAL SCREEN - Complete redesign with burgundy theme
   ================================================================================ */

export default function JournalScreen() {
    const { user } = useApp();
    
    // State
    const [journals, setJournals] = useState([]);
    const [filteredJournals, setFilteredJournals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isFormVisible, setIsFormVisible] = useState(false);
    const [currentJournal, setCurrentJournal] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [sortOrder, setSortOrder] = useState("newest");
    const [viewMode, setViewMode] = useState("list");
    
    // Form state
    const [journalTitle, setJournalTitle] = useState("");
    const [journalContent, setJournalContent] = useState("");
    
    // Delete confirmation
    const [isConfirmVisible, setIsConfirmVisible] = useState(false);
    const [journalToDelete, setJournalToDelete] = useState(null);
    
    // Editor state - Track active formats
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
        return !journalTitle.trim() && !journalContent.trim();
    }, [journalTitle, journalContent]);

    /* ================================================================================
       🔥 SUPABASE LISTENER
       ================================================================================ */

    useEffect(() => {
        if (!user) {
            setJournals([]);
            setLoading(false);
            return;
        }

        const fetchJournals = async () => {
            if (!isMounted.current) return;
            const { data, error } = await supabase
                .from("journal")
                .select("*")
                .eq("user_id", user.id)
                .order("created_at", { ascending: false });

            if (error) {
                console.error("Journal fetch error:", error);
                if (isMounted.current) setLoading(false);
                return;
            }

            const journalList = (data || []).map(row => ({
                ...row,
                createdAt: row.created_at ? new Date(row.created_at) : new Date(),
                updatedAt: row.updated_at ? new Date(row.updated_at) : null,
            }));

            if (isMounted.current) {
                setJournals(journalList);
                setLoading(false);
                AsyncStorage.setItem(`journal_cache_${user.id}`, JSON.stringify(journalList)).catch(console.error);
            }
        };

        fetchJournals();

        const channel = supabase.channel(`journal-${user.id}`)
            .on("postgres_changes", {
                event: "*", schema: "public", table: "journal",
                filter: `user_id=eq.${user.id}`,
            }, fetchJournals)
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, [user]);

    /* ================================================================================
       🔍 FILTERING & SEARCH
       ================================================================================ */

    useEffect(() => {
        let filtered = [...journals];
        
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(j => {
                const title = j.title?.toLowerCase() || "";
                const content = j.content?.toLowerCase() || "";
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
        
        setFilteredJournals(filtered);
    }, [journals, searchQuery, sortOrder]);

    /* ================================================================================
       🎯 JOURNAL OPERATIONS
       ================================================================================ */

    const showMessage = useCallback((message) => {
        Alert.alert(message);
    }, []);

    const handleQuickAdd = async ({ title, content }) => {
        if (!user) return;
        
        try {
            await supabase.from("journal").insert({
                title: title.trim(),
                content: content || "<p></p>",
                user_id: user.id,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            });
            
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            showMessage("✨ Journal entry created!");
        } catch (error) {
            console.error("Quick add error:", error);
            Alert.alert("Error", "Failed to create journal entry");
        }
    };

    const handleSaveJournal = async () => {
        if (isSaveDisabled) {
            Alert.alert("Error", "Please enter a title or content");
            return;
        }

        if (!user) return;

        setSaving(true);

        try {
            if (currentJournal) {
                const { error } = await supabase
                    .from("journal")
                    .update({
                        title: journalTitle.trim() || "Untitled Entry",
                        content: journalContent || "<p></p>",
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", currentJournal.id);

                if (error) throw error;

                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                showMessage("✅ Journal entry updated");
            } else {
                const { error } = await supabase.from("journal").insert({
                    title: journalTitle.trim() || "Untitled Entry",
                    content: journalContent || "<p></p>",
                    user_id: user.id,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                });

                if (error) throw error;

                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                showMessage("📝 Journal entry created");

                // Clear draft
                setDraftTitle("");
                setDraftContent("");
            }

            setIsFormVisible(false);
            resetForm();
        } catch (error) {
            console.error("Save journal error:", error);
            Alert.alert("Save failed", error?.message || "Failed to save journal entry");
        } finally {
            setSaving(false);
        }
    };

    const resetForm = () => {
        setCurrentJournal(null);
        setJournalTitle("");
        setJournalContent("");
        setActiveFormats({ bold: false, italic: false, underline: false });
    };

    const handleEditJournal = (journal) => {
        setCurrentJournal(journal);
        setJournalTitle(journal.title || "");
        setJournalContent(journal.content || "");
        setIsFormVisible(true);
    };

    const handleDeleteJournal = async () => {
        if (!journalToDelete) return;
        
        try {
            await supabase.from("journal").delete().eq("id", journalToDelete.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            showMessage("🗑️ Journal entry deleted");
            setIsConfirmVisible(false);
            setJournalToDelete(null);
        } catch (error) {
            console.error("Delete journal error:", error);
            Alert.alert("Error", "Failed to delete journal entry");
        }
    };

    const confirmDelete = (journal) => {
        setJournalToDelete(journal);
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

    // 🎯 Handle editor initialization
    const handleEditorInitialized = () => {
        // Format tracking would go here
    };

    // 🎯 FlatList render item
    const renderJournalItem = ({ item }) => (
        <JournalCard
            journal={item}
            onPress={handleEditJournal}
            onEdit={handleEditJournal}
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
            <StatusBar barStyle="light-content" backgroundColor={COLORS.gradientStart} />
            
            {/* ── PREMIUM HEADER — deep burgundy gradient ── */}
            <Animated.View style={[styles.header, { height: headerHeight }]}>
                <LinearGradient
                    colors={[COLORS.gradientStart, COLORS.gradientMid, COLORS.gradientEnd]}
                    style={StyleSheet.absoluteFill}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                />
                <View style={styles.headerNoiseOverlay} />

                <View style={styles.headerContent}>
                    <View style={styles.headerTop}>
                        <View>
                            <Animated.Text style={[styles.headerTitle, { fontSize: headerTitleSize }]}>
                                Journal
                            </Animated.Text>
                            <Text style={styles.headerSubtitle}>
                                {journals.length} {journals.length === 1 ? 'entry' : 'entries'}
                            </Text>
                        </View>

                        <View style={styles.headerRight}>
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

                    {/* Search bar inside header */}
                    <View style={styles.headerSearch}>
                        <Ionicons name="search-outline" size={16} color={COLORS.headerTextSoft} style={{ marginRight: 8 }} />
                        <TextInput
                            style={styles.headerSearchInput}
                            placeholder="Search entries..."
                            placeholderTextColor={COLORS.headerTextSoft}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            returnKeyType="search"
                        />
                        {searchQuery.length > 0 && (
                            <TouchableOpacity onPress={clearSearch} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                <Ionicons name="close-circle" size={16} color={COLORS.headerTextSoft} />
                            </TouchableOpacity>
                        )}
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
                    {filteredJournals.length} {filteredJournals.length === 1 ? 'entry' : 'entries'}
                </Text>
            </View>
            
            {/* Journal List - Using FlatList */}
            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={COLORS.accentBlush} />
                    <Text style={styles.loadingText}>Loading your journal...</Text>
                </View>
            ) : filteredJournals.length === 0 ? (
                <View style={styles.emptyState}>
                    <LinearGradient
                        colors={[COLORS.surfaceVariant, COLORS.gradientLight]}
                        style={styles.emptyIconRing}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                    >
                        <Ionicons name="feather" size={44} color={COLORS.accentBlush} />
                    </LinearGradient>
                    <Text style={styles.emptyTitle}>
                        {searchQuery ? "Nothing found" : "Your story awaits"}
                    </Text>
                    <Text style={styles.emptyText}>
                        {searchQuery
                            ? "Try a different search term"
                            : "Capture your thoughts, feelings,\nand moments that matter."}
                    </Text>
                    {!searchQuery && (
                        <TouchableOpacity
                            style={styles.emptyButton}
                            onPress={() => { resetForm(); setIsFormVisible(true); }}
                            activeOpacity={0.85}
                        >
                            <LinearGradient
                                colors={[COLORS.gradientStart, COLORS.gradientMid]}
                                style={styles.emptyButtonGradient}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                            >
                                <Ionicons name="add" size={20} color="white" />
                                <Text style={styles.emptyButtonText}>New Entry</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    )}
                </View>
            ) : (
                <FlatList
                    ref={flatListRef}
                    data={filteredJournals}
                    renderItem={renderJournalItem}
                    keyExtractor={(item) => item.id}
                    numColumns={viewMode === 'grid' ? 2 : 1}
                    key={viewMode}
                    contentContainerStyle={styles.journalListContent}
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
            {viewMode === 'list' && !loading && filteredJournals.length > 0 && (
                <QuickAddBar onAdd={handleQuickAdd} />
            )}
            
            {/* ================================================================================
               📝 JOURNAL EDITOR MODAL - Enhanced formatting with burgundy theme
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
                                    {currentJournal ? "Edit Entry" : "New Entry"}
                                </Text>
                                
                                <TouchableOpacity
                                    onPress={handleSaveJournal}
                                    disabled={isSaveDisabled || saving}
                                    style={[
                                        styles.modalDoneButton,
                                        (isSaveDisabled || saving) && styles.modalDoneButtonDisabled
                                    ]}
                                >
                                    {saving ? (
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
                                    value={journalTitle}
                                    onChangeText={setJournalTitle}
                                    maxLength={200}
                                    autoFocus={!currentJournal}
                                />
                                {journalTitle.length > 0 && (
                                    <Text style={styles.characterCount}>
                                        {journalTitle.length}/200
                                    </Text>
                                )}
                            </View>
                            
                            {/* Enhanced Formatting Toolbar - Burgundy theme */}
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
                                    placeholder="Write your journal entry here..."
                                    placeholderTextColor={COLORS.placeholder}
                                    initialContentHTML={journalContent}
                                    onChange={setJournalContent}
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
                            
                            {/* Simple Footer */}
                            <View style={styles.editorFooter}>
                                <Text style={styles.editorHelper}>
                                    <Ionicons name="information-circle-outline" size={14} color={COLORS.textTertiary} /> 
                                    {' '}Tap to format, double-tap to select
                                </Text>
                                {journalContent.length > 0 && (
                                    <Text style={styles.wordCount}>
                                        {journalContent.replace(/<[^>]*>/g, '').length} characters
                                    </Text>
                                )}
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
                        <Text style={styles.confirmTitle}>Delete Entry?</Text>
                        <Text style={styles.confirmText}>
                            This action cannot be undone. The journal entry will be permanently deleted.
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
                                onPress={handleDeleteJournal}
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
   🎨 STYLES - Complete redesign with burgundy theme
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
    headerSearch: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.12)',
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
    },
    headerSearchInput: {
        flex: 1,
        fontSize: 15,
        color: COLORS.headerText,
        padding: 0,
        fontWeight: '400',
    },

    // View Mode Toggle
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

    // Add Button
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

    // ── JOURNAL LIST ──────────────────────────────────────────────────────────
    journalListContent: {
        paddingHorizontal: 16,
        paddingTop: 4,
    },

    // ── JOURNAL CARD ──────────────────────────────────────────────────────────
    journalCard: {
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
    journalCardList: {
        width: '100%',
    },
    journalCardGrid: {
        width: (width - 44) / 2,
    },
    journalCardTouchable: {
        flex: 1,
    },
    journalTopBar: {
        height: 3,
        width: '100%',
    },
    journalContent: {
        padding: 14,
        paddingTop: 12,
    },
    journalTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: COLORS.textPrimary,
        marginBottom: 5,
        letterSpacing: -0.2,
    },
    journalPreviewText: {
        fontSize: 13,
        color: COLORS.textTertiary,
        lineHeight: 19,
        marginBottom: 10,
    },
    journalFooterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    journalDateBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    journalDateText: {
        fontSize: 11,
        color: COLORS.textTertiary,
        fontWeight: '500',
    },
    journalActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    journalActionButton: {
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

    // Character / word count in editor
    characterCount: {
        fontSize: 11,
        color: COLORS.textTertiary,
        fontWeight: '500',
        textAlign: 'right',
        marginTop: 4,
    },
    wordCount: {
        fontSize: 11,
        color: COLORS.textTertiary,
        fontWeight: '500',
        marginTop: 4,
        textAlign: 'right',
    },
});