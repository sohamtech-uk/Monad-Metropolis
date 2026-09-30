const {
  AndroidConfig,
  withAndroidManifest,
  withStringsXml,
} = require("expo/config-plugins");

const ASSET_STATEMENTS_NAME = "asset_statements";

function withCredentialManagerDomain(config, props = {}) {
  const rpId =
    props.rpId ||
    process.env.MERA_RP_ID ||
    "metropolis.cherrymoney.co.uk";

  const assetStatements = JSON.stringify([
    { include: `https://${rpId}/.well-known/assetlinks.json` },
  ]).replace(/"/g, '\\\"');

  config = withStringsXml(config, (stringsConfig) => {
    stringsConfig.modResults = AndroidConfig.Strings.setStringItem(
      [
        {
          $: {
            name: ASSET_STATEMENTS_NAME,
            translatable: "false",
          },
          _: assetStatements,
        },
      ],
      stringsConfig.modResults,
    );

    return stringsConfig;
  });

  config = withAndroidManifest(config, (androidConfig) => {
    const application =
      AndroidConfig.Manifest.getMainApplicationOrThrow(
        androidConfig.modResults,
      );

    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      application,
      ASSET_STATEMENTS_NAME,
      "@string/asset_statements",
      "resource",
    );

    return androidConfig;
  });

  return config;
}

module.exports = withCredentialManagerDomain;
