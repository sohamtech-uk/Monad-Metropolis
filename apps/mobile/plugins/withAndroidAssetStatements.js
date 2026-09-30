const {
  AndroidConfig,
  withAndroidManifest,
  withStringsXml,
} = require("expo/config-plugins");

// Android Credential Manager requires apps to declare which Digital Asset
// Links files to trust via an `asset_statements` manifest meta-data entry,
// in addition to hosting assetlinks.json on the relying-party domain.
// https://developer.android.com/identity/credential-manager/prerequisites
const withAndroidAssetStatements = (config, { rpId }) => {
  const assetStatements = JSON.stringify([
    { include: `https://${rpId}/.well-known/assetlinks.json` },
  ]).replace(/"/g, '\\"');

  config = withStringsXml(config, (config) => {
    config.modResults = AndroidConfig.Strings.setStringItem(
      [
        {
          $: { name: "asset_statements", translatable: "false" },
          _: assetStatements,
        },
      ],
      config.modResults,
    );
    return config;
  });

  config = withAndroidManifest(config, (config) => {
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(
      config.modResults,
    );
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      mainApplication,
      "asset_statements",
      "@string/asset_statements",
      "resource",
    );
    return config;
  });

  return config;
};

module.exports = withAndroidAssetStatements;
