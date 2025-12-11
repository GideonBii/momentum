// src/utils/notifications.js
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebaseConfig";

export const sendNotification = async (recipientUids, message, meta = {}) => {
  if (!recipientUids?.length) return;

  const batch = recipientUids.map(uid =>
    addDoc(collection(db, "notifications"), {
      toUid: uid,
      message,
      read: false,
      createdAt: serverTimestamp(),
      ...meta,
    })
  );

  try {
    await Promise.all(batch);
  } catch (e) {
    console.error("sendNotification error:", e);
  }
};