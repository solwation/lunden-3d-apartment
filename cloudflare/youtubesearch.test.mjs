import test from 'node:test';
import assert from 'node:assert/strict';
import { searchYouTube, youtubeSearchFetch } from './youtubesearch.js';
import worker from './worker.js';

const item = (id, title = 'Film') => ({ id: { videoId: id }, snippet: { title, channelTitle: 'Kanal' } });

test('YouTube search sends a bounded video-only request and returns safe plain result fields', async () => {
  let seen;
  const items = await searchYouTube('  lunden  ', { key: 'never-logged-test-key', fetcher: async (url, options) => {
    seen = { url: new URL(url), options };
    return Response.json({ items: [item('M7lc1UVf-VE', '<b>Test</b>'), item('bad', 'Ignored')] });
  } });
  assert.equal(seen.url.origin + seen.url.pathname, 'https://www.googleapis.com/youtube/v3/search');
  assert.equal(seen.url.searchParams.get('q'), 'lunden');
  assert.equal(seen.url.searchParams.get('type'), 'video');
  assert.equal(seen.url.searchParams.get('maxResults'), '8');
  assert.equal(seen.url.searchParams.get('key'), 'never-logged-test-key');
  assert.equal(seen.options.redirect, 'manual');
  assert.deepEqual(items, [{ id: 'M7lc1UVf-VE', title: '<b>Test</b>', channel: 'Kanal' }]);
});

test('invalid queries, missing key, upstream errors and malformed payload fail closed', async () => {
  for (const query of ['', 'x', 'q'.repeat(81), 'ok\nno']) await assert.rejects(searchYouTube(query, { key: 'k', fetcher: () => { throw Error('must not fetch'); } }));
  await assert.rejects(searchYouTube('valid', { key: '' }));
  await assert.rejects(searchYouTube('valid', { key: 'k', fetcher: async () => new Response('', { status: 403 }) }));
  await assert.rejects(searchYouTube('valid', { key: 'k', fetcher: async () => Response.json({ error: {} }) }));
});

test('Worker route keeps the key server-side and returns generic errors', async () => {
  const key = 'private-test-value';
  const req = new Request('https://w/youtube-search?q=hello', { headers: { Origin: 'https://solwation.github.io' } });
  const old = globalThis.fetch;
  try {
    globalThis.fetch = async url => {
      assert.equal(new URL(url).searchParams.get('key'), key);
      return Response.json({ items: [item('aqz-KE-bpKQ', 'Hello')] });
    };
    const response = await youtubeSearchFetch(req, { YOUTUBE_API_KEY: key }, { 'Access-Control-Allow-Origin': 'https://solwation.github.io' });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await response.json(), { items: [{ id: 'aqz-KE-bpKQ', title: 'Hello', channel: 'Kanal' }] });
    const bad = await youtubeSearchFetch(new Request('https://w/youtube-search?q=x'), { YOUTUBE_API_KEY: key }, {});
    assert.equal(bad.status, 400);
    const absent = await youtubeSearchFetch(new Request('https://w/youtube-search?q=hello'), {}, {});
    assert.equal(absent.status, 503);
  } finally { globalThis.fetch = old; }
});

test('real Worker router serves search with its existing site CORS policy', async () => {
  const old = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ items: [item('M7lc1UVf-VE', 'Trailer')] });
    const response = await worker.fetch(new Request('https://w/youtube-search?q=trailer', {
      headers: { Origin: 'https://solwation.github.io', 'CF-Connecting-IP': 'search-test' },
    }), { YOUTUBE_API_KEY: 'private-test-value' });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://solwation.github.io');
    assert.deepEqual(await response.json(), { items: [{ id: 'M7lc1UVf-VE', title: 'Trailer', channel: 'Kanal' }] });
  } finally { globalThis.fetch = old; }
});
