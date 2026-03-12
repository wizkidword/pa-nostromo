(function initMissionControlDebug(global){
  const root = global.MissionControlModules = global.MissionControlModules || {};
  const enabled = /(?:\?|&)mcDebug=1(?:&|$)/.test(global.location?.search || '') || global.localStorage?.getItem('mission-control-debug') === '1';

  const counters = {
    lifecycle: {},
    refresh: {},
    updatedAt: new Date().toISOString(),
  };

  function touch(){
    counters.updatedAt = new Date().toISOString();
  }

  function bump(scope, podId, key){
    const pod = String(podId || 'unknown');
    const metric = String(key || 'unknown');
    if (!counters[scope][pod]) counters[scope][pod] = {};
    counters[scope][pod][metric] = Number(counters[scope][pod][metric] || 0) + 1;
    touch();
  }

  function set(scope, podId, key, value){
    const pod = String(podId || 'unknown');
    const metric = String(key || 'unknown');
    if (!counters[scope][pod]) counters[scope][pod] = {};
    counters[scope][pod][metric] = value;
    touch();
  }

  const api = {
    enabled,
    bumpLifecycle(podId, key){ bump('lifecycle', podId, key); },
    bumpRefresh(podId, key){ bump('refresh', podId, key); },
    setRefresh(podId, key, value){ set('refresh', podId, key, value); },
    snapshot(){ return JSON.parse(JSON.stringify(counters)); },
    reset(){
      counters.lifecycle = {};
      counters.refresh = {};
      touch();
    },
  };

  root.debug = api;
  global.__MISSION_CONTROL_DEBUG__ = api;
})(window);
