import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
	Box,
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
	useValue,
	type TLComponents,
} from 'tldraw'
import 'tldraw/tldraw.css'
import { getAssetUrlsByImport } from '@tldraw/assets/imports.vite'
import { IconBack, IconPage, IconPdf, IconPlus } from '../components/icons'
import { A4_GAP, A4_PX, exportCurrentPageToPdf, findA4Frames } from '../lib/pdf'
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

/** מעדכן את מגבלות המצלמה כך שיקיפו את כל דפי ה-A4 */
function applyA4CameraConstraints(editor: Editor) {
	const frames = findA4Frames(editor)
	if (frames.length === 0) return
	const first = frames[0]
	const last = frames[frames.length - 1]
	const multiPage = frames.length > 1
	editor.setCameraOptions({
		constraints: {
			bounds: {
				x: first.x,
				y: first.y,
				w: A4_PX.w,
				// מקום לכפתור "הוספת דף" מתחת לדף האחרון
				h: last.y + A4_PX.h + 80 - first.y,
			},
			padding: { x: 48, y: 48 },
			origin: { x: 0.5, y: 0 },
			initialZoom: multiPage ? 'fit-x-100' : 'fit-max-100',
			baseZoom: multiPage ? 'fit-x-100' : 'fit-max-100',
			behavior: 'contain',
		},
	})
}

/** במצב דפי A4: דואג שיהיה לפחות דף אחד ומגביל את המצלמה סביב הדפים */
function setUpA4Mode(editor: Editor) {
	if (findA4Frames(editor).length === 0) {
		editor.run(
			() => {
				editor.createShape({
					id: createShapeId(),
					type: 'frame',
					x: 0,
					y: 0,
					meta: { a4: true },
					props: { w: A4_PX.w, h: A4_PX.h, name: 'דף 1' },
				})
			},
			{ history: 'ignore' }
		)
	}
	applyA4CameraConstraints(editor)
	editor.setCamera(editor.getCamera(), { reset: true })
}

/** מוסיף דף A4 חדש מתחת לדף האחרון וגולל אליו */
function addA4Page(editor: Editor) {
	const frames = findA4Frames(editor)
	const last = frames[frames.length - 1]
	const x = last?.x ?? 0
	const y = last ? last.y + A4_PX.h + A4_GAP : 0
	editor.createShape({
		id: createShapeId(),
		type: 'frame',
		x,
		y,
		meta: { a4: true },
		props: { w: A4_PX.w, h: A4_PX.h, name: `דף ${frames.length + 1}` },
	})
	applyA4CameraConstraints(editor)
	editor.zoomToBounds(new Box(x, y, A4_PX.w, A4_PX.h), {
		inset: 48,
		animation: { duration: 320 },
	})
}

/** כפתור "+" צף מתחת לדף ה-A4 האחרון, בתוך מרחב הקנבס */
function AddA4PageButton() {
	const editor = useEditor()
	const position = useValue(
		'a4-add-page-button',
		() => {
			const frames = findA4Frames(editor)
			if (frames.length === 0) return null
			const last = frames[frames.length - 1]
			const point = editor.pageToViewport({
				x: last.x + A4_PX.w / 2,
				y: last.y + A4_PX.h + A4_GAP / 2,
			})
			return { x: point.x, y: point.y, zoom: editor.getZoomLevel() }
		},
		[editor]
	)
	if (!position) return null
	return (
		<button
			className="add-a4-page-btn"
			style={{
				transform: `translate(${position.x}px, ${position.y}px) translate(-50%, -50%) scale(${Math.max(0.7, Math.min(1.15, position.zoom))})`,
			}}
			title="הוספת דף A4 חדש"
			onPointerDown={(e) => e.stopPropagation()}
			onClick={() => addA4Page(editor)}
		>
			<IconPlus size={15} /> הוספת דף
		</button>
	)
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
		...(projectMode(project) === 'a4' ? { InFrontOfTheCanvas: AddA4PageButton } : {}),
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
