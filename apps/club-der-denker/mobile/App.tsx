import { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { RootNavigator } from '@/navigation';
import { initLocale } from '@/i18n';

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Spec 3.1: no splash/registration before the first item. We only resolve
    // the locale (device language) before rendering the funnel directly.
    initLocale().finally(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
