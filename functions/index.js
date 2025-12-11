/**
 * Full Firebase Functions index.js
 * - Schedules reminder tasks for shared goals (Cloud Tasks)
 * - Sends reminder push notifications
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { CloudTasksClient } = require("@google-cloud/tasks");

admin.initializeApp();
const db = admin.firestore();

const tasksClient = new CloudTasksClient();

/* -------------------------------------------------------------------------- */
/*                         Helper: Send FCM to multiple uids                  */
/* -------------------------------------------------------------------------- */
async function sendFcmToUids(uids, title, body, data = {}) {
  const tokens = [];

  for (const uid of uids) {
    const snap = await db.collection("users").doc(uid).get();
    if (!snap.exists) continue;

    const user = snap.data();

    if (user.fcmToken) tokens.push(user.fcmToken);
    if (Array.isArray(user.fcmTokens)) tokens.push(...user.fcmTokens);
  }

  if (!tokens.length) {
    console.log("No tokens found, skipping push");
    return;
  }

  const payload = {
    notification: { title, body },
    data,
  };

  await admin.messaging().sendToDevice(tokens, payload);
}

/* -------------------------------------------------------------------------- */
/*     Function 1: Firestore trigger — schedules a Cloud Task at reminderTime */
/* -------------------------------------------------------------------------- */

exports.scheduleSharedGoalReminder = functions.firestore
  .document("artifacts/{appId}/public/data/sharedGoals/{goalId}")
  .onWrite(async (change, context) => {
    const after = change.after.exists ? change.after.data() : null;
    const before = change.before.exists ? change.before.data() : null;

    if (!after) return null;

    const { appId, goalId } = context.params;

    // Only schedule a reminder when requested
    if (!after.reminderRequested) return null;

    // Sanity check reminderTime
    const reminderTime = after.reminderTime;
    if (!reminderTime?._seconds) {
      console.log("Invalid reminderTime");
      return null;
    }

    const newTimestamp = reminderTime._seconds;
    const oldTimestamp = before?.reminderTime?._seconds;

    // Avoid scheduling twice for same time
    if (oldTimestamp && oldTimestamp === newTimestamp) {
      console.log("Reminder already scheduled for this time");
      return null;
    }

    const sendAtMs = newTimestamp * 1000;

    /* -------------------------- Build the Cloud Task -------------------------- */
    const project = process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT;
    const location = "us-central1";
    const queue = "goal-reminders-queue";

    const queuePath = tasksClient.queuePath(project, location, queue);

    // Endpoint of the function that will send the reminder
    const url = `https://${location}-${project}.cloudfunctions.net/sendSharedGoalReminder`;

    const payload = {
      appId,
      goalId,
    };

    const task = {
      httpRequest: {
        httpMethod: "POST",
        url,
        headers: { "Content-Type": "application/json" },
        body: Buffer.from(JSON.stringify(payload)).toString("base64"),
      },
      scheduleTime: {
        seconds: Math.floor(sendAtMs / 1000),
      },
    };

    console.log("Creating Cloud Task:", payload);

    await tasksClient.createTask({
      parent: queuePath,
      task,
    });

    console.log("Task scheduled successfully");

    return null;
  });

/* -------------------------------------------------------------------------- */
/*    Function 2: HTTPS — Cloud Task hits this at the exact reminder time     */
/* -------------------------------------------------------------------------- */

exports.sendSharedGoalReminder = functions.https.onRequest(async (req, res) => {
  try {
    const { appId, goalId } = req.body;

    if (!appId || !goalId) {
      console.error("Invalid request body:", req.body);
      return res.status(400).send("Invalid request");
    }

    const goalRef = db.doc(`artifacts/${appId}/public/data/sharedGoals/${goalId}`);
    const snap = await goalRef.get();

    if (!snap.exists) {
      console.log("Goal not found:", goalId);
      return res.status(404).send("Goal not found");
    }

    const goal = snap.data();

    const participantUids = goal.participants || [];

    const title = `Reminder: ${goal.title}`;
    const dueDateString = goal.dueDate?._seconds
      ? new Date(goal.dueDate._seconds * 1000).toLocaleDateString()
      : "";

    const body = dueDateString
      ? `Your shared goal is due on ${dueDateString}`
      : `It's time to work on your shared goal!`;

    console.log("Sending reminder for goal:", goalId);

    await sendFcmToUids(participantUids, title, body, {
      type: "reminder",
      goalId,
    });

    // Mark reminder as sent
    await goalRef.update({
      reminderRequested: false,
      reminderSent: true,
      reminderSentAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(200).send("OK");
  } catch (error) {
    console.error("Error sending reminder:", error);
    res.status(500).send(error);
  }
});
