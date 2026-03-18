(function initMissionControlLayout(global){
  const root = global.MissionControlModules = global.MissionControlModules || {};

  const DEFAULT_UTILITY_ROWS = [
    ['shortcuts'],
    ['date-time', 'calendar'],
    ['nba-scores', 'crypto-tracker', 'rss-feed'],
    ['camera-feed', 'live-streams'],
    ['voice-note', 'voice-to-rowan', 'music-player'],
  ];

  function createDefaultLayoutState(){
    return {
      utilityRows: DEFAULT_UTILITY_ROWS.map((row) => [...row]),
      visibility: Object.fromEntries(DEFAULT_UTILITY_ROWS.flat().map((podId) => [podId, true])),
    };
  }

  root.layout = {
    phase: '1B',
    createDefaultLayoutState,
    defaults: createDefaultLayoutState(),
  };
})(window);
