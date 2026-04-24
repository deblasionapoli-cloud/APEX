import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInWithPopup, GoogleAuthProvider, User } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, where, orderBy, limit, getDocs, serverTimestamp, Timestamp } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

const provider = new GoogleAuthProvider();

export const signIn = () => signInWithPopup(auth, provider);
export const signOut = () => auth.signOut();

export interface Memory {
  id?: string;
  content: string;
  timestamp: Timestamp;
  category: string;
  userId: string;
}

export async function saveMemory(content: string, category: string = 'interaction') {
  if (!auth.currentUser) return;
  try {
    await addDoc(collection(db, 'memories'), {
      content,
      category,
      userId: auth.currentUser.uid,
      timestamp: serverTimestamp()
    });
  } catch (e) {
    console.error("Error saving memory:", e);
  }
}

export async function getRecentMemories(count: number = 5): Promise<string[]> {
  if (!auth.currentUser) return [];
  try {
    const q = query(
      collection(db, 'memories'),
      where('userId', '==', auth.currentUser.uid),
      where('category', '==', 'interaction'),
      orderBy('timestamp', 'desc'),
      limit(count)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => (doc.data() as Memory).content);
  } catch (e) {
    console.error("Error getting memories:", e);
    return [];
  }
}

export async function getTraits(count: number = 10): Promise<string[]> {
  if (!auth.currentUser) return [];
  try {
    const q = query(
      collection(db, 'memories'),
      where('userId', '==', auth.currentUser.uid),
      where('category', '==', 'trait'),
      orderBy('timestamp', 'desc'),
      limit(count)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => (doc.data() as Memory).content);
  } catch (e) {
    console.error("Error getting traits:", e);
    return [];
  }
}

// Remote Input Bridge
import { onSnapshot, updateDoc, doc } from 'firebase/firestore';

export function onRemoteCommand(callback: (command: string, id: string) => void) {
  if (!auth.currentUser) return () => {};
  
  const q = query(
    collection(db, 'remote_inputs'),
    where('userId', '==', auth.currentUser.uid),
    where('processed', '==', false),
    orderBy('timestamp', 'asc'),
    limit(1)
  );

  return onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const data = change.doc.data();
        callback(data.command, change.doc.id);
      }
    });
  });
}

export async function markCommandProcessed(id: string) {
  try {
    await updateDoc(doc(db, 'remote_inputs', id), {
      processed: true
    });
  } catch (e) {
    console.error("Error marking command processed:", e);
  }
}

export async function sendRemoteCommand(command: string) {
  if (!auth.currentUser) return;
  try {
    await addDoc(collection(db, 'remote_inputs'), {
      command,
      userId: auth.currentUser.uid,
      timestamp: serverTimestamp(),
      processed: false
    });
  } catch (e) {
    console.error("Error sending remote command:", e);
  }
}
