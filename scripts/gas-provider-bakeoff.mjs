#!/usr/bin/env node

/**
 * Gas provider bake-off harness (RapidAPI)
 *
 * Usage:
 *   node scripts/gas-provider-bakeoff.mjs --location 44224
 *   node scripts/gas-provider-bakeoff.mjs --location "Akron,OH"
 */

const DEFAULT_LOCATION = '44224';

const DEFAULT_PROVIDERS = [
  {
    name: 'ProviderA',
    host: 'example-gas-provider.p.rapidapi.com',
    path: '/stations/search',
    method: 'GET',
    query: {
      location: '{location}',
    },
  },
  {
    name: 'ProviderB',
    host: 'example-fuel-prices.p.rapidapi.com',
    path: '/nearby',
    method: 'GET',
    query: {
      zip: '{location}',
    },
  },
];

function parseArgs(argv) {
  const args = argv.slice(2);
  let location = DEFAULT_LOCATION;

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === '--location' || token === '-l') {
      location = args[i + 1] || DEFAULT_LOCATION;
      i += 1;
      continue;
    }
    if (token.startsWith('--location=')) {
      location = token.split('=')[1] || DEFAULT_LOCATION;
      continue;
    }
    if (!token.startsWith('-')) {
      location = token;
    }
  }

  return { location };
}

function printSetupAndExit(message) {
  const lines = [
    '',
    'Gas provider bake-off setup required:',
    `- ${message}`,
    '',
    'Required env vars:',
    '  RAPIDAPI_KEY=<your rapidapi key>',
    '  GAS_BAKEOFF_PROVIDERS_JSON=<json array of provider configs>',
    '',
    'Provider config shape (JSON array):',
    '  [{',
    '    "name": "My Provider",',
    '    "host": "provider-host.p.rapidapi.com",',
    '    "path": "/endpoint",',
    '    "method": "GET",',
    '    "query": { "zip": "{location}" },',
    '    "body": null',
    '  }]',
    '',
    'Run example:',
    '  RAPIDAPI_KEY=*** GAS_BAKEOFF_PROVIDERS_JSON=\'[...]\' node scripts/gas-provider-bakeoff.mjs --location 44224',
    '',
  ];
  console.error(lines.join('\n'));
  process.exit(1);
}

function parseProvidersFromEnv() {
  const raw = process.env.GAS_BAKEOFF_PROVIDERS_JSON;
  if (!raw || !raw.trim()) {
    return DEFAULT_PROVIDERS;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('GAS_BAKEOFF_PROVIDERS_JSON must be a non-empty JSON array.');
    }
    return parsed;
  } catch (error) {
    printSetupAndExit(`Invalid GAS_BAKEOFF_PROVIDERS_JSON (${error.message}).`);
  }
}

function applyTemplate(value, location) {
  if (typeof value === 'string') {
    return value.replaceAll('{location}', location);
  }
  return value;
}

function buildUrl(provider, location) {
  const path = provider.path || '/';
  const url = new URL(`https://${provider.host}${path}`);

  const query = provider.query || {};
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(applyTemplate(value, location)));
  }

  return url;
}

function getPath(obj, path) {
  if (!path) return undefined;
  const parts = String(path).split('.');
  let current = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

function toNumber(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[^\d.\-]/g, '');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function pickFirst(obj, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] != null && obj[key] !== '') {
      return obj[key];
    }
  }
  return null;
}

function normalizeStation(rawStation) {
  const addressParts = [
    pickFirst(rawStation, ['address', 'street', 'address1', 'line1']),
    pickFirst(rawStation, ['city', 'town']),
    pickFirst(rawStation, ['state', 'province']),
    pickFirst(rawStation, ['zip', 'postal_code', 'postalCode']),
  ].filter(Boolean);

  const name = pickFirst(rawStation, ['name', 'station_name', 'stationName', 'brand']) || 'Unknown Station';
  const address = pickFirst(rawStation, ['fullAddress', 'formatted_address']) || addressParts.join(', ') || 'Unknown Address';
  const distance = toNumber(pickFirst(rawStation, ['distance', 'distance_miles', 'distanceMiles', 'miles']));

  const regular = toNumber(pickFirst(rawStation, ['regular', 'regular_price', 'regularPrice', 'price_regular', 'unleaded']));
  const mid = toNumber(pickFirst(rawStation, ['mid', 'mid_price', 'midPrice', 'price_mid']));
  const premium = toNumber(pickFirst(rawStation, ['premium', 'premium_price', 'premiumPrice', 'price_premium']));
  const diesel = toNumber(pickFirst(rawStation, ['diesel', 'diesel_price', 'dieselPrice', 'price_diesel']));

  const updatedAt =
    pickFirst(rawStation, ['updatedAt', 'updated_at', 'lastUpdated', 'price_updated_at', 'timestamp']) || null;

  return {
    name,
    address,
    distance,
    regular,
    mid,
    premium,
    diesel,
    updatedAt,
  };
}

