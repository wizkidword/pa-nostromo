const { spawn } = require('child_process');

class WorkCoordinatorError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'WorkCoordinatorError';
    this.code = code;
  }
}

function attachAbortSignal(controller, signal) {
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener?.('abort', abort, { once: true });
  return () => signal?.removeEventListener?.('abort', abort);
}

class WorkCoordinator {
  constructor(options = {}) {
    this.globalLimit = Math.max(1, Number(options.globalLimit || 4));
    this.perIntegrationLimit = Math.max(1, Number(options.perIntegrationLimit || 1));
    this.perHostLimit = Math.max(1, Number(options.perHostLimit || 2));
    this.inflight = new Map();
    this.queue = [];
    this.active = 0;
    this.activeByIntegration = new Map();
    this.activeByHost = new Map();
    this.lastManualStart = new Map();
    this.closed = false;
  }

  run(options = {}, task) {
    const key = String(options.key || '').trim();
    const integration = String(options.integration || 'default').trim() || 'default';
    const host = String(options.host || '').trim().toLowerCase();
    if (!key || typeof task !== 'function') return Promise.reject(new WorkCoordinatorError('invalid_work', 'A key and task are required.'));
    if (this.closed) return Promise.reject(new WorkCoordinatorError('coordinator_closed', 'The work coordinator is shutting down.'));
    if (this.inflight.has(key)) return this.inflight.get(key).promise;

    const cooldownMs = Math.max(0, Number(options.cooldownMs || 0));
    const now = Date.now();
    const last = this.lastManualStart.get(key) || 0;
    if (options.manual && cooldownMs && now - last < cooldownMs) {
      return Promise.reject(new WorkCoordinatorError('refresh_cooldown', 'This refresh was requested too recently.'));
    }

    const controller = new AbortController();
    const detachAbort = attachAbortSignal(controller, options.signal);
    let resolvePromise;
    let rejectPromise;
    const promise = new Promise((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    const job = {
      key,
      integration,
      host,
      task,
      controller,
      detachAbort,
      resolve: resolvePromise,
      reject: rejectPromise,
      promise,
      timeoutMs: Math.max(0, Number(options.timeoutMs || 0)),
      manual: options.manual === true,
      cooldownMs,
      started: false,
    };
    this.inflight.set(key, job);
    this.queue.push(job);
    this.drain();
    return promise;
  }

  canStart(job) {
    return this.active < this.globalLimit
      && (this.activeByIntegration.get(job.integration) || 0) < this.perIntegrationLimit
      && (!job.host || (this.activeByHost.get(job.host) || 0) < this.perHostLimit);
  }

  drain() {
    while (!this.closed) {
      const index = this.queue.findIndex((job) => job.controller.signal.aborted || this.canStart(job));
      if (index < 0) return;
      const [job] = this.queue.splice(index, 1);
      if (job.controller.signal.aborted) {
        this.finishQueuedAbort(job);
        continue;
      }
      this.start(job);
    }
  }

  finishQueuedAbort(job) {
    this.inflight.delete(job.key);
    job.detachAbort();
    job.reject(new WorkCoordinatorError('work_cancelled', 'The queued work was cancelled.'));
  }

  start(job) {
    job.started = true;
    this.active += 1;
    this.activeByIntegration.set(job.integration, (this.activeByIntegration.get(job.integration) || 0) + 1);
    if (job.host) this.activeByHost.set(job.host, (this.activeByHost.get(job.host) || 0) + 1);
    if (job.manual) this.lastManualStart.set(job.key, Date.now());
    const timer = job.timeoutMs ? setTimeout(() => job.controller.abort(), job.timeoutMs) : null;

    Promise.resolve()
      .then(() => job.task({ signal: job.controller.signal }))
      .then((value) => job.resolve(value), (error) => {
        if (job.controller.signal.aborted && !(error instanceof WorkCoordinatorError)) {
          job.reject(new WorkCoordinatorError('work_cancelled', 'The work was cancelled or timed out.'));
        } else {
          job.reject(error);
        }
      })
      .finally(() => {
        if (timer) clearTimeout(timer);
        job.detachAbort();
        this.inflight.delete(job.key);
        this.active -= 1;
        this.activeByIntegration.set(job.integration, Math.max(0, (this.activeByIntegration.get(job.integration) || 1) - 1));
        if (job.host) this.activeByHost.set(job.host, Math.max(0, (this.activeByHost.get(job.host) || 1) - 1));
        this.drain();
      });
  }

  close() {
    this.closed = true;
    for (const job of this.queue.splice(0)) {
      job.controller.abort();
      this.finishQueuedAbort(job);
    }
    for (const job of this.inflight.values()) job.controller.abort();
  }

  runChild(options = {}) {
    const command = String(options.command || '').trim();
    if (!command) return Promise.reject(new WorkCoordinatorError('invalid_child', 'A child-process command is required.'));
    return this.run(options, ({ signal }) => new Promise((resolve, reject) => {
      const child = spawn(command, Array.isArray(options.args) ? options.args : [], {
        cwd: options.cwd,
        env: options.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      let stdout = '';
      let stderr = '';
      let killTimer = null;
      const terminate = () => {
        child.kill('SIGTERM');
        killTimer = setTimeout(() => child.kill('SIGKILL'), 2_000);
      };
      if (signal.aborted) terminate();
      else signal.addEventListener('abort', terminate, { once: true });
      child.stdout?.on('data', (chunk) => { stdout += chunk; });
      child.stderr?.on('data', (chunk) => { stderr += chunk; });
      child.once('error', reject);
      child.once('close', (code, signalName) => {
        if (killTimer) clearTimeout(killTimer);
        signal.removeEventListener('abort', terminate);
        if (signal.aborted) return reject(new WorkCoordinatorError('work_cancelled', 'The child process was cancelled.'));
        resolve({ code, signal: signalName, stdout, stderr });
      });
    }));
  }
}

function createWorkCoordinator(options) {
  return new WorkCoordinator(options);
}

module.exports = { WorkCoordinatorError, WorkCoordinator, createWorkCoordinator };
