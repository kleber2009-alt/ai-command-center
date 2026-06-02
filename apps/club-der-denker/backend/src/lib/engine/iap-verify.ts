import { importX509, jwtVerify, decodeProtectedHeader, SignJWT, importPKCS8 } from 'jose';
import { ValidatedReceipt } from './iap';
import { ProductKind } from '../types';

/**
 * Real receipt verification (spec 4) for the client-initiated /api/iap/verify
 * flow. The caller is already authenticated, so the user id comes from the
 * session — store identifiers are opaque and no card data is involved.
 */

function classify(productId: string, hasExpiry: boolean): ProductKind {
  return hasExpiry || /sub|community/i.test(productId) ? 'community_subscription' : 'course_access';
}

// ---------------------------------------------------------------------------
// Apple — verify a StoreKit 2 signed transaction (JWS). The JWS header carries
// the signing cert chain in x5c (leaf first). We verify the signature with the
// leaf certificate.
//
// TODO(hardening): validate the full x5c chain up to Apple's root CA (G3) and
// check the leaf's validity window before trusting the payload.
// ---------------------------------------------------------------------------
export async function verifyAppleTransaction(userId: string, jws: string): Promise<ValidatedReceipt> {
  const header = decodeProtectedHeader(jws);
  const x5c = header.x5c;
  if (!x5c || x5c.length === 0) throw new Error('missing x5c in transaction header');

  const leafPem = `-----BEGIN CERTIFICATE-----\n${x5c[0]}\n-----END CERTIFICATE-----`;
  const key = await importX509(leafPem, 'ES256');
  const { payload } = await jwtVerify(jws, key);

  const p = payload as Record<string, any>;
  const expiresMs = p.expiresDate ? Number(p.expiresDate) : undefined;
  const revoked = !!p.revocationDate;
  const now = Date.now();

  let status: ValidatedReceipt['status'] = 'active';
  if (revoked) status = 'revoked';
  else if (expiresMs && expiresMs < now) status = 'expired';

  return {
    userId,
    product: classify(String(p.productId ?? ''), !!expiresMs),
    platform: 'apple',
    storeTransactionId: String(p.transactionId),
    originalTransactionId: p.originalTransactionId ? String(p.originalTransactionId) : undefined,
    receiptRef: String(p.transactionId),
    purchasedAt: new Date(Number(p.purchaseDate ?? now)),
    expiresAt: expiresMs ? new Date(expiresMs) : undefined,
    status,
  };
}

// ---------------------------------------------------------------------------
// Google — verify via the Play Developer API using a service-account access
// token (service account JWT -> OAuth2 access token -> androidpublisher call).
// ---------------------------------------------------------------------------
interface ServiceAccount { client_email: string; private_key: string }

async function googleAccessToken(): Promise<string> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not configured');
  const sa = JSON.parse(raw) as ServiceAccount;

  const key = await importPKCS8(sa.private_key, 'RS256');
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/androidpublisher' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(sa.client_email)
    .setSubject(sa.client_email)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error(`google token exchange failed: ${res.status}`);
  const json = await res.json();
  return json.access_token as string;
}

export async function verifyGooglePurchase(
  userId: string,
  productId: string,
  purchaseToken: string,
  isSubscription: boolean,
): Promise<ValidatedReceipt> {
  const pkg = process.env.GOOGLE_PLAY_PACKAGE_NAME;
  if (!pkg) throw new Error('GOOGLE_PLAY_PACKAGE_NAME not configured');
  const token = await googleAccessToken();

  const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}`;
  const url = isSubscription
    ? `${base}/purchases/subscriptionsv2/tokens/${purchaseToken}`
    : `${base}/purchases/products/${productId}/tokens/${purchaseToken}`;

  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`play api error: ${res.status}`);
  const data = await res.json();

  let status: ValidatedReceipt['status'] = 'active';
  let purchasedAt = new Date();
  let expiresAt: Date | undefined;

  if (isSubscription) {
    // subscriptionsv2: subscriptionState + lineItems[].expiryTime
    const state = data.subscriptionState;
    status = state === 'SUBSCRIPTION_STATE_ACTIVE' ? 'active'
      : state === 'SUBSCRIPTION_STATE_EXPIRED' ? 'expired' : 'revoked';
    const expiry = data.lineItems?.[0]?.expiryTime;
    if (expiry) expiresAt = new Date(expiry);
    if (data.startTime) purchasedAt = new Date(data.startTime);
  } else {
    // products: purchaseState 0=purchased,1=canceled,2=pending
    status = data.purchaseState === 0 ? 'active' : data.purchaseState === 1 ? 'refunded' : 'pending';
    if (data.purchaseTimeMillis) purchasedAt = new Date(Number(data.purchaseTimeMillis));
  }

  return {
    userId,
    product: isSubscription ? 'community_subscription' : 'course_access',
    platform: 'google',
    storeTransactionId: data.orderId ?? data.latestOrderId ?? purchaseToken,
    receiptRef: purchaseToken,
    purchasedAt,
    expiresAt,
    status,
  };
}
