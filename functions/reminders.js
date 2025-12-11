// functions/reminders.js
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { CloudTasksClient } = require("@google-cloud/tasks");

admin.initializeApp();
const db = admin.firestore();
const tasksClient = new CloudTasksClient();

exports.scheduleSharedGoalReminder = functions.firestore
  .document("artifacts/{appId}/public/data/sharedGoals/{goalId}")
  .onWrite(async (change, context) => {
    const after = change.after.exists ? change.after.data() : null;
    const before = change.before.exists ? change.before.data() : null;

    if (!after) return null;

    const { appId, goalId } = context.params;

    // Only schedule when reminder is requested AND reminderTime changed
    if (!after.reminderRequested) return null;

    const reminderTime = after.reminderTime;
    if (!reminderTime || !reminderTime._seconds) return null;

    const sendAtMs = reminderTime._seconds * 1000;

    // Prevent duplicate tasks by checking if same timestamp already existed
    const beforeSeconds = before?.reminderTime?._seconds || null;
    if (beforeSeconds === reminderTime._seconds) return null;

    // Build Cloud Task
    const projectId = process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT;
    const location = "us-central1"; // must match your functions region
    const queue = "goal-reminders-queue"; // queue name

    const queuePath = tasksClient.queuePath(projectId, location, queue);

    const url = `https://${location}-${projectId}.cloudfunctions.net/sendSharedGoalReminder`;
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

    await tasksClient.createTask({ parent: queuePath, task });

    console.log("Reminder task scheduled:", payload);

    return null;
  });
exports.sendSharedGoalReminder = functions.https.onRequest(async (req, res) => {
  try {
    const { appId, goalId } = req.body;

    if (!appId || !goalId) {
      console.error("Missing parameters:", req.body);
      return res.status(400).send("Missing appId or goalId");
    }

    const goalRef = db.doc(`artifacts/${appId}/public/data/sharedGoals/${goalId}`);
    const snap = await goalRef.get();
    
    if (!snap.exists) {
      console.error("Goal not found", goalId);
      return res.status(404).send("Goal not found");
    }

    const goal = snap.data();
    const participantUids = goal.participants || [];

    // Resolve user tokens
    const tokens = [];
    for (const uid of participantUids) {
      const uSnap = await db.collection("users").doc(uid).get();
      if (uSnap.exists) {
        const d = uSnap.data();
        if (d.fcmToken) tokens.push(d.fcmToken);
        if (d.fcmTokens) tokens.push(...d.fcmTokens);
      }
    }

    if (!tokens.length) {
      console.log("No tokens; skipping notification");
      return res.status(200).send("No tokens");
    }

    const title = `Reminder: ${goal.title}`;
    const due = goal.dueDate?._seconds
      ? new Date(goal.dueDate._seconds * 1000).toLocaleDateString()
      : "";

    const body = due
      ? `Your shared goal is due on ${due}`
      : `It's time to work on your shared goal!`;

    await admin.messaging().sendToDevice(tokens, {
      notification: { title, body },
      data: { goalId, type: "reminder" },
    });

    console.log("Reminder sent for goal:", goalId);

    // Mark flagged as sent
    await goalRef.update({
      reminderRequested: false,
      reminderSent: true,
    });

    return res.status(200).send("OK");
  } catch (error) {
    console.error("Reminder error:", error);
    return res.status(500).send(error);
  }
});
