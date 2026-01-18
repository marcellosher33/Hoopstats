// Dynamic Expo config
module.exports = ({ config }) => {
  // Return clean config without EAS project ID
  return {
    ...config,
    // Explicitly don't set owner
    owner: undefined,
    // Clean extra to remove any EAS config
    extra: {
      // Keep other extra config but remove eas
      ...(config.extra || {}),
      eas: undefined,
    },
  };
};
