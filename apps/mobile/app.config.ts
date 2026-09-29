import type { ExpoConfig } from "expo/config";

const rpId = process.env.MERA_RP_ID ?? "metropolis.cherrymoney.co.uk";
const applicationId = "uk.co.cherrymoney.metropolis";

const config: ExpoConfig = {
  name: "Cherry Pay Global",
  slug: "cherry-pay-global",
  scheme: "cherrypayglobal",
  version: "0.2.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: applicationId,
    buildNumber: "1",
    supportsTablet: true,
    associatedDomains: [`webcredentials:${rpId}`],
  },
  android: {
    package: applicationId,
    versionCode: 1,
  },
  extra: {
    meraRpId: rpId,
  },
};

export default config;
