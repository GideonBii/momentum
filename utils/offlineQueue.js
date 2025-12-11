// src/utils/offlineQueue.js
import { localDB } from '../../App'; // adjust path

let queue = [];
let processing = false;

export const enqueueOperation = async (operation) => {
  queue.push({ ...operation, timestamp: Date.now() });
  await saveQueue();
  processQueue();
};

const saveQueue = async () => {
  try {
    await localDB.put({ _id: '_local/queue', queue });
  } catch (err) {
    if (err.status !== 409) throw err; // ignore conflict
  }
};

const loadQueue = async () => {
  try {
    const doc = await localDB.get('_local/queue');
    queue = doc.queue || [];
  } catch (err) {
    queue = [];
  }
};

export const processQueue = async () => {
  if (processing) return;
  processing = true;
  await loadQueue();

  while (queue.length > 0) {
    const op = queue[0];
    try {
      await executeOperation(op);
      queue.shift();
      await saveQueue();
    } catch (err) {
      console.warn('Offline op failed, will retry:', op.type);
      break; // stop on error, retry later
    }
  }
  processing = false;
};

// Map operation types to actual Firestore-like functions
const executeOperation = async (op) => {
  switch (op.type) {
    case 'UPDATE_COLLABORATORS':
      return await updateDoc(doc(db, op.path, op.docId), op.update);
    case 'DELETE_DOC':
      return await deleteDoc(doc(db, op.path, op.docId));
    default:
      throw new Error('Unknown op');
  }
};