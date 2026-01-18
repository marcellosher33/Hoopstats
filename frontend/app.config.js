// Dynamic Expo config - overrides app.json
const config = require('./app.json');

// Remove any projectId that might be set externally
if (config.expo.extra?.eas?.projectId) {
  delete config.expo.extra.eas.projectId;
}

// Don't use owner
delete config.expo.owner;

module.exports = {
  ...config.expo,
  // Explicitly remove EAS project configuration
  extra: {
    ...config.expo.extra,
    eas: undefined,
  },
};
