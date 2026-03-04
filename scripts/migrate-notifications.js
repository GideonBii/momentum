/**
 * One-time migration:
 * Fix stored in-app notifications for shared goals:
 * - goalId -> data.sharedGoalId
 * - ensure data.type + data.screen
 */

const admin = require("firebase-admin");

// Use your service account or application default creds
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const db = admin.firestore();

const looksLikeSharedGoalNotif = (n) => {
  const t = n?.type || n?.data?.type || "";
  const screen = n?.data?.screen || "";
  return (
    screen === "SharedGoals" ||
    t === "goal_invite" ||
    t === "comment" ||
    t === "milestone_completed" ||
    t === "goal_updated" ||
    t === "goal_joined"
  );
};

(async () => {
  const usersSnap = await db.collection("users").get();
  console.log("Users:", usersSnap.size);

  let updatedUsers = 0;
  let updatedNotifs = 0;

  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data() || {};
    const notifs = Array.isArray(data.notifications) ? data.notifications : [];

    if (!notifs.length) continue;

    let changed = false;

    const newNotifs = notifs.map((n) => {
      if (!n || typeof n !== "object") return n;

      const goalId = n.goalId || n?.data?.goalId || null;
      const already = n?.data?.sharedGoalId;

      if (!goalId) return n;

      // Only transform notifications that are probably shared-goal related
      if (!looksLikeSharedGoalNotif(n)) return n;

      const next = {
        ...n,
        data: {
          ...(n.data || {}),
          sharedGoalId: already || goalId,
          type: (n.data && n.data.type) || n.type || "general",
          screen: (n.data && n.data.screen) || "SharedGoals",
        },
      };

      if (!already) {
        changed = true;
        updatedNotifs += 1;
      }

      return next;
    });

    if (changed) {
      updatedUsers += 1;
      await userDoc.ref.update({ notifications: newNotifs });
      console.log("✅ Updated notifications for user:", userDoc.id);
    }
  }

  console.log("DONE");
  console.log("Updated users:", updatedUsers);
  console.log("Updated notifications:", updatedNotifs);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
