import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
	DefaultMainMenu,
	DefaultMainMenuContent,
	Editor,
	Tldraw,
	TldrawUiMenuGroup,
	TldrawUiMenuItem,
	createShapeId,
	getSnapshot,
	loadSnapshot,
	parseTldrawJsonFile,
	serializeTldrawJsonBlob,
	useEditor,
	type TLComponents,
} from 'tldraw'
import 'tldraw/tldraw.css'
import { getAssetUrlsByImport } from '@tldraw/assets/imports.vite'
import { IconBack, IconPage, IconPdf } from '../components/icons'
import { A4_PX, exportCurrentPageToPdf, findA4Frame } from '../lib/pdf'
import {
	getProject,
	persistenceKeyFor,
	projectMode,
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

/** במצב דף A4: דואג שתהיה מסגרת דף בעמוד ומגביל את המצלמה סביבה */
function setUpA4Mode(editor: Editor) {
	let frame = findA4Frame(editor)
	if (!frame) {
		const id = createShapeId()
		editor.run(
			() => {
				editor.createShape({
					id,
					type: 'frame',
					x: 0,
					y: 0,
					meta: { a4: true },
					props: { w: A4_PX.w, h: A4_PX.h, name: 'דף A4' },
				})
			},
			{ history: 'ignore' }
		)
		frame = findA4Frame(editor)
	}
	const x = frame?.x ?? 0
	const y = frame?.y ?? 0
	editor.setCameraOptions({
		constraints: {
			bounds: { x, y, w: A4_PX.w, h: A4_PX.h },
			padding: { x: 48, y: 48 },
			origin: { x: 0.5, y: 0.5 },
			initialZoom: 'fit-max-100',
			baseZoom: 'fit-max-100',
			behavior: 'contain',
		},
	})
	editor.setCamera(editor.getCamera(), { reset: true })
}

/** צילום תמונה ממוזערת של העמוד הנוכחי ושמירתה במטא־דאטה של הפרויקט */
async function captureThumbnail(editor: Editor, projectId: string) {
	try {
		if (editor.isDisposed) return
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

	// צילום תמונה ממוזערת מדי פעם, וכשהחלון נסגר/מוסתר.
	// לא מצלמים ב-cleanup של האפקט — באותו שלב העורך כבר סגור (ה-cleanup של
	// הרכיב הבן רץ קודם), ולכן המרווח קצר יחסית כדי שהתמונה תישאר עדכנית.
	useEffect(() => {
		const interval = setInterval(flushThumbnail, 6_000)
		const onHide = () => flushThumbnail()
		document.addEventListener('visibilitychange', onHide)
		window.addEventListener('pagehide', onHide)
		return () => {
			clearInterval(interval)
			document.removeEventListener('visibilitychange', onHide)
			window.removeEventListener('pagehide', onHide)
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

			if (projectMode(getProject(projectId)) === 'a4') {
				setUpA4Mode(editor)
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
		// הדף כולו dir=rtl — ממשק tldraw יורש את הכיוון ומתהפך לעברית;
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

async function handleExportPdf(editor: Editor, projectId: string) {
	const project = getProject(projectId)
	const ok = await exportCurrentPageToPdf(editor, {
		fileName: project?.name || 'canvas',
		mode: projectMode(project),
	})
	if (!ok) window.alert('הקנבס ריק — אין מה לייצא')
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
					id="export-pdf"
					label="ייצוא ל-PDF"
					icon="external-link"
					readonlyOk
					onSelect={() => void handleExportPdf(editor, projectId)}
				/>
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

/** פאנל עליון: חזרה, שם הפרויקט, סוג הקנבס וייצוא PDF */
function ProjectPanel() {
	const editor = useEditor()
	const navigate = useNavigate()
	const { projectId = '' } = useParams()
	const project = getProject(projectId)
	const [name, setName] = useState(project?.name ?? '')
	const [exporting, setExporting] = useState(false)
	const mode = projectMode(project)

	// מצלמים תמונה ממוזערת עדכנית לפני היציאה, ורק אז מנווטים
	const goHome = async () => {
		try {
			await captureThumbnail(editor, projectId)
		} finally {
			navigate('/')
		}
	}

	const commit = () => {
		if (name.trim() && name.trim() !== project?.name) {
			renameProject(projectId, name)
		} else {
			setName(project?.name ?? '')
		}
	}

	return (
		<div className="project-panel" dir="rtl">
			<button
				className="project-panel-back"
				title="לכל הפרויקטים"
				aria-label="לכל הפרויקטים"
				onClick={() => void goHome()}
			>
				<IconBack size={16} />
			</button>
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
			{mode === 'a4' && (
				<span className="project-panel-mode" title="פרויקט במצב דף A4">
					<IconPage size={13} /> A4
				</span>
			)}
			<button
				className="project-panel-pdf"
				disabled={exporting}
				onClick={async () => {
					setExporting(true)
					try {
						await handleExportPdf(editor, projectId)
					} finally {
						setExporting(false)
					}
				}}
			>
				<IconPdf size={15} /> {exporting ? 'מייצא...' : 'PDF'}
			</button>
		</div>
	)
}
