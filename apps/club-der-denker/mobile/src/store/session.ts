import AsyncStorage from '@react-native-async-storage/async-storage';

/** Minimal session/token storage. Token is issued by /api/auth/* after purchase. */
const TOKEN_KEY = 'cdd.token';
const DEVICE_KEY = 'cdd.deviceId';

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_KEY);
}

/** Stable anonymous device id used by the freemium funnel before email capture. */
export async function getDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = `dev_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    await AsyncStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}
