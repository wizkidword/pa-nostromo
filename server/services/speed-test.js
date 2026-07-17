'use strict';

function createSpeedTestService({ workCoordinator, timeoutMs, cooldownMs, runBackendSpeedTest }) {
  return async function runSpeedTest(signal) {
    return workCoordinator.run({
      key: 'speed-test',
      integration: 'speed-test',
      host: 'local',
      signal,
      timeoutMs,
      manual: true,
      cooldownMs,
    }, ({ signal: coordinatedSignal }) => runBackendSpeedTest(coordinatedSignal));
  };
}

module.exports = { createSpeedTestService };
