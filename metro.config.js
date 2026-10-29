const { getDefaultConfig } = require("expo/metro-config");
// TODO(App Store): odstranit @rork-ai/toolkit-sdk + withRorkMetro, až nebude potřeba
// (sken účtenek / generateObject). Zatím necháme kvůli buildu add.tsx flagu RECEIPT_SCAN_ENABLED.
const { withRorkMetro } = require("@rork-ai/toolkit-sdk/metro");

const config = getDefaultConfig(__dirname);

module.exports = withRorkMetro(config);
