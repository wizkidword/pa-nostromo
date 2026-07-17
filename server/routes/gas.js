'use strict';

function createGasPricesApiHandler({
  sendJson,
  createClientAbortSignal,
  resolveUsStateFromLocation,
  fetchAaaStateGasPrices,
  now = () => new Date(),
}) {
  return async function handleApiGasPrices(req, res) {
    if (req.method !== 'GET') {
      return sendJson(res, 405, { ok: false, error: 'method_not_allowed', message: 'Use GET /api/gas-prices?location=ZIP_OR_CITY_STATE.' });
    }

    const requestUrl = new URL(req.url || '/api/gas-prices', 'http://localhost');
    const location = String(requestUrl.searchParams.get('location') || '').trim();
    if (!location) {
      return sendJson(res, 400, { ok: false, error: 'missing_location', message: 'Provide location query param (ZIP or City, ST).' });
    }

    const clientRequest = createClientAbortSignal(req, res);
    try {
      const resolved = await resolveUsStateFromLocation(location, { signal: clientRequest.signal });
      if (!resolved.code) {
        return sendJson(res, 400, {
          ok: false,
          error: 'state_unresolved',
          message: 'Could not resolve a U.S. state from that location. Try a 5-digit ZIP or include state (e.g., "Akron, OH").',
        });
      }
      const gas = await fetchAaaStateGasPrices(resolved, { signal: clientRequest.signal });

      return sendJson(res, 200, {
        ok: true,
        provider: 'aaa-state-average',
        stateCode: resolved.code,
        resolvedLocation: resolved.label || resolved.code,
        sourceUrl: gas.sourceUrl,
        fetchedAt: now().toISOString(),
        prices: gas.prices,
      });
    } catch (err) {
      if (err?.code === 'aaa_gas_parser_required_fields_missing') {
        return sendJson(res, 502, { ok: false, error: 'parse_failed', message: 'AAA page format changed or prices were unavailable.' });
      }
      return sendJson(res, 502, {
        ok: false,
        error: 'gas_upstream_failed',
        message: String(err?.message || err || 'Failed to fetch gas prices from AAA').slice(0, 180),
      });
    } finally {
      clientRequest.dispose();
    }
  };
}

module.exports = { createGasPricesApiHandler };
