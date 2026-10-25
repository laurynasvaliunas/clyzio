import React, { Component, ReactNode } from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { Text } from "./ui/AppText";
import { Ionicons } from "@expo/vector-icons";
import { Sentry } from "../lib/sentry";
import { depth } from "../lib/theme/tokens";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  eventId: string | null;
}

/**
 * Root-level error boundary.
 *
 * Previously this only called `console.error`, so crash reports never reached
 * our monitoring. It now forwards every caught error to Sentry with the React
 * component stack attached, and exposes the resulting event ID on the fallback
 * screen so users can reference it in a support message.
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, eventId: null };
  }

  static getDerivedStateFromError(_error: Error): Partial<State> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (__DEV__) {
      console.error("ErrorBoundary caught an error:", error, errorInfo);
    }
    try {
      // H2: single capture call combining component stack + feature tag.
      // (Previously this called both Sentry.captureException AND captureError,
      // which created two events per crash and inflated the Sentry quota.)
      const eventId = Sentry.captureException(error, {
        tags: { feature: "error-boundary" },
        contexts: { react: { componentStack: errorInfo.componentStack } },
      });
      this.setState({ eventId: typeof eventId === "string" ? eventId : null });
    } catch {
      /* Sentry not initialised — already logged above */
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, eventId: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.content}>
            <View style={styles.iconContainer}>
              <Ionicons name="warning-outline" size={64} color="#007C89" />
            </View>
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.message}>
              An unexpected error occurred. Please try again and the issue may
              resolve itself.
            </Text>
            {this.state.eventId ? (
              <Text style={styles.eventId} accessibilityLabel="error id">
                Reference: {this.state.eventId.slice(0, 8)}
              </Text>
            ) : null}
            <TouchableOpacity
              style={styles.button}
              onPress={this.handleReset}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Try again"
            >
              <Text style={styles.buttonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0B2540",
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  content: {
    alignItems: "center",
    maxWidth: 320,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 999,
    backgroundColor: "rgba(0,124,137,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
    boxShadow: depth.embossLight,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: 12,
  },
  message: {
    fontSize: 15,
    fontWeight: "400",
    color: "rgba(255, 255, 255, 0.7)",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 18,
  },
  eventId: {
    fontSize: 12,
    color: "rgba(255,255,255,0.5)",
    marginBottom: 18,
    fontVariant: ["tabular-nums"],
  },
  button: {
    backgroundColor: "#007C89",
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 15,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0B2540",
  },
});

export default ErrorBoundary;
