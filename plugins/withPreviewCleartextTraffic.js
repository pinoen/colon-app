const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Permite HTTP sin cifrar únicamente en los APK EAS de preview, que apuntan al
 * backend de QA por IP LAN. Los demás perfiles conservan el default de Android.
 */
function withPreviewCleartextTraffic(config) {
  return withAndroidManifest(config, (configWithManifest) => {
    if (process.env.EAS_BUILD_PROFILE !== 'preview') {
      return configWithManifest;
    }

    const application = configWithManifest.modResults.manifest.application?.[0];
    if (application === undefined) {
      throw new Error(
        'No se encontró el elemento application del manifiesto Android.',
      );
    }

    application.$ = {
      ...application.$,
      'android:usesCleartextTraffic': 'true',
    };
    return configWithManifest;
  });
}

module.exports = withPreviewCleartextTraffic;
