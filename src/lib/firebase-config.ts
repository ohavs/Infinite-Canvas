/**
 * קונפיגורציית Firebase של האפליקציה (Web App Config).
 *
 * כדי להפעיל סנכרון ענן והתחברות:
 * 1. Firebase Console → Project settings → General → Your apps → Add app → Web
 * 2. העתיקו את האובייקט firebaseConfig שמוצג והדביקו אותו כאן במקום ה-null
 * 3. Build → Authentication → Get started → הפעילו את ספק Google
 * 4. Build → Firestore Database → Create database (production mode)
 *
 * הערה: קונפיגורציית Web של Firebase אינה סוד — היא מזהה ציבורי של הפרויקט.
 * ההגנה על הנתונים נעשית בחוקי האבטחה של Firestore.
 */

export interface FirebaseWebConfig {
	apiKey: string
	authDomain: string
	projectId: string
	storageBucket?: string
	messagingSenderId?: string
	appId: string
}

export const firebaseConfig: FirebaseWebConfig | null = null
