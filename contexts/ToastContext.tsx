import React, { createContext, useContext, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from "lucide-react-native";

type ToastType = "success" | "error" | "info" | "warning";

interface ToastOptions {
  title: string;
  message?: string;
  type?: ToastType;
  duration?: number;
}

interface ToastContextType {
  showToast: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const COLORS = {
  success: { bg: "#F0FDF4", border: "#22C55E", icon: "#16A34A", text: "#15803D" },
  error:   { bg: "#FFF1F2", border: "#F43F5E", icon: "#E11D48", text: "#BE123C" },
  info:    { bg: "#F0FDFF", border: "#26C6DA", icon: "#0891B2", text: "#006064" },
  warning: { bg: "#FFFBEB", border: "#F59E0B", icon: "#D97706", text: "#92400E" },
};

const ICONS: Record<ToastType, React.ComponentType<any>> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

interface ToastItem extends ToastOptions {
  id: number;
  type: ToastType;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counterRef = useRef(0);

  const showToast = useCallback(({ title, message, type = "info", duration = 3500 }: ToastOptions) => {
    const id = ++counterRef.current;
    setToasts((prev) => [...prev.slice(-2), { id, title, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </ToastContext.Provider>
  );
}

function ToastContainer({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.container, { top: insets.top + 8 }]}
      pointerEvents="box-none"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </View>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const translateY = useRef(new Animated.Value(-80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 10,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: -80, duration: 220, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(onDismiss);
  };

  const palette = COLORS[toast.type];
  const IconComponent = ICONS[toast.type];

  return (
    <Animated.View
      style={[
        styles.card,
        { backgroundColor: palette.bg, borderLeftColor: palette.border, transform: [{ translateY }], opacity },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: palette.border + "22" }]}>
        <IconComponent size={20} color={palette.icon} />
      </View>
      <View style={styles.textWrap}>
        <Text style={[styles.title, { color: palette.text }]}>{toast.title}</Text>
        {toast.message ? (
          <Text style={[styles.message, { color: palette.text + "CC" }]}>{toast.message}</Text>
        ) : null}
      </View>
      <TouchableOpacity onPress={dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <X size={16} color={palette.text + "99"} />
      </TouchableOpacity>
    </Animated.View>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 9999,
    gap: 8,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    borderLeftWidth: 4,
    paddingVertical: 14,
    paddingRight: 14,
    paddingLeft: 12,
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 18,
  },
  message: {
    fontSize: 13,
    lineHeight: 17,
  },
});
