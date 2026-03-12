(function initMissionControlLayout(global){
  const root = global.MissionControlModules = global.MissionControlModules || {};

  root.layout = {
    phase: '1A',
    zones: {
      utilityTop: ['date-time', 'calendar', 'weather'],
    },
  };
})(window);
