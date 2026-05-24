import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Ajv } from 'ajv';
import { captionSchema, formatCaption, type CaptionContent } from '../src/schemas/caption.js';
import { buildMediaGroup } from '../src/delivery/telegram.js';

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(captionSchema);

test('caption schema accepts a complete caption and rejects extras/missing', () => {
  const ok: CaptionContent = {
    hook: 'Хук',
    body: 'Тело',
    cta: 'Пиши «OPUS»',
    hashtags: ['#ai', '#claude'],
  };
  assert.ok(validate(ok), ajv.errorsText(validate.errors));
  assert.equal(validate({ hook: 'x', body: 'y', cta: 'z' }), false); // missing hashtags
  assert.equal(
    validate({ hook: 'x', body: 'y', cta: 'z', hashtags: [], extra: 1 }),
    false, // additional property
  );
});

test('formatCaption joins parts with blank lines and trims empties', () => {
  const text = formatCaption({
    hook: 'Хук',
    body: 'Основной текст',
    cta: 'Пиши «OPUS»',
    hashtags: ['#ai', '#claude'],
  });
  assert.equal(text, 'Хук\n\nОсновной текст\n\nПиши «OPUS»\n\n#ai #claude');
});

test('buildMediaGroup maps field names to attach:// photo entries', () => {
  assert.deepEqual(buildMediaGroup(['photo-0', 'photo-1']), [
    { type: 'photo', media: 'attach://photo-0' },
    { type: 'photo', media: 'attach://photo-1' },
  ]);
});
