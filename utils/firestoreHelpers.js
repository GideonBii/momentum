import { Alert } from "react-native";

export const safeWrite = async (operation, actionDesc = "operation") => {
  let attempt = 0;
  const maxAttempts = 3;

  while (attempt < maxAttempts) {
    try {
      return await operation();
    } catch (err) {
      console.warn(`Firestore ${actionDesc} failed (attempt ${attempt + 1}):`, err);

      if (attempt < maxAttempts - 1) {
        // Exponential backoff
        await new Promise(res => setTimeout(res, 200 * (attempt + 1)));
        attempt++;
      } else {
        Alert.alert(
          "Sync Issue",
          `Your ${actionDesc} could not be saved online. It will sync once you're back online.`
        );
        throw err;
      }
    }
  }
};
