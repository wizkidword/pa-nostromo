import assert from 'node:assert/strict';

const { extractFacebookPublicFollowerEstimate, parseCompactCount } = await import('../server.js');

assert.equal(parseCompactCount('12.3k'), 12300);
assert.equal(parseCompactCount('4,567'.replace(',', '')), 4567);

const sampleHtml = `
<html>
<head><meta property="og:title" content="Blast From The Ads" /></head>
<body>
<script type="application/json">{"fan_count": "12450"}</script>
<div>12.8K followers</div>
</body>
</html>`;

const parsed = extractFacebookPublicFollowerEstimate(sampleHtml);
assert.equal(parsed.count, 12800);
assert.ok(parsed.signal);

console.log('facebook-public-scrape-parser: PASS');
