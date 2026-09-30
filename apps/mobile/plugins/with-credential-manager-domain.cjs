const { withAndroidManifest, withStringsXml } = require("expo/config-plugins");

const ASSET_STATEMENTS_NAME = "asset_statements";

function withCredentialManagerDomain(config, props = {}) {
  const rpId =
    props.rpId ||
    process.env.MERA_RP_ID ||
    "metropolis.cherrymoney.co.uk";
  const assetLinksUrl =
    "https://" + rpId + "/.well-known/assetlinks.json";
  const assetStatements = JSON.stringify([{ include: assetLinksUrl }]);

  config = withAndroidManifest(config, (androidConfig) => {
    const application =
      androidConfig.modResults.manifest.application?.[0];

    if (!application) {
      throw new Error("AndroidManifest.xml has no <application> element.");
    }

    application["meta-data"] = application["meta-data"] || [];

    const existing = application["meta-data"].find(
      (item) => item?.$?.["android:name"] === ASSET_STATEMENTS_NAME,
    );

    if (existing) {
      existing.$["android:resource"] = "@string/asset_statements";
    } else {
      application["meta-data"].push({
        $: {
          "android:name": ASSET_STATEMENTS_NAME,
          "android:resource": "@string/asset_statements",
        },
      });
    }

    return androidConfig;
  });

  config = withStringsXml(config, (stringsConfig) => {
    const resources = stringsConfig.modResults.resources;
    resources.string = resources.string || [];

    const existing = resources.string.find(
      (item) => item?.$?.name === ASSET_STATEMENTS_NAME,
    );

    if (existing) {
      existing.$.translatable = "false";
      existing._ = assetStatements;
    } else {
      resources.string.push({
        $: {
          name: ASSET_STATEMENTS_NAME,
          translatable: "false",
        },
        _: assetStatements,
      });
    }

    return stringsConfig;
  });

  return config;
}

module.exports = withCredentialManagerDomain;
