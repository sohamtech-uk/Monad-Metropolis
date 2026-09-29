import Constants from "expo-constants";

const rpId = Constants.expoConfig?.extra?.meraRpId;

if (typeof rpId !== "string" || !rpId.trim()) {
  throw new Error("Mera relying-party ID is not configured.");
}

export { rpId };
