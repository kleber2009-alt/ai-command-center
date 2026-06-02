import { ReactNode } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, radii, typography } from '@/theme';

/** Full-screen container with safe-area + dark background. */
export function Screen({ children, scroll, style }: { children: ReactNode; scroll?: boolean; style?: ViewStyle }) {
  const Inner = scroll ? ScrollView : View;
  return (
    <SafeAreaView style={styles.screen}>
      <Inner
        style={scroll ? undefined : [styles.flex, style]}
        contentContainerStyle={scroll ? [styles.scrollContent, style] : undefined}
      >
        {children}
      </Inner>
    </SafeAreaView>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}) {
  const v = buttonVariants[variant];
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={disabled || loading}
      onPress={onPress}
      style={[styles.button, v.container, (disabled || loading) && styles.buttonDisabled, style]}
    >
      {loading ? (
        <ActivityIndicator color={v.label.color as string} />
      ) : (
        <Text style={[styles.buttonLabel, v.label]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

export function Heading({ children, style }: { children: ReactNode; style?: TextStyle }) {
  return <Text style={[styles.h1, style]}>{children}</Text>;
}

export function Body({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: TextStyle }) {
  return <Text style={[styles.body, muted && { color: colors.textMuted }, style]}>{children}</Text>;
}

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.accent} size="large" />
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <Text style={[styles.body, { color: colors.danger, textAlign: 'center', marginBottom: spacing.md }]}>{message}</Text>
      {onRetry ? <Button label="Retry" variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

/** Card surface. */
export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const buttonVariants: Record<ButtonVariant, { container: ViewStyle; label: TextStyle }> = {
  primary: { container: { backgroundColor: colors.accent }, label: { color: colors.accentText } },
  secondary: { container: { backgroundColor: colors.surfaceAlt }, label: { color: colors.text } },
  ghost: { container: { backgroundColor: 'transparent' }, label: { color: colors.textMuted } },
  danger: { container: { backgroundColor: 'transparent' }, label: { color: colors.danger } },
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scrollContent: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg, backgroundColor: colors.bg },
  button: { borderRadius: radii.md, paddingVertical: 16, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  buttonDisabled: { opacity: 0.5 },
  buttonLabel: { ...typography.title },
  h1: { ...typography.h1, color: colors.text },
  body: { ...typography.body, color: colors.text },
  card: { backgroundColor: colors.surface, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
});
