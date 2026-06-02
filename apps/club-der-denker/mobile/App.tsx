import { useEffect, useState } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { RootNavigator } from '@/navigation';
import { SessionProvider, useSession } from '@/store/SessionContext';
import { Loading } from '@/components/ui';
import { initLocale } from '@/i18n';
import { colors } from '@/theme';

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.bg, card: colors.surface, text: colors.text, border: colors.border, primary: colors.accent },
};

function Gate() {
  const { ready } = useSession();
  const [localeReady, setLocaleReady] = useState(false);

  useEffect(() => {
    // Spec 3.1: no splash/registration before the first item — we only resolve
    // the locale (device language) before rendering.
    initLocale().finally(() => setLocaleReady(true));
  }, []);

  if (!ready || !localeReady) return <Loading />;
  return <RootNavigator />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <NavigationContainer theme={navTheme}>
          <Gate />
        </NavigationContainer>
        <StatusBar style="light" />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
