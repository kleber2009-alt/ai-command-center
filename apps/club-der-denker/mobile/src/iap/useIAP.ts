import { useEffect, useRef, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import {
  initConnection,
  endConnection,
  getProducts,
  getSubscriptions,
  requestPurchase,
  requestSubscription,
  finishTransaction,
  purchaseUpdatedListener,
  purchaseErrorListener,
  type Purchase,
} from 'react-native-iap';
import { api } from '@/api/client';
import { getToken } from '@/store/session';

/**
 * In-app purchase hook (spec 4). Initializes the store connection, loads the
 * course product + community subscription, and runs purchases. On each
 * purchase update it validates the receipt server-side (/api/iap/verify) before
 * finishing the transaction, so access flags are only flipped after validation.
 */
const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;
const COURSE_SKU = extra.iapCourseSku || 'course_access';
const COMMUNITY_SKU = extra.iapCommunitySku || 'community_subscription';

export function useIAP(onVerified?: (product: string) => void) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const onVerifiedRef = useRef(onVerified);
  onVerifiedRef.current = onVerified;
  // Android subscriptions require a selected offer token from the product.
  const offerTokenRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    let updateSub: { remove: () => void } | undefined;
    let errorSub: { remove: () => void } | undefined;

    (async () => {
      try {
        await initConnection();
        const [, subs] = await Promise.all([
          getProducts({ skus: [COURSE_SKU] }).catch(() => []),
          getSubscriptions({ skus: [COMMUNITY_SKU] }).catch(() => []),
        ]);
        const sub = subs.find((s) => s.productId === COMMUNITY_SKU) as any;
        offerTokenRef.current = sub?.subscriptionOfferDetails?.[0]?.offerToken;
        setReady(true);
      } catch {
        setReady(false);
      }

      updateSub = purchaseUpdatedListener(async (purchase: Purchase) => {
        try {
          await verify(purchase);
          await finishTransaction({ purchase, isConsumable: false });
          onVerifiedRef.current?.(purchase.productId);
        } catch {
          // leave the transaction unfinished so the store retries delivery
        } finally {
          setBusy(false);
        }
      });
      errorSub = purchaseErrorListener(() => setBusy(false));
    })();

    return () => {
      updateSub?.remove();
      errorSub?.remove();
      endConnection().catch(() => {});
    };
  }, []);

  // accountId ties a pre-account (lead) purchase to its user row so the store
  // webhook can validate it before the user sets a password (spec 3.1 step 6->7).
  const buyCourse = useCallback(async (accountId?: string) => {
    setBusy(true);
    await requestPurchase(
      Platform.OS === 'ios'
        ? { sku: COURSE_SKU, appAccountToken: accountId }
        : { skus: [COURSE_SKU], obfuscatedAccountIdAndroid: accountId },
    ).catch(() => setBusy(false));
  }, []);

  const subscribeCommunity = useCallback(async () => {
    setBusy(true);
    const offerToken = offerTokenRef.current;
    await requestSubscription(
      Platform.OS === 'ios'
        ? { sku: COMMUNITY_SKU }
        : { subscriptionOffers: [{ sku: COMMUNITY_SKU, offerToken: offerToken ?? '' }] },
    ).catch(() => setBusy(false));
  }, []);

  return { ready, busy, buyCourse, subscribeCommunity };
}

async function verify(purchase: Purchase): Promise<void> {
  // Inline server-side verification needs a session. Pre-account course
  // purchases (no token yet) are validated by the store webhook via the
  // appAccountToken instead.
  const token = await getToken();
  if (!token) return;

  const isSubscription = purchase.productId === COMMUNITY_SKU;
  if (Platform.OS === 'ios') {
    // StoreKit 2 signed transaction (JWS). react-native-iap surfaces it on the
    // receipt field for server-side App Store Server API verification.
    const jws = purchase.transactionReceipt;
    if (jws) await api.verifyApple(jws);
  } else {
    const token = (purchase as Purchase & { purchaseToken?: string }).purchaseToken;
    if (token) await api.verifyGoogle(purchase.productId, token, isSubscription);
  }
}
