// functions/index.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { Expo } = require('expo-server-sdk');

// Initialize Firebase Admin SDK
admin.initializeApp();

// Create a new Expo SDK client
const expo = new Expo();

// Initialize Firestore
const db = admin.firestore();

/**
 * Scheduled function that runs every minute to check for due items
 * and send push notifications
 */
exports.checkDueDates = functions.pubsub
  .schedule('* * * * *') // Runs every minute
  .timeZone('UTC')
  .onRun(async (context) => {
    console.log('🔍 Checking for due items...');
    
    const now = admin.firestore.Timestamp.now();
    const oneHourFromNow = new Date(now.toDate().getTime() + 60 * 60 * 1000);
    
    try {
      // ✅ Check for due tasks from planner collection
      const tasksSnapshot = await db
        .collection('planner')
        .where('dueDate', '<=', oneHourFromNow)
        .where('dueDate', '>=', now.toDate())
        .where('enableNotifications', '==', true)
        .where('notificationSent', '!=', true)
        .get();
      
      console.log(`📋 Found ${tasksSnapshot.size} tasks due soon`);
      
      // Process tasks
      const taskPromises = [];
      tasksSnapshot.forEach(doc => {
        const task = doc.data();
        taskPromises.push(processDueItem({
          type: 'task',
          item: task,
          docId: doc.id,
          userId: task.userId,
          title: task.title,
          description: task.description || 'Your task is due soon!',
          dueDate: task.dueDate
        }));
      });
      
      // ✅ Check for due goals
      const goalsSnapshot = await db
        .collection('goals')
        .where('dueDate', '<=', oneHourFromNow)
        .where('dueDate', '>=', now.toDate())
        .where('enableNotifications', '==', true)
        .where('notificationSent', '!=', true)
        .get();
      
      console.log(`🎯 Found ${goalsSnapshot.size} goals due soon`);
      
      // Process goals
      const goalPromises = [];
      goalsSnapshot.forEach(doc => {
        const goal = doc.data();
        goalPromises.push(processDueItem({
          type: 'goal',
          item: goal,
          docId: doc.id,
          userId: goal.userId,
          title: goal.title,
          description: goal.customNotificationMessage || `Goal "${goal.title}" deadline is approaching!`,
          dueDate: goal.dueDate
        }));
      });
      
      // ✅ Check for shared goals (if applicable)
      const sharedGoalsSnapshot = await db
        .collectionGroup('sharedGoals')
        .where('dueDate', '<=', oneHourFromNow)
        .where('dueDate', '>=', now.toDate())
        .where('enableNotifications', '==', true)
        .where('notificationSent', '!=', true)
        .get();
      
      console.log(`👥 Found ${sharedGoalsSnapshot.size} shared goals due soon`);
      
      // Process shared goals
      const sharedGoalPromises = [];
      sharedGoalsSnapshot.forEach(doc => {
        const goal = doc.data();
        // For shared goals, notify all participants
        if (goal.participants && Array.isArray(goal.participants)) {
          goal.participants.forEach(participantId => {
            sharedGoalPromises.push(processDueItem({
              type: 'shared-goal',
              item: goal,
              docId: doc.id,
              userId: participantId,
              title: goal.title,
              description: `Shared goal "${goal.title}" deadline is approaching!`,
              dueDate: goal.dueDate
            }));
          });
        }
      });
      
      // Wait for all notifications to be processed
      const allResults = await Promise.allSettled([
        ...taskPromises,
        ...goalPromises,
        ...sharedGoalPromises
      ]);
      
      // Count successes and failures
      const succeeded = allResults.filter(r => r.status === 'fulfilled' && r.value).length;
      const failed = allResults.filter(r => r.status === 'rejected' || !r.value).length;
      
      console.log(`✅ Notifications sent: ${succeeded} successful, ${failed} failed`);
      
      return null;
      
    } catch (error) {
      console.error('❌ Error in checkDueDates function:', error);
      return null;
    }
  });

/**
 * Process a single due item and send push notification
 */
async function processDueItem({ type, item, docId, userId, title, description, dueDate }) {
  try {
    console.log(`📤 Processing ${type}: ${title} for user: ${userId}`);
    
    // Get user's Expo push token
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      console.log(`❌ User ${userId} not found`);
      return false;
    }
    
    const userData = userDoc.data();
    const pushToken = userData.expoPushToken;
    
    if (!pushToken) {
      console.log(`❌ No push token for user ${userId}`);
      return false;
    }
    
    // Validate push token
    if (!Expo.isExpoPushToken(pushToken)) {
      console.log(`❌ Invalid Expo push token for user ${userId}: ${pushToken}`);
      return false;
    }
    
    // Calculate days remaining
    const dueDateTime = dueDate.toDate ? dueDate.toDate() : new Date(dueDate);
    const now = new Date();
    const daysRemaining = Math.ceil((dueDateTime - now) / (1000 * 60 * 60 * 24));
    
    // Create notification message
    const messages = [];
    
    // Create the push notification
    messages.push({
      to: pushToken,
      sound: 'default',
      title: getNotificationTitle(type, title),
      body: getNotificationBody(type, description, daysRemaining),
      data: {
        type: type,
        itemId: docId,
        userId: userId,
        title: title,
        dueDate: dueDateTime.toISOString(),
        daysRemaining: daysRemaining,
        timestamp: new Date().toISOString(),
        screen: getScreen(type)
      },
      priority: 'high',
      channelId: getChannelId(type),
      badge: 1,
    });
    
    // Send the notification(s)
    const chunks = expo.chunkPushNotifications(messages);
    const tickets = [];
    
    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
        console.log(`✅ Sent chunk of ${chunk.length} notifications`);
      } catch (error) {
        console.error('❌ Error sending chunk:', error);
      }
    }
    
    // Mark as notified in Firestore
    const collection = getCollectionName(type);
    if (collection) {
      const docRef = db.collection(collection).doc(docId);
      await docRef.update({
        notificationSent: true,
        notificationSentAt: admin.firestore.FieldValue.serverTimestamp(),
        lastNotificationTicket: tickets[0]?.id || null
      });
      console.log(`✅ Marked ${type} ${docId} as notified`);
    }
    
    // Check receipts for invalid tokens
    await checkNotificationReceipts(tickets);
    
    return true;
    
  } catch (error) {
    console.error(`❌ Error processing ${type} for user ${userId}:`, error);
    return false;
  }
}

