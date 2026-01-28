export default {
  expo: {
    name: "momentum",
    slug: "momentum",
    version: "1.0.0",
    orientation: "portrait",
    userInterfaceStyle: "light",
    
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.protectpesa.momentum"
    },
    
    android: {
      package: "com.protectpesa.momentum",
      versionCode: 1,
      useNextNotificationsApi: true // Add this for Android 13+
    },
     extra: {
      eas: {
        projectId: "60d1ffc0-4534-478f-b63c-4893dcf25d11"  // Add this line
      }
    },
    plugins: [
      "expo-router",
      "expo-web-browser",
      [
        "expo-notifications",
        {
          // Start with minimal config
          color: "#A98467"
        }
      ]
    ]
  }
};