import type { ExpoConfig } from "expo/config";

const rpId = process.env.MERA_RP_ID ?? "metropolis.cherrymoney.co.uk";
const applicationId = "uk.co.cherrymoney.metropolis";

const config: ExpoConfig = {
  name: "Cherry Pay Global",
  slug: "cherry-pay-global",
  owner: "cherrymoney",
  scheme: "cherrypayglobal",
  version: "0.2.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  icon: "./assets/icon.png",
  web: {
    output: "single",
    name: "Cherry Pay Global — Monad Metropolis",
    shortName: "Cherry Pay",
    favicon: "./assets/icon.png",
  },
  plugins: [
    [
      "./plugins/with-credential-manager-domain.cjs",
      { rpId },
    ],
  ],
  ios: {
    bundleIdentifier: applicationId,
    buildNumber: "1",
    supportsTablet: true,
    associatedDomains: [`webcredentials:${rpId}`],
  },
  android: {
    package: applicationId,
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon-foreground.png",
      backgroundColor: "#FFFFFF",
    },
  },
  extra: {
    meraRpId: rpId,
    eas: {
      projectId: "69ed85d3-7c72-472d-be26-4bed379bafaf",
    },
  },
};

export default config;
