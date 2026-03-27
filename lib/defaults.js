const SETTINGS_VERSION = "0.3";

const DEFAULT_SETTINGS = {
  version: SETTINGS_VERSION,
  builtinActions: {
    copy: { enabled: true },
    openLink: { enabled: true }
  },
  searchEngines: [
    {
      id: "google",
      name: "Google",
      url: "https://www.google.com/search?q=%s",
      enabled: true,
      includedDomains: []
    },
    {
      id: "naver-map",
      name: "Naver Map",
      url: "https://map.naver.com/p/search/%s",
      enabled: true,
      includedDomains: []
    }
  ],
  appearance: {
    displayMode: "favicon",
    iconSize: 16,
    theme: "auto"
  },
  openInBackground: false,
  excludedDomains: []
};
