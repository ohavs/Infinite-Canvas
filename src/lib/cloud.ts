import { firebaseConfig } from './firebase-config'
import {
	listProjects,
	loadDocContent,
	projectMode,
	saveDocContent,
	updateProject,
	type ProjectMeta,
} from './projects'

/**
 * סנכרון ענן + התחברות (Firebase Auth + Firestore).
 * כל המודול רדום עד שקיימת קונפיגורציית Firebase (ראו firebase-config.ts) —
 * ה-SDK נטען בטעינה עצלה רק כשמפעילים, כדי לא להכביד על האפליקציה.
 *
 * אסטרטגיית הסנכרון: Last-Write-Wins לפי updatedAt, ברמת פרויקט שלם.
 * מבנה: users/{uid}/projects/{projectId}
 */

export interface CloudUser {
	uid: string
	name: string | null
	photo: string | null
}

export const cloudEnabled = firebaseConfig != null

const MAX_CONTENT_BYTES = 850_000 // מתחת למגבלת 1MB של מסמך Firestore

type FirebaseModules = {
	auth: import('firebase/auth').Auth
	db: import('firebase/firestore').Firestore
}

let modulesPromise: Promise<FirebaseModules> | null = null
let currentUser: CloudUser | null = null
const authListeners = new Set<(user: CloudUser | null) => void>()
const pendingCanvasSnapshots = new Map<string, string>()

async function ensureFirebase(): Promise<FirebaseModules> {
	if (!firebaseConfig) throw new Error('cloud disabled')
	if (!modulesPromise) {
		modulesPromise = (async () => {
			const [{ initializeApp }, authMod, fsMod] = await Promise.all([
				import('firebase/app'),
				import('firebase/auth'),
				import('firebase/firestore'),
			])
			const app = initializeApp(firebaseConfig)
			const auth = authMod.getAuth(app)
			const db = fsMod.getFirestore(app)
			authMod.onAuthStateChanged(auth, (user) => {
				currentUser = user
					? { uid: user.uid, name: user.displayName, photo: user.photoURL }
					: null
				authListeners.forEach((cb) => cb(currentUser))
				if (currentUser) void syncNow()
			})
			return { auth, db }
		})()
	}
	return modulesPromise
}

export function getCloudUser(): CloudUser | null {
	return currentUser
}

/** מאזין לשינויי התחברות; מחזיר פונקציית ניקוי */
export function watchAuth(cb: (user: CloudUser | null) => void): () => void {
	authListeners.add(cb)
	cb(currentUser)
	if (cloudEnabled) void ensureFirebase()
	return () => authListeners.delete(cb)
}

export async function signInWithGoogle(): Promise<void> {
	const { auth } = await ensureFirebase()
	const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth')
	await signInWithPopup(auth, new GoogleAuthProvider())
}

export async function signOutCloud(): Promise<void> {
	const { auth } = await ensureFirebase()
	const { signOut } = await import('firebase/auth')
	await signOut(auth)
}

/* ------------------------------- סנכרון ------------------------------- */

/** העורך דוחף לכאן snapshot של הקנבס; יסונכרן בסבב הבא */
export function queueCanvasSnapshot(projectId: string, snapshotJson: string) {
	if (!cloudEnabled || !currentUser) return
	if (snapshotJson.length > MAX_CONTENT_BYTES) return
	pendingCanvasSnapshots.set(projectId, snapshotJson)
	scheduleSync()
}

/** snapshot שהגיע מהענן וממתין לטעינה בפתיחת הקנבס הבאה */
export function takeRemoteCanvasSnapshot(projectId: string): string | null {
	const key = `infinite-canvas:remote-canvas:${projectId}`
	const value = localStorage.getItem(key)
	if (value != null) localStorage.removeItem(key)
	return value
}

/** מחיקה בענן (tombstone) כשמוחקים פרויקט מקומית */
export async function deleteProjectRemote(projectId: string) {
	if (!cloudEnabled || !currentUser) return
	try {
		const { db } = await ensureFirebase()
		const { doc, setDoc } = await import('firebase/firestore')
		await setDoc(doc(db, 'users', currentUser.uid, 'projects', projectId), {
			deleted: true,
			updatedAt: Date.now(),
		})
	} catch (e) {
		console.warn('cloud delete failed', e)
	}
}

