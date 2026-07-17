'use strict';

function createSystemResourcesService({
  os,
  platform,
  readNetTotals,
  readDiskUsagePercent,
  readTopProcesses,
  delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => new Date(),
}) {
  return async function sampleSystemResources({ allowlist = [] } = {}) {
    const memTotal = os.totalmem();
    const memFree = os.freemem();
    const netBefore = readNetTotals();
    const cpuBefore = os.cpus();

    await delay(250);

    const [diskPercent, processes] = await Promise.all([
      readDiskUsagePercent(),
      readTopProcesses(),
    ]);

    const cpuAfter = os.cpus();
    const netAfter = readNetTotals();

    let cpuPercent = null;
    if (Array.isArray(cpuBefore) && Array.isArray(cpuAfter) && cpuBefore.length && cpuBefore.length === cpuAfter.length) {
      let totalIdle = 0;
      let totalTick = 0;
      for (let index = 0; index < cpuBefore.length; index += 1) {
        const before = cpuBefore[index].times;
        const after = cpuAfter[index].times;
        const idle = Math.max(0, (after.idle || 0) - (before.idle || 0));
        const totalBefore = (before.user || 0) + (before.nice || 0) + (before.sys || 0) + (before.irq || 0) + (before.idle || 0);
        const totalAfter = (after.user || 0) + (after.nice || 0) + (after.sys || 0) + (after.irq || 0) + (after.idle || 0);
        totalIdle += idle;
        totalTick += Math.max(0, totalAfter - totalBefore);
      }
      if (totalTick > 0) cpuPercent = Math.max(0, Math.min(100, Number((((totalTick - totalIdle) / totalTick) * 100).toFixed(1))));
    }

    const memoryPercent = memTotal > 0
      ? Math.max(0, Math.min(100, Number((((memTotal - memFree) / memTotal) * 100).toFixed(1))))
      : null;

    const topCpu = [...processes].sort((left, right) => right.cpuPercent - left.cpuPercent).slice(0, 3);
    const topMemory = [...processes].sort((left, right) => right.memPercent - left.memPercent).slice(0, 3);
    const allowlistMatches = allowlist.length
      ? processes.filter((proc) => allowlist.some((needle) => proc.name.toLowerCase().includes(needle))).slice(0, 8)
      : [];

    const netRx = (netBefore && netAfter) ? Math.max(0, netAfter.rxBytes - netBefore.rxBytes) : null;
    const netTx = (netBefore && netAfter) ? Math.max(0, netAfter.txBytes - netBefore.txBytes) : null;

    return {
      ok: true,
      sampledAt: now().toISOString(),
      platform: {
        os: platform,
        diskAdapter: platform === 'win32' ? 'powershell_cim' : 'df',
        processAdapter: platform === 'win32' ? 'powershell_get_process' : 'ps',
        networkAdapter: platform === 'win32' ? 'unavailable' : 'proc_net_dev',
      },
      host: {
        cpuPercent,
        memoryPercent,
        diskPercent,
        network: {
          downBytesPerSec: netRx != null ? Math.round(netRx * 4) : null,
          upBytesPerSec: netTx != null ? Math.round(netTx * 4) : null,
        },
        uptimeSec: Math.floor(os.uptime()),
      },
      processes: {
        scanned: processes.length,
        topCpu,
        topMemory,
        allowlist,
        allowlistMatches,
      },
    };
  };
}

module.exports = { createSystemResourcesService };
