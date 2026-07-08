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
	measurementId?: string
}

export const firebaseConfig: FirebaseWebConfig | null = {
	apiKey: 'AIzaSyAKoTwRY6oq6sYG6H4IfZ5oxiZw53Yi93A',
	authDomain: 'infinite-canvas-dd389.firebaseapp.com',
	projectId: 'infinite-canvas-dd389',
	storageBucket: 'infinite-canvas-dd389.firebasestorage.app',
	messagingSenderId: '566279178343',
	appId: '1:566279178343:web:0d9953d31d6a521d9aecc2',
	measurementId: 'G-1PGWK1S1C7',
}
