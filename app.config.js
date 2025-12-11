export default {
  expo: {
    name: "momentum",
    slug: "momentum",
    version: "1.0.0",
    orientation: "portrait",
    userInterfaceStyle: "light",
    assetBundlePatterns: ["**/*"],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.protectpesa.momentum"
    },
    android: {
      package: "com.protectpesa.momentum",
      versionCode: 1
    },
    extra: {
      eas: {
        projectId: "60d1ffc0-4534-478f-b63c-4893dcf25d11"
      }
    },
    plugins: ["expo-router", "expo-web-browser"]
  }
};