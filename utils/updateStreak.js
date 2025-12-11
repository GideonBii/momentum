// utils/updateStreak.js
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";

export async function updateStreak(userId) {
  if (!userId) return;

  try {
    const streakRef = doc(db, "streaks", userId);
    const streakSnap = await getDoc(streakRef);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let currentStreak = 1;
    let longestStreak = 1;
    let lastCompletedDate = today;

    if (streakSnap.exists()) {
      const data = streakSnap.data();
      const lastDate = data.lastCompletedDate?.toDate
        ? data.lastCompletedDate.toDate()
        : null;

      if (lastDate) {
        lastDate.setHours(0, 0, 0, 0);

        const diff = (today - lastDate) / (1000 * 60 * 60 * 24);

        if (diff === 1) {
          // Continue streak
          currentStreak = data.currentStreak + 1;
        } else if (diff === 0) {
          // Already completed today
          currentStreak = data.currentStreak;
        } else {
          // Missed a day
          currentStreak = 1;
        }

        longestStreak = Math.max(data.longestStreak || 1, currentStreak);
      }
    }

    await setDoc(streakRef, {
      currentStreak,
      longestStreak,
      lastCompletedDate: today,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("Error updating streak:", err);
  }
}
