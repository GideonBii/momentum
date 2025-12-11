export default {
  expo: {
    name: "momentum",
    slug: "momentum",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    splash: {
      // 注释掉自定义启动图，使用默认配置
      // image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    assetBundlePatterns: ["**/*"],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.protectpesa.momentum"
    },
    android: {
      package: "com.protectpesa.momentum",
      versionCode: 1,
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff"
      },
      permissions: []
    },
    extra: {
      eas: {
        projectId: "60d1ffc0-4534-478f-b63c-4893dcf25d11"
      }
    },
    plugins: ["expo-router", "expo-web-browser"]
  }
};