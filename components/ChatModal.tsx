import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Modal,
  TouchableOpacity,
  FlatList,
  Platform,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { Text, TextInput } from "./ui/AppText";
import { Send, X } from "lucide-react-native";
import { supabase } from "../lib/supabase";
import { type ChatThread, threadKey, sendChatMessage } from "../lib/chat";
import { useChatStore, type ThreadKey } from "../store/useChatStore";
import { elevation as ELEVATION, depth } from "../lib/theme/tokens";
import { formatTimeOfDay } from "../lib/format";

// Editorial reskin — paper/ink palette.
const COLORS = {
  primary: "#007C89",   // cyan
  white: "#FFFFFF",     // ivory
  gray50: "#F4FAFB",    // paper
  gray400: "#8B989C",   // ink-4
  gray700: "#5B6B7A",   // ink-3
  gray800: "#0B2540",   // ink
};

interface Message {
  id: number;
  ride_id: string | null;
  match_id: string | null;
  sender_id: string;
  content: string;
  created_at: string;
}

interface ChatModalProps {
  visible: boolean;
  onClose: () => void;
  /** A match (from the moment two people are matched) or a ride. */
  thread: ChatThread;
  currentUserId: string;
  partnerName: string;
}

export default function ChatModal({
  visible,
  onClose,
  thread,
  currentUserId,
  partnerName,
}: ChatModalProps) {
  const { column, id: threadId } = threadKey(thread);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(true);
  const flatListRef = useRef<FlatList>(null);

  // While open, this chat is read: clear its unread badge and keep new
  // messages from raising toasts (components/ChatWatcher).
  useEffect(() => {
    if (!visible || !threadId) return;
    const keys = [`${column === "ride_id" ? "ride" : "match"}:${threadId}` as ThreadKey];
    useChatStore.getState().openChat(keys);
    return () => useChatStore.getState().closeChat(keys);
  }, [visible, column, threadId]);

  // Fetch messages
  useEffect(() => {
    if (!visible || !threadId) return;

    fetchMessages();
    // `subscribeToMessages` returns the cleanup function — previously the
    // return value was thrown away, leaking one realtime channel per mount.
    const unsubscribe = subscribeToMessages();
    return unsubscribe;
  }, [visible, column, threadId]);

  const fetchMessages = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq(column, threadId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching messages:", error);
    } else {
      setMessages(data || []);
    }
    setLoading(false);
  };

  const subscribeToMessages = () => {
    const subscription = supabase
      .channel(`messages:${column}:${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `${column}=eq.${threadId}`,
        },
        (payload) => {
          if (__DEV__) { console.log("New chat message received"); }
          const incoming = payload.new as Message;
          // Skip one the initial fetch already returned.
          setMessages((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]));
          // Auto-scroll to bottom
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }, 100);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  };

  const sendMessage = async () => {
    if (!inputText.trim()) return;

    const draft = inputText;
    setInputText(""); // Clear optimistically; restored below if the send fails

    // send-message also pushes the other person. The message itself arrives
    // through the realtime subscription, like theirs do.
    const outcome = await sendChatMessage(thread, currentUserId, draft.trim());
    if (!outcome.ok) {
      setInputText((current) => current || draft);
      Alert.alert("Message not sent", outcome.message);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender_id === currentUserId;
    const time = formatTimeOfDay(item.created_at) ?? "";

    return (
      <View
        style={[
          styles.messageContainer,
          isMe ? styles.myMessageContainer : styles.theirMessageContainer,
        ]}
      >
        <View
          style={[
            styles.messageBubble,
            isMe ? styles.myBubble : styles.theirBubble,
          ]}
        >
          <Text
            style={[
              styles.messageText,
              isMe ? styles.myMessageText : styles.theirMessageText,
            ]}
          >
            {item.content}
          </Text>
          <Text
            style={[
              styles.timeText,
              isMe ? styles.myTimeText : styles.theirTimeText,
            ]}
          >
            {time}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
      // Edge-to-edge Android: the modal spans the system bars like the app.
      statusBarTranslucent
      navigationBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior="padding"
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>Chat with {partnerName}</Text>
            <Text style={styles.headerSubtitle}>Only the two of you can see this</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <X size={24} color={COLORS.gray700} />
          </TouchableOpacity>
        </View>

        {/* Messages List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No messages yet.</Text>
            <Text style={styles.emptySubtext}>
              Say hi to {partnerName}.
            </Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id.toString()}
            renderItem={renderMessage}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() =>
              flatListRef.current?.scrollToEnd({ animated: true })
            }
          />
        )}

        {/* Input Area */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Type a message"
            accessibilityLabel="Type a message"
            placeholderTextColor={COLORS.gray400}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={500}
          />
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Send message"
            style={[
              styles.sendBtn,
              !inputText.trim() && styles.sendBtnDisabled,
            ]}
            onPress={sendMessage}
            disabled={!inputText.trim()}
          >
            <Send
              size={20}
              color={inputText.trim() ? "#0B2540" : COLORS.gray400}
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.gray50,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF6F7",
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.gray800,
  },
  headerSubtitle: {
    fontSize: 12,
    color: COLORS.gray700,
    marginTop: 2,
  },
  closeBtn: {
    padding: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.gray700,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: COLORS.gray700,
    textAlign: "center",
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  messageContainer: {
    marginBottom: 12,
    maxWidth: "75%",
  },
  myMessageContainer: {
    alignSelf: "flex-end",
  },
  theirMessageContainer: {
    alignSelf: "flex-start",
  },
  messageBubble: {
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    boxShadow: ELEVATION.light.e1,
  },
  // Mine: the logo's bright cyan (navy text). Theirs: white on the paper bg.
  myBubble: {
    backgroundColor: "#09E0E8",
    borderBottomRightRadius: 6,
  },
  theirBubble: {
    backgroundColor: COLORS.white,
    borderBottomLeftRadius: 6,
    boxShadow: "0px 2px 6px rgba(11,37,64,0.08)",
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  myMessageText: {
    color: "#0B2540",
  },
  theirMessageText: {
    color: COLORS.gray800,
  },
  timeText: {
    fontSize: 11,
    marginTop: 4,
  },
  myTimeText: {
    color: "rgba(11,37,64,0.65)",
    textAlign: "right",
  },
  theirTimeText: {
    color: COLORS.gray700,
    textAlign: "left",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: Platform.OS === "ios" ? 32 : 12,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: "#EEF6F7",
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.gray50,
    borderRadius: 30,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    color: COLORS.gray800,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 28,
    backgroundColor: "#09E0E8",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
    boxShadow: depth.ctaGlow,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.22)",
  },
  sendBtnDisabled: {
    backgroundColor: "#EEF6F7",
  },
});

