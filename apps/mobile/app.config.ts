import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Cherry Pay Global",
  slug: "cherry-pay-global",
  scheme: "cherrypayglobal",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: "uk.co.cherrymoney.metropolis",
    supportsTablet: true,
  },
  android: {
    package: "uk.co.cherrymoney.metropolis",
  },
};

export default config;
