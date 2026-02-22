import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyAVcAKtTCEOLb18xoH3KPx4ODRtRJ16aYY",
  authDomain: "tho-khoi-nghiep.firebaseapp.com",
  projectId: "tho-khoi-nghiep",
  storageBucket: "tho-khoi-nghiep.firebasestorage.app",
  messagingSenderId: "415024078878",
  appId: "1:415024078878:web:225c18ab4452151a6a8e0f"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const appId = 'tho-khoi-nghiep-local';
