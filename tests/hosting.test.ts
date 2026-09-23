import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { ConversionQueue } from '../src/queue.js';
import { parseUpload } from '../src/parser.js';

test('queue limits concurrency, preserves order and recovers after release', async () => {
  const queue = new ConversionQueue();
  const first = await queue.acquire();
  let secondStarted = false;
  const second = queue.acquire().then(release => { secondStarted = true; return release; });
  const third = queue.acquire();
  await assert.rejects(queue.acquire(), { statusCode: 429 });
  assert.equal(secondStarted, false);
  first(); first();
  const releaseSecond = await second;
  releaseSecond();
  (await third)();
  (await queue.acquire())();
});

test('proxy deployment requires identity and hides imports from other users', async () => {
  const app = buildApp(async () => parseUpload('a.kml', Buffer.from('<kml><Placemark><Point><coordinates>0,0</coordinates></Point></Placemark></kml>'), 'Teste'), true);
  try {
    assert.equal((await app.inject({ url: '/' })).statusCode, 401);
    assert.equal((await app.inject({ url: '/api/health' })).statusCode, 200);
    const result = await app.inject({ method: 'POST', url: '/api/import', headers: { 'x-authenticated-user': 'alice', 'content-type': 'multipart/form-data; boundary=test' }, payload: '--test\r\nContent-Disposition: form-data; name="operator"\r\n\r\nTeste\r\n--test\r\nContent-Disposition: form-data; name="files"; filename="a.kml"\r\n\r\ncontent\r\n--test--\r\n' });
    assert.equal(result.statusCode, 200, result.body);
    for (const action of ['preview', 'export']) {
      assert.equal((await app.inject({ method: 'POST', url: `/api/import/${result.json().id}/${action}`, headers: { 'x-authenticated-user': 'bob' }, payload: { mapping: {} } })).statusCode, 404);
    }
    assert.equal((await app.inject({ method: 'POST', url: `/api/import/${result.json().id}/preview`, headers: { 'x-authenticated-user': 'alice' }, payload: { mapping: {} } })).statusCode, 200);
  } finally { await app.close(); }
});
