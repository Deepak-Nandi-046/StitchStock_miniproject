const test = require('node:test');
const assert = require('node:assert/strict');
const { parseEvidence, parseRejectionReason } = require('../controllers/returnRequestController');

const dataUrl = (mimeType, buffer = Buffer.from('evidence')) =>
  `data:${mimeType};base64,${buffer.toString('base64')}`;

test('return evidence accepts supported photos and video', () => {
  const files = parseEvidence([
    { name: 'product.jpg', data: dataUrl('image/jpeg') },
    { name: 'product.mp4', data: dataUrl('video/mp4') },
  ]);
  assert.equal(files.length, 2);
  assert.equal(files[0].mimeType, 'image/jpeg');
  assert.equal(files[1].mimeType, 'video/mp4');
  assert.deepEqual(files[0].buffer, Buffer.from('evidence'));
});

test('return evidence rejects unsupported types and more than three photos', () => {
  assert.throws(() => parseEvidence([
    { name: 'file.txt', data: dataUrl('text/plain') },
  ]), /Evidence must be JPG/);

  assert.throws(() => parseEvidence(Array.from({ length: 4 }, (_, index) => ({
    name: `photo-${index}.jpg`,
    data: dataUrl('image/jpeg'),
  }))), /Choose up to 3 photos and 1 video/);
});

test('return evidence enforces the per-file photo size limit', () => {
  const oversizedPhoto = Buffer.alloc(2 * 1024 * 1024 + 1);
  assert.throws(() => parseEvidence([
    { name: 'large.jpg', data: dataUrl('image/jpeg', oversizedPhoto) },
  ]), /Photos must be 2 MB or smaller/);
});

test('a rejected request requires a trimmed reason of at most 1,000 characters', () => {
  assert.equal(parseRejectionReason('Rejected', '  Item does not meet the return policy.  '),
    'Item does not meet the return policy.');
  assert.throws(() => parseRejectionReason('Rejected', '  '), /Enter a rejection reason/);
  assert.throws(() => parseRejectionReason('Rejected', 'x'.repeat(1001)), /up to 1,000 characters/);
  assert.equal(parseRejectionReason('Approved', ''), '');
});
