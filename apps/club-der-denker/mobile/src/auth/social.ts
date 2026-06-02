import { useEffect } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';

/**
 * Social sign-in (spec 3.2). Obtains a provider OIDC identity token on-device;
 * the backend (/api/auth/social) verifies it. Apple is iOS-only.
 */
WebBrowser.maybeCompleteAuthSession();

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;

export function appleAvailable(): boolean {
  return Platform.OS === 'ios';
}

/** Trigger the native Apple flow; resolves with the identity token (JWT). */
export async function appleSignIn(): Promise<string> {
  const available = await AppleAuthentication.isAvailableAsync();
  if (!available) throw new Error('Apple Sign-In unavailable');
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });
  if (!credential.identityToken) throw new Error('No Apple identity token');
  return credential.identityToken;
}

/**
 * Google sign-in hook. Returns a `promptGoogle` trigger; `onIdToken` fires with
 * the verified id_token on success. Client ids come from app.json -> extra.
 */
export function useGoogleAuth(onIdToken: (idToken: string) => void) {
  const [request, response, promptAsync] = Google.useAuthRequest({
    iosClientId: extra.googleIosClientId || undefined,
    androidClientId: extra.googleAndroidClientId || undefined,
    webClientId: extra.googleWebClientId || undefined,
    scopes: ['openid', 'email', 'profile'],
  });

  useEffect(() => {
    if (response?.type === 'success') {
      const idToken = response.params?.id_token ?? response.authentication?.idToken;
      if (idToken) onIdToken(idToken);
    }
  }, [response, onIdToken]);

  return { promptGoogle: () => promptAsync(), googleReady: !!request };
}
