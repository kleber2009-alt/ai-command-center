import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { useSession } from '@/store/SessionContext';
import { FunnelScreen } from '@/screens/FunnelScreen';
import { CaseScreen } from '@/screens/CaseScreen';
import { BranchScreen } from '@/screens/BranchScreen';
import { ObjectionScreen } from '@/screens/ObjectionScreen';
import { EmailScreen } from '@/screens/EmailScreen';
import { PaywallScreen } from '@/screens/PaywallScreen';
import { RegisterScreen } from '@/screens/RegisterScreen';
import { LoginScreen } from '@/screens/LoginScreen';
import { CourseScreen } from '@/screens/CourseScreen';
import { FeedScreen } from '@/screens/FeedScreen';
import { ProfileScreen } from '@/screens/ProfileScreen';
import { colors } from '@/theme';
import { t } from '@/i18n';

/**
 * Two top-level flows, switched by the presence of a session token:
 *  - Unauthenticated: the strict freemium funnel (spec 3.1) + a Login entry
 *    for returning users. Account creation happens at the funnel's end.
 *  - Authenticated: the main tab bar (Course / Community / Profile).
 */
export type FunnelStackParamList = {
  Funnel: undefined;
  Case: undefined;
  Branch: undefined;
  Objection: undefined;
  Email: undefined;
  Paywall: { leadUserId?: string };
  Register: { email: string };
  Login: undefined;
};

export type MainTabParamList = {
  Course: undefined;
  Feed: undefined;
  Profile: undefined;
};

const FunnelStack = createNativeStackNavigator<FunnelStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();

function FunnelNavigator() {
  return (
    <FunnelStack.Navigator initialRouteName="Funnel" screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <FunnelStack.Screen name="Funnel" component={FunnelScreen} />
      <FunnelStack.Screen name="Case" component={CaseScreen} />
      <FunnelStack.Screen name="Branch" component={BranchScreen} />
      <FunnelStack.Screen name="Objection" component={ObjectionScreen} />
      <FunnelStack.Screen name="Email" component={EmailScreen} />
      <FunnelStack.Screen name="Paywall" component={PaywallScreen} />
      <FunnelStack.Screen name="Register" component={RegisterScreen} />
      <FunnelStack.Screen name="Login" component={LoginScreen} />
    </FunnelStack.Navigator>
  );
}

function tabIcon(glyph: string) {
  return ({ color }: { color: string }) => <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;
}

function MainNavigator() {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textFaint,
      }}
    >
      <Tabs.Screen name="Course" component={CourseScreen} options={{ title: t('tab_course'), tabBarIcon: tabIcon('◉') }} />
      <Tabs.Screen name="Feed" component={FeedScreen} options={{ title: t('tab_feed'), tabBarIcon: tabIcon('▤') }} />
      <Tabs.Screen name="Profile" component={ProfileScreen} options={{ title: t('tab_profile'), tabBarIcon: tabIcon('☻') }} />
    </Tabs.Navigator>
  );
}

export function RootNavigator() {
  const { token } = useSession();
  return token ? <MainNavigator /> : <FunnelNavigator />;
}
