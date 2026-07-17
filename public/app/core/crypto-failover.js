(function initMissionControlCryptoFailover(global){
  const providerHealth = new Map();

  function abortError(code = 'operation_aborted'){
    const error = new Error(code);
    error.name = 'AbortError';
    error.code = code;
    return error;
  }

  function signalError(signal, fallback = 'operation_aborted'){
    return signal?.reason instanceof Error && typeof signal.reason.code === 'string' && signal.reason.code
      ? signal.reason
      : abortError(fallback);
  }

  function throwIfAborted(signal){
    if (signal?.aborted) throw signalError(signal);
  }

  async function delay(ms, { signal } = {}){
    const waitMs = Number(ms);
    if (!Number.isFinite(waitMs) || waitMs <= 0) return;
    throwIfAborted(signal);
    await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        fn(value);
      };
      const onAbort = () => finish(reject, signalError(signal));
      const timer = setTimeout(() => finish(resolve), waitMs);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  function defaultIsRetryableError(error){
    const status = Number(error?.status || 0);
    if (error?.code === 'provider_attempt_timeout') return true;
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

  function jitteredBackoffMs(attempt, baseMs, maxMs, random = Math.random){
    const ceiling = Math.min(baseMs * (2 ** Math.max(0, attempt - 1)), maxMs);
    const sample = Math.min(1, Math.max(0, Number(random()) || 0));
    return Math.max(1, Math.floor(ceiling * sample));
  }

  function waitForAttempt(value, signal){
    throwIfAborted(signal);
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn, result) => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        fn(result);
      };
      const onAbort = () => finish(reject, signalError(signal));
      signal?.addEventListener('abort', onAbort, { once: true });
      Promise.resolve(value).then(
        (result) => finish(resolve, result),
        (error) => finish(reject, error),
      );
    });
  }

  async function runProviderAttempt(tryProvider, provider, attempt, { signal, attemptTimeoutMs, deadlineAt }){
    const controller = new AbortController();
    const onOperationAbort = () => controller.abort(signalError(signal));
    if (signal?.aborted) onOperationAbort();
    else signal?.addEventListener('abort', onOperationAbort, { once: true });
    const timer = setTimeout(() => controller.abort(abortError('provider_attempt_timeout')), attemptTimeoutMs);
    try {
      return await waitForAttempt(
        tryProvider(provider, attempt, { signal: controller.signal, deadlineAt }),
        controller.signal,
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onOperationAbort);
    }
  }

  function clearProviderHealth(healthStore = providerHealth){
    healthStore?.clear?.();
  }

  async function fetchWithFailover(options = {}){
    const providers = Array.isArray(options.providers) ? options.providers.filter(Boolean) : [];
    const tryProvider = typeof options.tryProvider === 'function' ? options.tryProvider : null;
    const shouldAcceptResult = typeof options.shouldAcceptResult === 'function'
      ? options.shouldAcceptResult
      : (value) => value != null;
    const retries = Math.max(0, Math.floor(Number(options.retries ?? 1) || 0));
    const backoffBaseMs = Math.max(50, Number(options.backoffBaseMs ?? 400));
    const backoffMaxMs = Math.max(backoffBaseMs, Number(options.backoffMaxMs ?? 2200));
    const operationTimeoutMs = Math.max(1, Number(options.operationTimeoutMs ?? 12000));
    const attemptTimeoutMs = Math.max(1, Math.min(operationTimeoutMs, Number(options.attemptTimeoutMs ?? 5000)));
    const unhealthyCooldownMs = Math.max(0, Number(options.unhealthyCooldownMs ?? 30000));
    const isRetryableError = typeof options.isRetryableError === 'function'
      ? options.isRetryableError
      : defaultIsRetryableError;
    const onAttemptFailure = typeof options.onAttemptFailure === 'function' ? options.onAttemptFailure : null;
    const onProviderSkipped = typeof options.onProviderSkipped === 'function' ? options.onProviderSkipped : null;
    const sleep = typeof options.delay === 'function' ? options.delay : delay;
    const random = typeof options.random === 'function' ? options.random : Math.random;
    const now = typeof options.now === 'function' ? options.now : Date.now;
    const healthStore = options.healthStore instanceof Map ? options.healthStore : providerHealth;
    const providerKey = typeof options.providerKey === 'function' ? options.providerKey : (provider) => String(provider);

    if (!tryProvider) throw new Error('fetchWithFailover requires tryProvider(provider).');

    const operationController = new AbortController();
    const parentSignal = options.signal;
    const onParentAbort = () => operationController.abort(signalError(parentSignal));
    if (parentSignal?.aborted) onParentAbort();
    else parentSignal?.addEventListener('abort', onParentAbort, { once: true });
    const deadlineAt = now() + operationTimeoutMs;
    const operationTimer = setTimeout(() => operationController.abort(abortError('operation_deadline_exceeded')), operationTimeoutMs);
    const errors = [];

    try {
      for (const provider of providers) {
        throwIfAborted(operationController.signal);
        const key = String(providerKey(provider) || provider);
        const health = healthStore.get(key);
        if (health?.unhealthyUntil > now()) {
          const error = decorateProviderError(provider, abortError('provider_temporarily_unhealthy'), 0);
          error.retryAt = health.unhealthyUntil;
          error.skipped = true;
          errors.push(error);
          if (onProviderSkipped) onProviderSkipped({ provider, error, retryAt: health.unhealthyUntil });
          continue;
        }

        for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
          try {
            const result = await runProviderAttempt(tryProvider, provider, attempt, {
              signal: operationController.signal,
              attemptTimeoutMs,
              deadlineAt,
            });
            if (!shouldAcceptResult(result, provider)) {
              throw decorateProviderError(provider, new Error('Empty provider response'), attempt);
            }
            healthStore.delete(key);
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
            if (operationController.signal.aborted) {
              error.errors = errors;
              throw error;
            }
            if (onAttemptFailure) onAttemptFailure({ provider, attempt, error });

            const retryable = isRetryableError(error);
            const canRetry = attempt <= retries && retryable;
            if (canRetry) {
              const waitMs = jitteredBackoffMs(attempt, backoffBaseMs, backoffMaxMs, random);
              try {
                await sleep(waitMs, { signal: operationController.signal });
              } catch (waitError) {
                waitError.errors = errors;
                throw waitError;
              }
              continue;
            }
            if (retryable && unhealthyCooldownMs > 0) {
              healthStore.set(key, {
                unhealthyUntil: now() + unhealthyCooldownMs,
                lastErrorCode: String(error?.code || ''),
              });
            }
            break;
          }
        }
      }

      const finalError = errors[errors.length - 1] || new Error('All providers failed');
      finalError.errors = errors;
      throw finalError;
    } finally {
      clearTimeout(operationTimer);
      parentSignal?.removeEventListener('abort', onParentAbort);
    }
  }

  const api = {
    abortError,
    delay,
    defaultIsRetryableError,
    decorateProviderError,
    jitteredBackoffMs,
    clearProviderHealth,
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
