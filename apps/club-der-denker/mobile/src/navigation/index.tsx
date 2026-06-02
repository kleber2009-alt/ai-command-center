import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { FunnelScreen } from '@/screens/FunnelScreen';
import { CaseScreen } from '@/screens/CaseScreen';
import { BranchScreen } from '@/screens/BranchScreen';
import { ObjectionScreen } from '@/screens/ObjectionScreen';
import { EmailScreen } from '@/screens/EmailScreen';
import { PaywallScreen } from '@/screens/PaywallScreen';
import { RegisterScreen } from '@/screens/RegisterScreen';
import { CourseScreen } from '@/screens/CourseScreen';
import { FeedScreen } from '@/screens/FeedScreen';
import { ProfileScreen } from '@/screens/ProfileScreen';

/**
 * Funnel order is intentionally strict (spec 3.1):
 *   Funnel (3 free) -> Case -> Branch A/B -> [A: Objection] / [B: Email]
 *   -> Paywall -> Register -> Course -> Feed/Profile
 */
export type RootStackParamList = {
  Funnel: undefined;
  Case: undefined;
  Branch: undefined;
  Objection: undefined;
  Email: undefined;
  Paywall: undefined;
  Register: { email: string };
  Course: undefined;
  Feed: undefined;
  Profile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator initialRouteName="Funnel" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Funnel" component={FunnelScreen} />
      <Stack.Screen name="Case" component={CaseScreen} />
      <Stack.Screen name="Branch" component={BranchScreen} />
      <Stack.Screen name="Objection" component={ObjectionScreen} />
      <Stack.Screen name="Email" component={EmailScreen} />
      <Stack.Screen name="Paywall" component={PaywallScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="Course" component={CourseScreen} />
      <Stack.Screen name="Feed" component={FeedScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
    </Stack.Navigator>
  );
}
