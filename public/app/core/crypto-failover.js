(function initMissionControlCryptoFailover(global){
  async function delay(ms){
    const waitMs = Number(ms);
    if (!Number.isFinite(waitMs) || waitMs <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  function defaultIsRetryableError(error){
    const status = Number(error?.status || 0);
    if (status === 429) return true;
    if (status >= 500) return true;
    const msg = String(error?.message || '').toLowerCase();
    return msg.includes('timeout')
      || msg.includes('network')
      || msg.includes('fetch failed')
      || msg.includes('temporar')
      || msg.includes('upstream');
  }

  function decorateProviderError(provider, error, attempt){
    const wrapped = error && typeof error === 'object' ? error : new Error(String(error || 'Provider error'));
    wrapped.provider = provider;
    wrapped.attempt = attempt;
    return wrapped;
  }

  async function fetchWithFailover(options = {}){
    const providers = Array.isArray(options.providers) ? options.providers : [];
    const tryProvider = typeof options.tryProvider === 'function' ? options.tryProvider : null;
    const shouldAcceptResult = typeof options.shouldAcceptResult === 'function'
      ? options.shouldAcceptResult
      : (value) => value != null;
    const retries = Math.max(0, Number(options.retries ?? 1));
    const backoffBaseMs = Math.max(50, Number(options.backoffBaseMs ?? 400));
    const backoffMaxMs = Math.max(backoffBaseMs, Number(options.backoffMaxMs ?? 2200));
    const isRetryableError = typeof options.isRetryableError === 'function'
      ? options.isRetryableError
      : defaultIsRetryableError;
    const onAttemptFailure = typeof options.onAttemptFailure === 'function' ? options.onAttemptFailure : null;

    if (!tryProvider) throw new Error('fetchWithFailover requires tryProvider(provider).');

    const errors = [];

    for (const provider of providers) {
      for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
        try {
          const result = await tryProvider(provider, attempt);
          if (!shouldAcceptResult(result, provider)) {
            throw decorateProviderError(provider, new Error('Empty provider response'), attempt);
          }
          return {
            provider,
            result,
            attempts: attempt,
            fallbackUsed: provider !== providers[0],
            errors,
          };
        } catch (rawError) {
          const error = decorateProviderError(provider, rawError, attempt);
          errors.push(error);
          if (onAttemptFailure) onAttemptFailure({ provider, attempt, error });

          const canRetry = attempt <= retries && isRetryableError(error);
          if (canRetry) {
            const waitMs = Math.min(backoffBaseMs * (2 ** (attempt - 1)), backoffMaxMs);
            await delay(waitMs);
            continue;
          }
          break;
        }
      }
    }

    const finalError = errors[errors.length - 1] || new Error('All providers failed');
    finalError.errors = errors;
    throw finalError;
  }

  const api = {
    delay,
    defaultIsRetryableError,
    decorateProviderError,
    fetchWithFailover,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (global) {
    const root = global.MissionControlModules = global.MissionControlModules || {};
    root.cryptoFailover = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
