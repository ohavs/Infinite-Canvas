/**
 * ניהול פרויקטים מקומי (Local-first):
 * - המטא־דאטה של הפרויקטים (שם, תאריכים, תמונה ממוזערת) נשמר ב-localStorage.
 * - תוכן הקנבס עצמו נשמר על ידי tldraw ב-IndexedDB, מסד נפרד לכל פרויקט
 *   (בשם TLDRAW_DOCUMENT_v2 + persistenceKey), ולכן שכפול/מחיקה של פרויקט
 *   מטפלים גם במסד הזה.
 */

export type CanvasMode = 'infinite' | 'a4' | 'doc'

/** הגדרות כותרת עליונה/תחתונה למסמכי טקסט (מוצג בדף ובקבצים המיוצאים) */
export interface DocHeaderSettings {
	showName: boolean
	showDate: boolean
	address: string
	pageNumbers: boolean
}

export const DEFAULT_DOC_SETTINGS: DocHeaderSettings = {
	showName: false,
	showDate: false,
	address: '',
	pageNumbers: false,
}

export interface ProjectMeta {
	id: string
	name: string
	createdAt: number
	updatedAt: number
	thumbnail?: string | null
	/** קנבס אינסופי, דפי A4 לציור, או מסמך טקסט (פרויקטים ישנים ללא שדה = אינסופי) */
	mode?: CanvasMode
	/** תקציר טקסט לתצוגה בכרטיס — למסמכי טקסט */
	excerpt?: string
	/** הגדרות כותרת/ייצוא — למסמכי טקסט */
	docSettings?: DocHeaderSettings
}

export function getDocSettings(project: ProjectMeta | undefined): DocHeaderSettings {
	return { ...DEFAULT_DOC_SETTINGS, ...project?.docSettings }
}

export function projectMode(project: ProjectMeta | undefined): CanvasMode {
	if (project?.mode === 'a4') return 'a4'
	if (project?.mode === 'doc') return 'doc'
	return 'infinite'
}

const PROJECTS_KEY = 'infinite-canvas:projects'
const TLDRAW_STORE_PREFIX = 'TLDRAW_DOCUMENT_v2'
const TLDRAW_DB_INDEX_KEY = 'TLDRAW_DB_NAME_INDEX_v2'
const TLDRAW_TABLES = ['records', 'schema', 'session_state', 'assets'] as const

export function persistenceKeyFor(projectId: string): string {
	return `infinite-canvas-${projectId}`
}

function dbNameFor(projectId: string): string {
	return TLDRAW_STORE_PREFIX + persistenceKeyFor(projectId)
}

/* ------------------------------ מטא־דאטה ------------------------------ */

export function listProjects(): ProjectMeta[] {
	try {
		const raw = localStorage.getItem(PROJECTS_KEY)
		if (!raw) return []
		const parsed = JSON.parse(raw)
		if (!Array.isArray(parsed)) return []
		return (parsed as ProjectMeta[]).sort((a, b) => b.updatedAt - a.updatedAt)
	} catch {
		return []
	}
}

export function getProject(id: string): ProjectMeta | undefined {
	return listProjects().find((p) => p.id === id)
}

function saveProjects(projects: ProjectMeta[]) {
	localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects))
	window.dispatchEvent(new Event('projects-changed'))
}

export function createProject(name?: string, mode: CanvasMode = 'infinite'): ProjectMeta {
	const projects = listProjects()
	const now = Date.now()
	const project: ProjectMeta = {
		id: crypto.randomUUID(),
		name: name?.trim() || defaultProjectName(projects),
		createdAt: now,
		updatedAt: now,
		thumbnail: null,
		mode,
	}
	saveProjects([project, ...projects])
	return project
}

function defaultProjectName(existing: ProjectMeta[]): string {
	const base = 'פרויקט ללא שם'
	const taken = new Set(existing.map((p) => p.name))
	if (!taken.has(base)) return base
	for (let i = 2; ; i++) {
		const candidate = `${base} ${i}`
		if (!taken.has(candidate)) return candidate
	}
}

export function updateProject(id: string, patch: Partial<Omit<ProjectMeta, 'id'>>) {
	const projects = listProjects()
	const project = projects.find((p) => p.id === id)
	if (!project) return
	Object.assign(project, patch)
	saveProjects(projects)
}

export function renameProject(id: string, name: string) {
	const trimmed = name.trim()
	if (!trimmed) return
	updateProject(id, { name: trimmed, updatedAt: Date.now() })
}

export function touchProject(id: string) {
	updateProject(id, { updatedAt: Date.now() })
}

export function setProjectThumbnail(id: string, thumbnail: string | null) {
	// לא נוגעים ב-updatedAt — צילום התמונה אינו עריכה של המשתמש
	updateProject(id, { thumbnail })
}

export function setProjectExcerpt(id: string, excerpt: string) {
	updateProject(id, { excerpt })
}

/* --------------------------- IndexedDB עזרים --------------------------- */

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result)
		request.onerror = () => reject(request.error)
	})
}

