/**
 * node migrateSharedGoals.js
 * Requires: npm i firebase-admin
 * Set GOOGLE_APPLICATION_CREDENTIALS to your service account json
 */

const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const db = admin.firestore();

async function run() {
  const path = "artifacts/momentum-app/public/data/sharedGoals";
  const snap = await db.collection(path).get();

  console.log("Found docs:", snap.size);

  let updated = 0;

  for (const docSnap of snap.docs) {
    const d = docSnap.data();

    const participantIds =
      d.participantIds ||
      d.participants ||
      d.collaborators ||
      [];

    const creatorId =
      d.creatorId ||
      d.ownerId ||
      d.createdBy ||
      null;

    const patch = {};

    if (!d.participantIds && Array.isArray(participantIds) && participantIds.length) {
      patch.participantIds = participantIds;
    }

    if (!d.creatorId && creatorId) {
      patch.creatorId = creatorId;
    }

    // Ensure creator is included in participantIds (your rules expect this)
    if (patch.participantIds && patch.creatorId && !patch.participantIds.includes(patch.creatorId)) {
      patch.participantIds = [...new Set([...patch.participantIds, patch.creatorId])];
    }

    if (Object.keys(patch).length) {
      await docSnap.ref.update(patch);
      updated++;
      console.log("Updated:", docSnap.id, patch);
    }
  }

  console.log("Migration complete. Updated:", updated);
}

run().catch(console.error);
