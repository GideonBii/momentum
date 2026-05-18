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
      bundleIdentifier: "com.protectpesa.momentum",
      supportsTablet: true,
      buildNumber: "1.0.0",
      infoPlist: {
        UIBackgroundModes: ["remote-notification"],
        NSUserTrackingUsageDescription: "This helps us show you more relevant ads.",
        ITSAppUsesNonExemptEncryption: false
      },
      deploymentTarget: "15.1"
    },
    
    android: {
      package: "com.protectpesa.momentum",
      versionCode: 4
      ,
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
      statusBar: {
        backgroundColor: "#8F6B4F",
        barStyle: "light-content"
      }
    },
    
    plugins: [
      "expo-notifications",
      "expo-tracking-transparency",
      "expo-web-browser",
      [
        "react-native-google-mobile-ads",
        {
          androidAppId: "ca-app-pub-7149792922852881~4432324355",
          iosAppId: "ca-app-pub-7149792922852881~3618285184" // Replace with actual iOS ID when needed
        }
      ],
      [
        "expo-build-properties",
        {
          android: {
            compileSdkVersion: 35,  // ✅ CHANGE FROM 34 TO 35
            targetSdkVersion: 35,   // ✅ OPTIONAL BUT RECOMMENDED - change from 34 to 35
            minSdkVersion: 24
          },
          ios: {
            deploymentTarget: "15.1"
          }
        }
      ]
    ],
    
    extra: {
      eas: {
        projectId: "60d1ffc0-4534-478f-b63c-4893dcf25d11"
      }
    },
    
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    
    assetBundlePatterns: ["**/*"],
    
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
    
    iosStatusBar: {
      backgroundColor: "#A98467",
      barStyle: "light-content"
    }
  },
  "react-native-google-mobile-ads": {
    android_app_id: "ca-app-pub-7149792922852881~4432324355"
  }
};