import { test } from 'node:test';
import assert from 'node:assert/strict';
import { errorText } from '../src/lib/error-text';

test('known code → Russian text, never the raw code', () => {
  assert.equal(errorText({ error: 'persona_required' }, 409), 'Выберите персону для брифа.');
  assert.doesNotMatch(errorText({ error: 'some_unknown_code' }, 500), /some_unknown_code/);
});

test('Russian server message wins; English message is not shown', () => {
  assert.equal(errorText({ error: 'split_failed', message: 'Текст слишком короткий' }), 'Текст слишком короткий');
  assert.equal(errorText({ error: 'split_failed', message: 'upstream 500' }), errorText({ error: 'split_failed' }));
});

test('insufficient tokens shows numbers', () => {
  assert.equal(errorText({ error: 'insufficient_tokens', have: 1, need: 5 }), 'Недостаточно токенов: есть 1, нужно 5.');
});

import { reasonLabel } from '../src/lib/token-reasons';

test('token reasons → Russian labels, no raw codes', () => {
  assert.equal(reasonLabel('video:heygen-v5:retry'), 'Видео — повтор');
  assert.equal(reasonLabel('cover-generation:failed'), 'Обложка — ошибка генерации');
  assert.equal(reasonLabel('research_hook_gen'), 'Ресёрч · генерация хуков');
  assert.equal(reasonLabel('some_new_code'), 'Операция');
  assert.equal(reasonLabel('Бонус за отзыв'), 'Бонус за отзыв');
});

import { jobErrorText } from '../src/lib/error-text';

test('job errors never leak provider diagnostics', () => {
  const generic = jobErrorText(null);
  assert.equal(jobErrorText('HEYGEN_FAILED: FAKE_FAIL in script'), generic);
  assert.equal(jobErrorText('OMNIHUMAN_TTS_HTTP_500: {"detail":{"status":"fake_failure"}}'), generic);
  assert.equal(jobErrorText('500: fake failure (FAKE_FAIL in prompt)'), generic);
  assert.equal(jobErrorText('NO_AUDIO: в исходнике нет звуковой дорожки'), 'В исходнике нет звуковой дорожки.');
  assert.equal(jobErrorText('ACCOUNT_INACTIVE: Канал отключён или токен истёк (revoked)'), 'Канал отключён или токен истёк (revoked)');
  assert.equal(jobErrorText('Не удалось смонтировать. Повторите попытку.'), 'Не удалось смонтировать. Повторите попытку.');
});