function openTldrawDb(name: string): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		// אותה גרסה ואותם object stores כמו שיוצר tldraw עצמו
		const request = indexedDB.open(name, 4)
		request.onupgradeneeded = () => {
			const db = request.result
			for (const table of TLDRAW_TABLES) {
				if (!db.objectStoreNames.contains(table)) {
					db.createObjectStore(table)
				}
			}
		}
		request.onsuccess = () => resolve(request.result)
		request.onerror = () => reject(request.error)
	})
}

function addToTldrawDbIndex(dbName: string) {
	// tldraw מנהל אינדקס של שמות המסדים שלו (למשל בשביל איפוס מלא) — נשמור עליו מעודכן
	try {
		const raw = localStorage.getItem(TLDRAW_DB_INDEX_KEY)
		const names: string[] = raw ? JSON.parse(raw) : []
		if (!names.includes(dbName)) {
			names.push(dbName)
			localStorage.setItem(TLDRAW_DB_INDEX_KEY, JSON.stringify(names))
		}
	} catch {
		// אינדקס פגום — לא קריטי
	}
}

function removeFromTldrawDbIndex(dbName: string) {
	try {
		const raw = localStorage.getItem(TLDRAW_DB_INDEX_KEY)
		if (!raw) return
		const names: string[] = JSON.parse(raw)
		localStorage.setItem(TLDRAW_DB_INDEX_KEY, JSON.stringify(names.filter((n) => n !== dbName)))
	} catch {
		// לא קריטי
	}
}

async function copyTldrawDb(sourceName: string, targetName: string) {
	const source = await openTldrawDb(sourceName)
	const target = await openTldrawDb(targetName)
	try {
		for (const table of TLDRAW_TABLES) {
			if (!source.objectStoreNames.contains(table)) continue
			const readTx = source.transaction(table, 'readonly').objectStore(table)
			const [keys, values] = await Promise.all([
				requestToPromise(readTx.getAllKeys()),
				requestToPromise(readTx.getAll()),
			])
			if (keys.length === 0) continue
			const writeTx = target.transaction(table, 'readwrite')
			const store = writeTx.objectStore(table)
			keys.forEach((key, i) => store.put(values[i], key))
			await new Promise<void>((resolve, reject) => {
				writeTx.oncomplete = () => resolve()
				writeTx.onerror = () => reject(writeTx.error)
				writeTx.onabort = () => reject(writeTx.error)
			})
		}
		addToTldrawDbIndex(targetName)
	} finally {
		source.close()
		target.close()
	}
}

function deleteDb(name: string): Promise<void> {
	return new Promise((resolve) => {
		const request = indexedDB.deleteDatabase(name)
		request.onsuccess = () => resolve()
		request.onerror = () => resolve()
		request.onblocked = () => resolve()
	})
}

/* --------------------------- פעולות על פרויקט --------------------------- */

function docStorageKey(projectId: string): string {
	return `infinite-canvas:doc:${projectId}`
}

export async function duplicateProject(id: string): Promise<ProjectMeta | undefined> {
	const projects = listProjects()
	const source = projects.find((p) => p.id === id)
	if (!source) return undefined
	const now = Date.now()
	const copy: ProjectMeta = {
		id: crypto.randomUUID(),
		name: `${source.name} — עותק`,
		createdAt: now,
		updatedAt: now,
		thumbnail: source.thumbnail ?? null,
		mode: source.mode,
		excerpt: source.excerpt,
	}
	if (projectMode(source) === 'doc') {
		// תוכן מסמך טקסט נשמר ב-localStorage
		const content = localStorage.getItem(docStorageKey(source.id))
		if (content != null) localStorage.setItem(docStorageKey(copy.id), content)
	} else {
		await copyTldrawDb(dbNameFor(source.id), dbNameFor(copy.id))
	}
	saveProjects([copy, ...listProjects()])
	return copy
}

export async function deleteProject(id: string): Promise<void> {
	const dbName = dbNameFor(id)
	await deleteDb(dbName)
	removeFromTldrawDbIndex(dbName)
	localStorage.removeItem(docStorageKey(id))
	saveProjects(listProjects().filter((p) => p.id !== id))
}

/* --------------------------- תוכן מסמכי טקסט --------------------------- */

export function loadDocContent(projectId: string): unknown | null {
	try {
		const raw = localStorage.getItem(docStorageKey(projectId))
		return raw ? JSON.parse(raw) : null
	} catch {
		return null
	}
}

export function saveDocContent(projectId: string, content: unknown) {
	localStorage.setItem(docStorageKey(projectId), JSON.stringify(content))
}

/* ----------------------- ייבוא קובץ ‎.tldr ממתין ----------------------- */

const pendingImports = new Map<string, string>()

export function stashPendingImport(projectId: string, fileJson: string) {
	pendingImports.set(projectId, fileJson)
}

export function takePendingImport(projectId: string): string | undefined {
	const json = pendingImports.get(projectId)
	pendingImports.delete(projectId)
	return json
}
