import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
	DefaultMainMenu,
	DefaultMainMenuContent,
	Editor,
	Tldraw,
	TldrawUiMenuGroup,
	TldrawUiMenuItem,
	getSnapshot,
	loadSnapshot,
	parseTldrawJsonFile,
	serializeTldrawJsonBlob,
	useEditor,
	type TLComponents,
} from 'tldraw'
import 'tldraw/tldraw.css'
import { getAssetUrlsByImport } from '@tldraw/assets/imports.vite'
import {
	getProject,
	persistenceKeyFor,
	renameProject,
	setProjectThumbnail,
	takePendingImport,
	touchProject,
} from '../lib/projects'
import './editor.css'

// כל הנכסים של tldraw (אייקונים, גופנים, תרגומים — כולל עברית) נארזים
// בתוך האפליקציה, כך שהיא עצמאית לגמרי ולא תלויה ב-CDN חיצוני.
const assetUrls = getAssetUrlsByImport()

/** מוריד את הקנבס הנוכחי כקובץ ‎.tldr */
async function downloadTldrFile(editor: Editor, fileName: string) {
	const blob = await serializeTldrawJsonBlob(editor)
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = `${fileName || 'canvas'}.tldr`
	a.click()
	URL.revokeObjectURL(url)
}

/** טוען קובץ ‎.tldr לתוך העורך (מחליף את תוכן הקנבס הנוכחי) */
function loadTldrJson(editor: Editor, json: string): boolean {
	const result = parseTldrawJsonFile({ json, schema: editor.store.schema })
	if (!result.ok) {
		console.error('נכשלה טעינת קובץ tldr', result.error)
		return false
	}
	const snapshot = getSnapshot(result.value)
	loadSnapshot(editor.store, { document: snapshot.document })
	return true
}

function pickAndLoadTldrFile(editor: Editor, onLoaded: () => void) {
	const input = document.createElement('input')
	input.type = 'file'
	input.accept = '.tldr,application/json'
	input.onchange = async () => {
		const file = input.files?.[0]
		if (!file) return
		const ok = loadTldrJson(editor, await file.text())
		if (ok) {
			onLoaded()
		} else {
			window.alert('הקובץ אינו קובץ ‎.tldr תקין')
		}
	}
	input.click()
}

/** צילום תמונה ממוזערת של העמוד הנוכחי ושמירתה במטא־דאטה של הפרויקט */
async function captureThumbnail(editor: Editor, projectId: string) {
	try {
		const shapeIds = [...editor.getCurrentPageShapeIds()]
		if (shapeIds.length === 0) {
			setProjectThumbnail(projectId, null)
			return
		}
		const bounds = editor.getCurrentPageBounds()
		const scale = bounds ? Math.min(1, 480 / bounds.w, 300 / bounds.h) : 0.5
		const { blob } = await editor.toImage(shapeIds, {
			format: 'png',
			background: true,
			padding: 24,
			scale,
		})
		const dataUrl = await new Promise<string>((resolve, reject) => {
			const reader = new FileReader()
			reader.onload = () => resolve(reader.result as string)
			reader.onerror = () => reject(reader.error)
			reader.readAsDataURL(blob)
		})
		// לא שומרים תמונות ענקיות ב-localStorage
		if (dataUrl.length < 400_000) {
			setProjectThumbnail(projectId, dataUrl)
		}
	} catch (e) {
		console.warn('נכשל צילום תמונה ממוזערת', e)
	}
}

