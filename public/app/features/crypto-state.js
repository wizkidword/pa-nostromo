(function installCryptoStateFeature(global) {
  'use strict';

  const providerChain = ['coincap', 'coingecko', 'cryptocompare'];
  const providerLabels = {
    coingecko: 'CoinGecko',
    coincap: 'CoinCap',
    cryptocompare: 'CryptoCompare',
  };
  const defaultProvider = 'coincap';
  const preferredFallback = 'coingecko';
  const persistedIdAliases = {
    btc: 'bitcoin',
    eth: 'ethereum',
    doge: 'dogecoin',
    sol: 'solana',
  };

  function normalizeState(watchlistInput, holdingsInput) {
    const watchlist = [...new Set(
      (Array.isArray(watchlistInput) ? watchlistInput : ['bitcoin', 'ethereum'])
        .map((value) => String(value || '').trim().toLowerCase())
        .filter(Boolean)
        .map((value) => value.replace(/^[@#$]+/, ''))
        .map((value) => persistedIdAliases[value] || value)
    )];
    const holdingsRaw = (holdingsInput && typeof holdingsInput === 'object') ? holdingsInput : {};
    const holdings = {};
    for (const [coinIdRaw, holding] of Object.entries(holdingsRaw)) {
      const coinIdNormalized = String(coinIdRaw || '').trim().toLowerCase();
      const coinId = persistedIdAliases[coinIdNormalized] || coinIdNormalized;
      if (!coinId) continue;
      const quantity = Number(holding?.quantity ?? 0);
      const avgBuyPrice = Number(holding?.avgBuyPrice ?? holding?.averageBuyPrice ?? 0);
      holdings[coinId] = {
        quantity: Number.isFinite(quantity) && quantity >= 0 ? quantity : 0,
        avgBuyPrice: Number.isFinite(avgBuyPrice) && avgBuyPrice >= 0 ? avgBuyPrice : 0,
      };
    }
    return { watchlist, holdings };
  }

  function normalizeProviderChain(chain) {
    const allowed = new Set(Object.keys(providerLabels));
    const ordered = [];
    const add = (provider) => {
      const key = String(provider || '').toLowerCase();
      if (!allowed.has(key) || ordered.includes(key)) return;
      ordered.push(key);
    };
    add(defaultProvider);
    add(preferredFallback);
    for (const provider of Array.isArray(chain) ? chain : []) add(provider);
    for (const provider of providerChain) add(provider);
    return ordered;
  }

  const api = {
    providerChain,
    providerLabels,
    defaultProvider,
    preferredFallback,
    persistedIdAliases,
    normalizeState,
    normalizeProviderChain,
  };
  global.MissionControlModules = global.MissionControlModules || {};
  global.MissionControlModules.cryptoState = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