function extractStations(payload, provider) {
  if (provider.stationsPath) {
    const fromPath = getPath(payload, provider.stationsPath);
    if (Array.isArray(fromPath)) return fromPath;
  }

  const candidates = [
    payload?.stations,
    payload?.data?.stations,
    payload?.data,
    payload?.results,
    payload?.response,
    payload,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return [];
}

function metricPercent(part, total) {
  if (!total) return '0.0%';
  return `${((part / total) * 100).toFixed(1)}%`;
}

function hasAnyPrice(station) {
  return [station.regular, station.mid, station.premium, station.diesel].some((n) => typeof n === 'number');
}

function summarize(providerName, stations) {
  const coverageCount = stations.length;
  const withPriceCount = stations.filter(hasAnyPrice).length;
  const withRecencyCount = stations.filter((s) => Boolean(s.updatedAt)).length;

  const sampleStations = stations.slice(0, 3).map((s) => ({
    name: s.name,
    distance: s.distance,
    regular: s.regular,
    updatedAt: s.updatedAt,
  }));

  return {
    providerName,
    coverageCount,
    withPricePct: metricPercent(withPriceCount, coverageCount),
    recencyPct: metricPercent(withRecencyCount, coverageCount),
    sampleStations,
  };
}

async function fetchProvider(provider, location, rapidApiKey) {
  if (!provider?.name || !provider?.host || !provider?.path) {
    return {
      providerName: provider?.name || 'Unknown Provider',
      error: 'Provider config missing required fields: name, host, path.',
      stations: [],
    };
  }

  const url = buildUrl(provider, location);
  const method = (provider.method || 'GET').toUpperCase();

  const headers = {
    'x-rapidapi-key': rapidApiKey,
    'x-rapidapi-host': provider.host,
    accept: 'application/json',
  };

  let body;
  if (provider.body != null) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(
      JSON.parse(
        JSON.stringify(provider.body).replaceAll('{location}', location),
      ),
    );
  }

  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        providerName: provider.name,
        error: `HTTP ${response.status} ${response.statusText}: ${text.slice(0, 240)}`,
        stations: [],
      };
    }

    const payload = await response.json();
    const rawStations = extractStations(payload, provider);
    const stations = rawStations.map(normalizeStation);

    return {
      providerName: provider.name,
      stations,
      error: null,
    };
  } catch (error) {
    return {
      providerName: provider.name,
      error: `Request failed: ${error.message}`,
      stations: [],
    };
  }
}

function printScorecard(location, results) {
  console.log(`\nGas Provider Bake-off (location: ${location})`);
  console.log('='.repeat(72));

  const rows = results.map((result) => {
    const summary = summarize(result.providerName, result.stations);
    return {
      Provider: result.providerName,
      Coverage: summary.coverageCount,
      '% With Price': summary.withPricePct,
      '% With updatedAt': summary.recencyPct,
      Status: result.error ? `ERROR: ${result.error}` : 'OK',
    };
  });

  console.table(rows);

  for (const result of results) {
    const summary = summarize(result.providerName, result.stations);
    console.log(`\n--- ${result.providerName} sample stations ---`);
    if (summary.sampleStations.length === 0) {
      console.log('No stations returned.');
      continue;
    }
    for (const station of summary.sampleStations) {
      console.log(
        `- ${station.name} | distance=${station.distance ?? 'n/a'} | regular=${station.regular ?? 'n/a'} | updatedAt=${station.updatedAt ?? 'n/a'}`,
      );
    }
  }

  const normalizedPreview = results.map((result) => ({
    provider: result.providerName,
    normalizedStations: result.stations.slice(0, 2),
  }));

  console.log('\nNormalized shape preview (first 2 stations/provider):');
  console.log(JSON.stringify(normalizedPreview, null, 2));
}

async function main() {
  const { location } = parseArgs(process.argv);
  const rapidApiKey = process.env.RAPIDAPI_KEY;

  if (!rapidApiKey) {
    printSetupAndExit('Missing RAPIDAPI_KEY.');
  }

  const providers = parseProvidersFromEnv();

  const results = [];
  for (const provider of providers) {
    // serialized requests to avoid burst/rate limit issues
    // eslint-disable-next-line no-await-in-loop
    const result = await fetchProvider(provider, location, rapidApiKey);
    results.push(result);
  }

  printScorecard(location, results);

  if (results.every((r) => r.error)) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error('Bake-off script failed unexpectedly:', error);
  process.exit(1);
});
