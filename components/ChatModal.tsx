import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Send, X } from "lucide-react-native";
import { supabase } from "../lib/supabase";

const COLORS = {
  primary: "#10B981",
  white: "#FFFFFF",
  gray50: "#F9FAFB",
  gray400: "#9CA3AF",
  gray700: "#374151",
  gray800: "#1F2937",
};

interface Message {
  id: number;
  ride_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

interface ChatModalProps {
  visible: boolean;
  onClose: () => void;
  rideId: string;
  currentUserId: string;
  partnerName: string;
}

export default function ChatModal({
  visible,
  onClose,
  rideId,
  currentUserId,
  partnerName,
}: ChatModalProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(true);
  const flatListRef = useRef<FlatList>(null);

  // Fetch messages
  useEffect(() => {
    if (!visible || !rideId) return;

    fetchMessages();
    subscribeToMessages();
  }, [visible, rideId]);

  const fetchMessages = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("ride_id", rideId)
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
      .channel(`messages:${rideId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `ride_id=eq.${rideId}`,
        },
        (payload) => {
          console.log("New message received:", payload);
          setMessages((prev) => [...prev, payload.new as Message]);
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

    const newMessage = {
      ride_id: rideId,
      sender_id: currentUserId,
      content: inputText.trim(),
    };

    setInputText(""); // Clear input immediately

    const { error } = await supabase.from("messages").insert(newMessage);

    if (error) {
      console.error("Error sending message:", error);
      alert("Failed to send message. Check RLS policies.");
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender_id === currentUserId;
    const time = new Date(item.created_at).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });

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
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>Chat with {partnerName}</Text>
            <Text style={styles.headerSubtitle}>End-to-end secure</Text>
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
              Say hi to your {partnerName}! 👋
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
            placeholder=""
            placeholderTextColor={COLORS.gray400}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            style={[
              styles.sendBtn,
              !inputText.trim() && styles.sendBtnDisabled,
            ]}
            onPress={sendMessage}
            disabled={!inputText.trim()}
          >
            <Send
              size={20}
              color={inputText.trim() ? COLORS.white : COLORS.gray400}
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
    backgroundColor: COLORS.white,
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
    borderBottomColor: "#E5E7EB",
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
    color: COLORS.gray400,
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
    color: COLORS.gray400,
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
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  myBubble: {
    backgroundColor: COLORS.primary,
    borderBottomRightRadius: 4,
  },
  theirBubble: {
    backgroundColor: COLORS.gray50,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  myMessageText: {
    color: COLORS.white,
  },
  theirMessageText: {
    color: COLORS.gray800,
  },
  timeText: {
    fontSize: 10,
    marginTop: 4,
  },
  myTimeText: {
    color: "rgba(255,255,255,0.7)",
    textAlign: "right",
  },
  theirTimeText: {
    color: COLORS.gray400,
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
    borderTopColor: "#E5E7EB",
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.gray50,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    color: COLORS.gray800,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  sendBtnDisabled: {
    backgroundColor: "#E5E7EB",
  },
});

