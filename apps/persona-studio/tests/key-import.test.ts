import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractKeys } from '../src/lib/key-import';

test('extractKeys picks labelled provider keys out of a notes dump', () => {
  const kie = 'a'.repeat(8) + '0123456789abcdef0123456789ab'.slice(0, 24);
  const text = [
    'Ключ API Клода ANTHROPIC_API_KEY',
    `sk-ant-api03-${'x'.repeat(90)} Просто открываешь Terminal`,
    'IPv4 1.2.3.4 Password HhWux4JAgxbthTR3E7rX',
    `Heygen\nsk_V2_hgu_${'k'.repeat(40)}`,
    `Apify\napify_api_${'A1'.repeat(15)}`,
    `OPENAI_API_KEY\nsk-proj-${'p'.repeat(60)}  https://kie.ai/ ${kie}`,
    `Submagic\nAuthorization: sk-${'f'.repeat(64)}`,
    ` elevenlabs sk_${'c'.repeat(48)}`,
    `voyageai pa-${'v'.repeat(40)}`,
    `MinIO ${'d'.repeat(32)}`,
  ].join('\n');
  const k = extractKeys(text);
  assert.equal(k.ANTHROPIC_API_KEY, `sk-ant-api03-${'x'.repeat(90)}`);
  assert.equal(k.HEYGEN_API_KEY, `sk_V2_hgu_${'k'.repeat(40)}`);
  assert.equal(k.APIFY_TOKEN, `apify_api_${'A1'.repeat(15)}`);
  assert.equal(k.OPENAI_API_KEY, `sk-proj-${'p'.repeat(60)}`);
  assert.equal(k.KIE_API_KEY, kie);
  assert.equal(k.SUBMAGIC_API_KEY, `sk-${'f'.repeat(64)}`);
  assert.equal(k.ELEVENLABS_API_KEY, `sk_${'c'.repeat(48)}`);
  assert.equal(k.VOYAGE_API_KEY, `pa-${'v'.repeat(40)}`);
  assert.equal(Object.keys(k).length, 8, 'passwords / unlabelled hex are ignored');
});