export function EditorPage() {
	const { projectId = '' } = useParams()
	const navigate = useNavigate()
	const project = getProject(projectId)
	const editorRef = useRef<Editor | null>(null)
	const dirtyRef = useRef(false)

	// פרויקט שלא קיים (למשל קישור ישן) — חזרה למסך הראשי
	useEffect(() => {
		if (!project) navigate('/', { replace: true })
	}, [project, navigate])

	const flushThumbnail = useCallback(() => {
		const editor = editorRef.current
		if (!editor || !dirtyRef.current) return
		dirtyRef.current = false
		void captureThumbnail(editor, projectId)
	}, [projectId])

	// צילום תמונה ממוזערת מדי פעם, וכשהחלון נסגר/מוסתר
	useEffect(() => {
		const interval = setInterval(flushThumbnail, 10_000)
		const onHide = () => flushThumbnail()
		document.addEventListener('visibilitychange', onHide)
		window.addEventListener('pagehide', onHide)
		return () => {
			clearInterval(interval)
			document.removeEventListener('visibilitychange', onHide)
			window.removeEventListener('pagehide', onHide)
			flushThumbnail()
		}
	}, [flushThumbnail])

	const handleMount = useCallback(
		(editor: Editor) => {
			editorRef.current = editor

			// אם הגענו מייבוא קובץ — נטען אותו לקנבס
			const pendingJson = takePendingImport(projectId)
			if (pendingJson) {
				const ok = loadTldrJson(editor, pendingJson)
				if (ok) {
					editor.zoomToFit()
					dirtyRef.current = true
					touchProject(projectId)
				}
			}

			// כל שינוי מסמך של המשתמש מעדכן את "עודכן לאחרונה" ומסמן לצילום תמונה
			let touchTimeout: ReturnType<typeof setTimeout> | undefined
			const unlisten = editor.store.listen(
				() => {
					dirtyRef.current = true
					clearTimeout(touchTimeout)
					touchTimeout = setTimeout(() => touchProject(projectId), 1_000)
				},
				{ scope: 'document', source: 'user' }
			)
			return () => {
				clearTimeout(touchTimeout)
				unlisten()
			}
		},
		[projectId]
	)

	if (!project) return null

	const components: TLComponents = {
		MainMenu: CustomMainMenu,
		SharePanel: ProjectPanel,
	}

	return (
		// הדף כולו dir=rtl — ממשק tldraw 3 יורש את הכיוון ומתהפך לעברית;
		// הקנבס עצמו מבוסס קואורדינטות ואינו מושפע מכיוון הטקסט
		<div className="editor-page">
			<Tldraw
				persistenceKey={persistenceKeyFor(projectId)}
				onMount={handleMount}
				components={components}
				assetUrls={assetUrls}
			/>
		</div>
	)
}

/** תפריט ראשי של tldraw בתוספת פעולות קובץ של האפליקציה */
function CustomMainMenu() {
	const editor = useEditor()
	const { projectId = '' } = useParams()
	const project = getProject(projectId)

	return (
		<DefaultMainMenu>
			<TldrawUiMenuGroup id="project-file-actions">
				<TldrawUiMenuItem
					id="save-tldr"
					label="שמירה לקובץ ‎(.tldr)"
					icon="share-1"
					readonlyOk
					onSelect={() => void downloadTldrFile(editor, project?.name ?? 'canvas')}
				/>
				<TldrawUiMenuItem
					id="open-tldr"
					label="פתיחת קובץ ‎.tldr..."
					icon="folder"
					onSelect={() =>
						pickAndLoadTldrFile(editor, () => {
							editor.zoomToFit()
							touchProject(projectId)
						})
					}
				/>
			</TldrawUiMenuGroup>
			<DefaultMainMenuContent />
		</DefaultMainMenu>
	)
}

/** פאנל עליון: חזרה למסך הפרויקטים + שם הפרויקט (ניתן לעריכה) */
function ProjectPanel() {
	const { projectId = '' } = useParams()
	const project = getProject(projectId)
	const [name, setName] = useState(project?.name ?? '')

	const commit = () => {
		if (name.trim() && name.trim() !== project?.name) {
			renameProject(projectId, name)
		} else {
			setName(project?.name ?? '')
		}
	}

	return (
		<div className="project-panel" dir="rtl">
			<Link to="/" className="project-panel-back" title="לכל הפרויקטים">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
					<path
						d="M9 5l7 7-7 7"
						stroke="currentColor"
						strokeWidth="2.4"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
				<span>הפרויקטים שלי</span>
			</Link>
			<span className="project-panel-divider" />
			<input
				className="project-panel-name"
				value={name}
				aria-label="שם הפרויקט"
				onChange={(e) => setName(e.target.value)}
				onBlur={commit}
				onKeyDown={(e) => {
					if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
					if (e.key === 'Escape') {
						setName(project?.name ?? '')
						;(e.target as HTMLInputElement).blur()
					}
				}}
			/>
		</div>
	)
}