let syncTimer: ReturnType<typeof setTimeout> | undefined
let syncing = false
let lastSyncAt: number | null = null
const syncListeners = new Set<(state: { syncing: boolean; lastSyncAt: number | null }) => void>()

export function watchSync(cb: (state: { syncing: boolean; lastSyncAt: number | null }) => void) {
	syncListeners.add(cb)
	cb({ syncing, lastSyncAt })
	return () => syncListeners.delete(cb)
}

function notifySync() {
	syncListeners.forEach((cb) => cb({ syncing, lastSyncAt }))
}

export function scheduleSync(delay = 4000) {
	if (!cloudEnabled || !currentUser) return
	clearTimeout(syncTimer)
	syncTimer = setTimeout(() => void syncNow(), delay)
}

interface RemoteProject {
	meta?: Partial<ProjectMeta>
	docContent?: string
	canvasSnapshot?: string
	updatedAt: number
	deleted?: boolean
}

export async function syncNow(): Promise<void> {
	if (!cloudEnabled || !currentUser || syncing) return
	syncing = true
	notifySync()
	try {
		const { db } = await ensureFirebase()
		const { collection, doc, getDocs, setDoc } = await import('firebase/firestore')
		const uid = currentUser.uid
		const colRef = collection(db, 'users', uid, 'projects')
		const snapshot = await getDocs(colRef)
		const remote = new Map<string, RemoteProject>()
		snapshot.forEach((d) => remote.set(d.id, d.data() as RemoteProject))

		// משיכה: מרחוק חדש יותר → מיישמים מקומית
		const localById = new Map(listProjects().map((p) => [p.id, p]))
		for (const [id, r] of remote) {
			const local = localById.get(id)
			if (r.deleted) continue // מחיקות מרחוק לא נאכפות אוטומטית בגרסה זו
			if (!local || r.updatedAt > local.updatedAt) {
				const meta = { ...(r.meta ?? {}) } as Partial<ProjectMeta>
				delete meta.id
				if (local) {
					updateProject(id, meta)
				} else if (r.meta) {
					// פרויקט חדש מהענן — נרשם ישירות לרשימה
					const projects = listProjects()
					projects.push({ ...(r.meta as ProjectMeta), id, updatedAt: r.updatedAt })
					localStorage.setItem('infinite-canvas:projects', JSON.stringify(projects))
					window.dispatchEvent(new Event('projects-changed'))
				}
				if (r.docContent != null) {
					try {
						saveDocContent(id, JSON.parse(r.docContent))
					} catch {
						// תוכן פגום — מדלגים
					}
				}
				if (r.canvasSnapshot != null) {
					try {
						localStorage.setItem(`infinite-canvas:remote-canvas:${id}`, r.canvasSnapshot)
					} catch {
						// אין מקום — הקנבס יסתנכרן בפעם הבאה
					}
				}
			}
		}

		// דחיפה: מקומי חדש יותר → מעלים
		for (const local of listProjects()) {
			const r = remote.get(local.id)
			const pendingSnapshot = pendingCanvasSnapshots.get(local.id)
			if (r && r.updatedAt >= local.updatedAt && !pendingSnapshot) continue
			const payload: RemoteProject = {
				meta: { ...local, thumbnail: null },
				updatedAt: local.updatedAt,
			}
			if (projectMode(local) === 'doc') {
				const content = loadDocContent(local.id)
				if (content != null) {
					const json = JSON.stringify(content)
					if (json.length <= MAX_CONTENT_BYTES) payload.docContent = json
				}
			} else if (pendingSnapshot) {
				payload.canvasSnapshot = pendingSnapshot
			} else if (r?.canvasSnapshot) {
				payload.canvasSnapshot = r.canvasSnapshot
			}
			await setDoc(doc(db, 'users', uid, 'projects', local.id), payload)
			pendingCanvasSnapshots.delete(local.id)
		}

		lastSyncAt = Date.now()
	} catch (e) {
		console.warn('cloud sync failed', e)
	} finally {
		syncing = false
		notifySync()
	}
}

// שינויים מקומיים מתזמנים סנכרון
if (typeof window !== 'undefined' && cloudEnabled) {
	window.addEventListener('projects-changed', () => scheduleSync())
	window.addEventListener('ic-project-deleted', (e) => {
		void deleteProjectRemote((e as CustomEvent<string>).detail)
	})
}
