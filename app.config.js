module.exports = {
  expo: {
    name: "momentum",
    slug: "momentum",
    version: "1.0.0",
    orientation: "portrait",
    userInterfaceStyle: "light",
    icon: "./assets/icon.png",
    scheme: "momentum",
    
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.protectpesa.momentum",
      buildNumber: "1.0.0",
      infoPlist: {
        // iOS-specific permissions can be added here if needed
        UIBackgroundModes: ["remote-notification"]
      }
    },
    
    android: {
      package: "com.protectpesa.momentum",
      versionCode: 1,
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#A98467"
      },
      permissions: [
        "android.permission.POST_NOTIFICATIONS",
        "android.permission.VIBRATE",
        "android.permission.RECEIVE_BOOT_COMPLETED"
      ],
      useNextNotificationsApi: true,
      // Status bar - use different color than splash background
      statusBar: {
        backgroundColor: "#8F6B4F", // Slightly darker than splash
        barStyle: "light-content"
      }
    },
    
    extra: {
      eas: {
        projectId: "60d1ffc0-4534-478f-b63c-4893dcf25d11"
      }
    },
    
    plugins: [
      
      [
        "expo-notifications",
        {
          icon: "./assets/notification-icon.png",
          color: "#A98467",
          defaultChannel: "default"
        }
      ]
    ],
    
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff" // White background
    },
    
    assetBundlePatterns: [
      "**/*"
    ],
    
    web: {
      favicon: "./assets/favicon.png",
      bundler: "metro"
    },
    
    runtimeVersion: {
      policy: "sdkVersion"
    },
    
    updates: {
      url: "https://u.expo.dev/60d1ffc0-4534-478f-b63c-4893dcf25d11",
      fallbackToCacheTimeout: 0
    },
    
    // iOS status bar config
    iosStatusBar: {
      backgroundColor: "#A98467",
      barStyle: "light-content"
    }
  }
};