/**
 * Check receipts for invalid tokens and clean them up
 */
async function checkNotificationReceipts(tickets) {
  if (!tickets || tickets.length === 0) return;
  
  // Wait a bit for receipts to be available
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  const receiptIds = tickets
    .filter(ticket => ticket.id)
    .map(ticket => ticket.id);
  
  if (receiptIds.length === 0) return;
  
  try {
    const receipts = await expo.getPushNotificationReceiptsAsync(receiptIds);
    
    for (const receiptId in receipts) {
      const receipt = receipts[receiptId];
      if (receipt.status === 'error') {
        console.error(`❌ Receipt error for ${receiptId}:`, receipt.message);
        
        // Find which ticket had this error
        const ticket = tickets.find(t => t.id === receiptId);
        if (ticket && ticket.to) {
          // Clean up invalid token
          await cleanupInvalidToken(ticket.to);
        }
      }
    }
  } catch (error) {
    console.error('❌ Error checking receipts:', error);
  }
}

/**
 * Clean up invalid push tokens from Firestore
 */
async function cleanupInvalidToken(pushToken) {
  try {
    // Find user with this token
    const usersSnapshot = await db
      .collection('users')
      .where('expoPushToken', '==', pushToken)
      .get();
    
    if (!usersSnapshot.empty) {
      const userDoc = usersSnapshot.docs[0];
      await userDoc.ref.update({
        expoPushToken: null,
        tokenInvalidAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`🧹 Cleaned up invalid token for user ${userDoc.id}`);
    }
  } catch (error) {
    console.error('❌ Error cleaning up invalid token:', error);
  }
}

/**
 * Helper: Get notification title based on type
 */
function getNotificationTitle(type, title) {
  switch (type) {
    case 'task':
      return `📋 Task Due: ${title}`;
    case 'goal':
      return `🎯 Goal Deadline: ${title}`;
    case 'shared-goal':
      return `👥 Shared Goal: ${title}`;
    default:
      return `Reminder: ${title}`;
  }
}

/**
 * Helper: Get notification body based on type
 */
function getNotificationBody(type, description, daysRemaining) {
  const baseBody = description || 'Your item is due soon!';
  
  if (daysRemaining === 0) {
    return `⚠️ DUE TODAY: ${baseBody}`;
  } else if (daysRemaining === 1) {
    return `⏰ Due tomorrow: ${baseBody}`;
  } else {
    return `${baseBody} (${daysRemaining} days remaining)`;
  }
}

/**
 * Helper: Get Firestore collection name by type
 */
function getCollectionName(type) {
  switch (type) {
    case 'task':
      return 'planner';
    case 'goal':
      return 'goals';
    case 'shared-goal':
      return null; // Shared goals are in collection groups
    default:
      return null;
  }
}

/**
 * Helper: Get screen to navigate to when tapped
 */
function getScreen(type) {
  switch (type) {
    case 'task':
      return 'Planner';
    case 'goal':
      return 'Goals';
    case 'shared-goal':
      return 'SharedGoals';
    default:
      return 'Home';
  }
}

/**
 * Optional: HTTP endpoint for testing notifications manually
 */
exports.sendTestNotification = functions.https.onCall(async (data, context) => {
  // Ensure user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'You must be logged in to send test notifications'
    );
  }
  
  const userId = context.auth.uid;
  const { title, body, type = 'test' } = data;
  
  try {
    // Get user's push token
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User not found');
    }
    
    const pushToken = userDoc.data().expoPushToken;
    if (!pushToken) {
      throw new functions.https.HttpsError('failed-precondition', 'No push token found');
    }
    
    // Send test notification
    const messages = [{
      to: pushToken,
      sound: 'default',
      title: title || '🧪 Test Notification',
      body: body || 'This is a test notification from your cloud function!',
      data: {
        type: type,
        test: true,
        timestamp: new Date().toISOString()
      },
      priority: 'high',
    }];
    
    const chunks = expo.chunkPushNotifications(messages);
    const tickets = [];
    
    for (const chunk of chunks) {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);
    }
    
    return {
      success: true,
      message: 'Test notification sent',
      tickets: tickets
    };
    
  } catch (error) {
    console.error('❌ Error sending test notification:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});