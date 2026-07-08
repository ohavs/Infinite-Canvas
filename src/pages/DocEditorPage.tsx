import CharacterCount from '@tiptap/extension-character-count'
import { Color } from '@tiptap/extension-color'
import FontFamily from '@tiptap/extension-font-family'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import Table from '@tiptap/extension-table'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TableRow from '@tiptap/extension-table-row'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import TextAlign from '@tiptap/extension-text-align'
import TextStyle from '@tiptap/extension-text-style'
import Underline from '@tiptap/extension-underline'
import {
	BubbleMenu,
	EditorContent,
	useEditor,
	type Editor as TipTapEditor,
} from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { IconBack, IconPdf, IconTrash } from '../components/icons'
import { TableHoverControls } from '../components/TableHoverControls'
import { ThemeControls } from '../components/ThemeControls'
import { showToast } from '../components/toast'
import { exportDocToDocx } from '../lib/docx-export'
import {
	getDocSettings,
	getProject,
	loadDocContent,
	renameProject,
	saveDocContent,
	setProjectExcerpt,
	touchProject,
	updateProject,
	type DocHeaderSettings,
} from '../lib/projects'
import { ResizableImage } from '../lib/resizable-image'
import { deleteSignature, listSignatures, saveSignature, trimCanvas } from '../lib/signatures'
import { RtlTableColumnResize } from '../lib/table-extras'
import { clearPendingTemplate, peekPendingTemplate } from '../lib/templates'
import { FontSize, LineHeight, ParagraphDirection } from '../lib/tiptap-extensions'
import './doc-editor.css'

const headerDateFormat = new Intl.DateTimeFormat('he-IL', { dateStyle: 'long' })

/* ------------------------------ קבועים ------------------------------ */

const TEXT_COLORS = [
	['#211c15', 'שחור'],
	['#6b7280', 'אפור'],
	['#cf3f1d', 'אדום'],
	['#e8722a', 'כתום'],
	['#b45309', 'חום'],
	['#15803d', 'ירוק'],
	['#0369a1', 'כחול'],
	['#7c3aed', 'סגול'],
	['#be185d', 'ורוד'],
] as const

const HIGHLIGHT_COLORS = [
	['#fff2a8', 'צהוב'],
	['#c8f7c5', 'ירוק'],
	['#c5e8f7', 'תכלת'],
	['#fbd3e0', 'ורוד'],
	['#fde3c8', 'כתום'],
	['#e5d4f7', 'סגול'],
] as const

const FONT_FAMILIES = [
	['', 'ברירת מחדל (Heebo)'],
	['Arial, sans-serif', 'Arial'],
	['"Times New Roman", serif', 'Times New Roman'],
	['Georgia, serif', 'Georgia'],
	['"Courier New", monospace', 'Courier New'],
] as const

const FONT_SIZES = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '40px', '48px']

const LINE_HEIGHTS = [
	['1', '1'],
	['1.15', '1.15'],
	['1.5', '1.5'],
	['2', '2'],
] as const

/* ---------------------- רענון UI על כל שינוי בעורך ---------------------- */

function useEditorTick(editor: TipTapEditor | null) {
	const [, setTick] = useState(0)
	useEffect(() => {
		if (!editor) return
		const update = () => setTick((t) => t + 1)
		editor.on('transaction', update)
		editor.on('selectionUpdate', update)
		return () => {
			editor.off('transaction', update)
			editor.off('selectionUpdate', update)
		}
	}, [editor])
}

/* ------------------------------- העמוד ------------------------------- */

export function DocEditorPage() {
	const { projectId = '' } = useParams()
	const navigate = useNavigate()
	const project = getProject(projectId)
	const [name, setName] = useState(project?.name ?? '')
	const [settings, setSettings] = useState<DocHeaderSettings>(() => getDocSettings(project))
	const [showSettings, setShowSettings] = useState(false)
	const [showSignaturePad, setShowSignaturePad] = useState(false)
	const [linkDialog, setLinkDialog] = useState<{ href: string } | null>(null)
	const saveTimeout = useRef<ReturnType<typeof setTimeout>>(undefined)
	const scrollRef = useRef<HTMLElement>(null)

	const editor = useEditor({
		extensions: [
			StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
			Underline,
			Subscript,
			Superscript,
			TextStyle,
			Color,
			FontFamily,
			FontSize,
			LineHeight,
			ParagraphDirection,
			Highlight.configure({ multicolor: true }),
			TextAlign.configure({ types: ['heading', 'paragraph'], defaultAlignment: 'right' }),
			Link.configure({ openOnClick: false, autolink: true }),
			Placeholder.configure({ placeholder: 'התחילו לכתוב כאן…' }),
			CharacterCount,
			TaskList,
			TaskItem.configure({ nested: true }),
			// handleWidth שלילי מנטרל את מנגנון הגרירה המובנה (שאינו תומך RTL)
			// אך משאיר את רינדור רוחבי העמודות; הגרירה עצמה ב-RtlTableColumnResize
			Table.configure({ resizable: true, handleWidth: -1 }),
			TableRow,
			TableCell,
			TableHeader,
			RtlTableColumnResize,
			ResizableImage,
		],
		content:
			(loadDocContent(projectId) as object | null) ??
			(peekPendingTemplate(projectId)?.docContent as object | undefined),
		autofocus: 'end',
		onUpdate: ({ editor }) => {
			clearTimeout(saveTimeout.current)
			saveTimeout.current = setTimeout(() => {
				saveDocContent(projectId, editor.getJSON())
				setProjectExcerpt(projectId, editor.getText().trim().slice(0, 220))
				touchProject(projectId)
			}, 700)
		},
	})

	useEditorTick(editor)

	// אחרי שהעורך עלה עם תוכן התבנית — מנקים אותה ושומרים מיד
	useEffect(() => {
		if (!editor) return
		if (peekPendingTemplate(projectId)) {
			clearPendingTemplate(projectId)
			saveDocContent(projectId, editor.getJSON())
			setProjectExcerpt(projectId, editor.getText().trim().slice(0, 220))
		}
	}, [editor, projectId])

	// פרויקט שלא קיים — חזרה למסך הראשי
	useEffect(() => {
		if (!project) navigate('/', { replace: true })
	}, [project, navigate])

	// שמירה מיידית כשעוזבים את הדף
	useEffect(() => {
		const flush = () => {
			if (!editor) return
			clearTimeout(saveTimeout.current)
			saveDocContent(projectId, editor.getJSON())
			setProjectExcerpt(projectId, editor.getText().trim().slice(0, 220))
		}
		window.addEventListener('pagehide', flush)
		return () => {
			window.removeEventListener('pagehide', flush)
			flush()
		}
	}, [editor, projectId])

	// שם המסמך ככותרת הדפדפן (וגם שם קובץ ה-PDF בהדפסה)
	useEffect(() => {
		const original = document.title
		document.title = project?.name ?? original
		return () => {
			document.title = original
		}
	}, [project?.name])

	const commitName = () => {
		if (name.trim() && name.trim() !== project?.name) {
			renameProject(projectId, name)
		} else {
			setName(project?.name ?? '')
		}
	}

	const handleExportDocx = useCallback(async () => {
		if (!editor) return
		try {
			const headerLines = [
				...(settings.showDate ? [headerDateFormat.format(Date.now())] : []),
				...settings.address.split('\n').filter((l) => l.trim()),
			]
			await exportDocToDocx(editor.getJSON(), project?.name || 'document', {
				headerTitle: settings.showName ? project?.name : undefined,
				headerLines,
				pageNumbers: settings.pageNumbers,
			})
			showToast('קובץ ה-Word ירד בהצלחה', 'success')
		} catch (e) {
			console.error(e)
			showToast('הייצוא ל-Word נכשל', 'error')
		}
	}, [editor, project?.name, settings])

	const openLinkDialog = useCallback(() => {
		if (!editor) return
		if (editor.isActive('link')) {
			editor.chain().focus().unsetLink().run()
			showToast('הקישור הוסר', 'info')
			return
		}
		setLinkDialog({ href: '' })
	}, [editor])

	const insertSignature = useCallback(
		(src: string) => {
			editor
				?.chain()
				.focus()
				.insertContent({ type: 'image', attrs: { src, width: 170 } })
				.run()
		},
		[editor]
	)

	if (!project) return null

	const words = editor?.storage.characterCount.words() ?? 0
	const hasHeader = settings.showName || settings.showDate || Boolean(settings.address.trim())

	return (
		<div className="doc-page">
			<header className="doc-topbar">
				<button className="doc-back" title="לכל הפרויקטים" onClick={() => navigate('/')}>
					<IconBack size={16} />
				</button>
				<input
					className="doc-name"
					value={name}
					aria-label="שם המסמך"
					onChange={(e) => setName(e.target.value)}
					onBlur={commitName}
					onKeyDown={(e) => {
						if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
					}}
				/>
				<span className="doc-words">{words} מילים</span>
				<div className="doc-topbar-actions">
					<ThemeControls />
					<button
						className="doc-btn doc-btn-ghost"
						title="הגדרות המסמך"
						onClick={() => setShowSettings(true)}
					>
						<GearGlyph /> הגדרות
					</button>
					<button className="doc-btn doc-btn-ghost" onClick={() => window.print()}>
						<IconPdf size={15} /> PDF / הדפסה
					</button>
					<button className="doc-btn doc-btn-ink" onClick={() => void handleExportDocx()}>
						<WordGlyph /> ייצוא ל-Word
					</button>
				</div>
			</header>

			{editor && (
				<Toolbar
					editor={editor}
					onInsertSignature={insertSignature}
					onNewSignature={() => setShowSignaturePad(true)}
					onOpenLink={openLinkDialog}
				/>
			)}

			{editor && (
				<BubbleMenu
					editor={editor}
					tippyOptions={{ duration: 120, placement: 'top' }}
					shouldShow={({ editor, state }) =>
						!state.selection.empty && !editor.isActive('image')
					}
				>
					<div className="doc-bubble" dir="rtl">
						<MarkBtn editor={editor} mark="bold" label="ב" title="מודגש" style={{ fontWeight: 800 }} />
						<MarkBtn editor={editor} mark="italic" label="נ" title="נטוי" style={{ fontStyle: 'italic' }} />
						<MarkBtn editor={editor} mark="underline" label="ק" title="קו תחתון" style={{ textDecoration: 'underline' }} />
						<MarkBtn editor={editor} mark="strike" label="ח" title="קו חוצה" style={{ textDecoration: 'line-through' }} />
						<span className="doc-sep" />
						<button
							className={`doc-tool ${editor.isActive('highlight') ? 'active' : ''}`}
							title="מרקר צהוב"
							onClick={() => editor.chain().focus().toggleHighlight({ color: '#fff2a8' }).run()}
						>
							<span className="doc-hl-glyph">א</span>
						</button>
						<button
							className={`doc-tool ${editor.isActive('link') ? 'active' : ''}`}
							title="קישור"
							onClick={openLinkDialog}
						>
							<LinkGlyph />
						</button>
					</div>
				</BubbleMenu>
			)}

			<main className="doc-scroll" ref={scrollRef}>
				{editor && <TableHoverControls editor={editor} scrollRef={scrollRef} />}
				<div className="doc-sheet-wrap">
					<div className={`doc-sheet ${hasHeader ? 'has-header' : ''}`}>
						{hasHeader && (
							<div className="doc-sheet-header" dir="rtl" contentEditable={false}>
								<div className="doc-sheet-header-main">
									{settings.showName && <strong>{project.name}</strong>}
									{settings.address
										.split('\n')
										.filter((l) => l.trim())
										.map((line, i) => (
											<span key={i}>{line}</span>
										))}
								</div>
								{settings.showDate && (
									<span className="doc-sheet-header-date">{headerDateFormat.format(Date.now())}</span>
								)}
							</div>
						)}
						<EditorContent editor={editor} />
					</div>
				</div>
			</main>

			{showSettings && (
				<DocSettingsDialog
					settings={settings}
					onClose={() => setShowSettings(false)}
					onSave={(next) => {
						setSettings(next)
						updateProject(projectId, { docSettings: next })
						setShowSettings(false)
					}}
				/>
			)}

			{showSignaturePad && (
				<SignatureDialog
					onClose={() => setShowSignaturePad(false)}
					onSave={(dataUrl) => {
						saveSignature(dataUrl)
						insertSignature(dataUrl)
						setShowSignaturePad(false)
						showToast('החתימה נשמרה ונוספה למסמך', 'success')
					}}
				/>
			)}

			{linkDialog && editor && (
				<LinkDialog
					initialHref={linkDialog.href}
					onClose={() => setLinkDialog(null)}
					onSubmit={(href) => {
						editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
						setLinkDialog(null)
						showToast('הקישור נוסף', 'success')
					}}
				/>
			)}
		</div>
	)
}

/* ----------------------------- דיאלוג קישור ----------------------------- */

function LinkDialog({
	initialHref,
	onClose,
	onSubmit,
}: {
	initialHref: string
	onClose: () => void
	onSubmit: (href: string) => void
}) {
	const [url, setUrl] = useState(initialHref)

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose()
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [onClose])

	const submit = () => {
		const trimmed = url.trim()
		if (!trimmed) return
		onSubmit(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
	}

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal" role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
				<h3>הוספת קישור</h3>
				<form
					onSubmit={(e) => {
						e.preventDefault()
						submit()
					}}
				>
					<input
						className="text-input"
						dir="ltr"
						value={url}
						autoFocus
						placeholder="www.example.com"
						onChange={(e) => setUrl(e.target.value)}
					/>
					<div className="modal-actions">
						<button type="button" className="btn btn-ghost" onClick={onClose}>
							ביטול
						</button>
						<button type="submit" className="btn btn-accent" disabled={!url.trim()}>
							הוספה
						</button>
					</div>
				</form>
			</div>
		</div>
	)
}

/* ---------------------------- הגדרות המסמך ---------------------------- */

function DocSettingsDialog({
	settings,
	onClose,
	onSave,
}: {
	settings: DocHeaderSettings
	onClose: () => void
	onSave: (next: DocHeaderSettings) => void
}) {
	const [draft, setDraft] = useState(settings)

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose()
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [onClose])

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal" role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
				<h3>הגדרות המסמך</h3>
				<p className="modal-text">
					מה יופיע בראש הדף — גם על המסך, גם בהדפסה/PDF וגם בקובץ ה-Word (שם חוזר בכל עמוד).
				</p>
				<label className="doc-check">
					<input
						type="checkbox"
						checked={draft.showName}
						onChange={(e) => setDraft({ ...draft, showName: e.target.checked })}
					/>
					שם הפרויקט
				</label>
				<label className="doc-check">
					<input
						type="checkbox"
						checked={draft.showDate}
						onChange={(e) => setDraft({ ...draft, showDate: e.target.checked })}
					/>
					התאריך של היום
				</label>
				<label className="doc-check">
					<input
						type="checkbox"
						checked={draft.pageNumbers}
						onChange={(e) => setDraft({ ...draft, pageNumbers: e.target.checked })}
					/>
					מספרי עמודים (בקובץ ה-Word)
				</label>
				<span className="field-label">כתובת / פרטים נוספים</span>
				<textarea
					className="text-input doc-address-input"
					rows={3}
					placeholder={'למשל:\nרחוב הדוגמה 12, תל אביב\n050-0000000'}
					value={draft.address}
					onChange={(e) => setDraft({ ...draft, address: e.target.value })}
				/>
				<div className="modal-actions">
					<button className="btn btn-ghost" onClick={onClose}>
						ביטול
					</button>
					<button className="btn btn-accent" onClick={() => onSave(draft)}>
						שמירה
					</button>
				</div>
			</div>
		</div>
	)
}

/* ------------------------------ ציור חתימה ------------------------------ */

function SignatureDialog({
	onClose,
	onSave,
}: {
	onClose: () => void
	onSave: (dataUrl: string) => void
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const [color, setColor] = useState('#1b2a56')
	const [dirty, setDirty] = useState(false)
	const drawing = useRef(false)
	const last = useRef<{ x: number; y: number } | null>(null)
	const fileInputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose()
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [onClose])

	const pointOf = (e: React.PointerEvent) => {
		const canvas = canvasRef.current!
		const rect = canvas.getBoundingClientRect()
		return {
			x: ((e.clientX - rect.left) * canvas.width) / rect.width,
			y: ((e.clientY - rect.top) * canvas.height) / rect.height,
		}
	}

	const onPointerDown = (e: React.PointerEvent) => {
		e.preventDefault()
		;(e.target as HTMLElement).setPointerCapture(e.pointerId)
		drawing.current = true
		last.current = pointOf(e)
	}

	const onPointerMove = (e: React.PointerEvent) => {
		if (!drawing.current || !last.current) return
		const ctx = canvasRef.current?.getContext('2d')
		if (!ctx) return
		const point = pointOf(e)
		ctx.strokeStyle = color
		ctx.lineWidth = 2.6
		ctx.lineCap = 'round'
		ctx.lineJoin = 'round'
		ctx.beginPath()
		ctx.moveTo(last.current.x, last.current.y)
		ctx.lineTo(point.x, point.y)
		ctx.stroke()
		last.current = point
		if (!dirty) setDirty(true)
	}

	const onPointerUp = () => {
		drawing.current = false
		last.current = null
	}

	const clear = () => {
		const canvas = canvasRef.current
		canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
		setDirty(false)
	}

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal doc-sig-modal" role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
				<h3>חתימה חדשה</h3>
				<p className="modal-text">ציירו את החתימה עם העכבר או האצבע. היא תישמר לשימוש חוזר.</p>
				<canvas
					ref={canvasRef}
					className="doc-sig-canvas"
					width={520}
					height={200}
					onPointerDown={onPointerDown}
					onPointerMove={onPointerMove}
					onPointerUp={onPointerUp}
				/>
				<div className="doc-sig-controls">
					<span className="doc-sig-colors">
						{['#1b2a56', '#211c15'].map((c) => (
							<button
								key={c}
								className={`doc-sig-color ${color === c ? 'active' : ''}`}
								style={{ background: c }}
								title={c === '#211c15' ? 'דיו שחור' : 'דיו כחול'}
								onClick={() => setColor(c)}
							/>
						))}
					</span>
					<button className="btn btn-ghost" onClick={clear}>
						ניקוי
					</button>
					<button className="btn btn-ghost" onClick={() => fileInputRef.current?.click()}>
						העלאת תמונת חתימה
					</button>
				</div>
				<div className="modal-actions">
					<button className="btn btn-ghost" onClick={onClose}>
						ביטול
					</button>
					<button
						className="btn btn-accent"
						disabled={!dirty}
						onClick={() => canvasRef.current && onSave(trimCanvas(canvasRef.current))}
					>
						שמירה והוספה למסמך
					</button>
				</div>
				<input
					ref={fileInputRef}
					type="file"
					accept="image/png,image/jpeg,image/webp"
					hidden
					onChange={(e) => {
						const file = e.target.files?.[0]
						e.target.value = ''
						if (!file) return
						const reader = new FileReader()
						reader.onload = () => onSave(reader.result as string)
						reader.readAsDataURL(file)
					}}
				/>
			</div>
		</div>
	)
}

/* ------------------------------ סרגל כלים ------------------------------ */

function Toolbar({
	editor,
	onInsertSignature,
	onNewSignature,
	onOpenLink,
}: {
	editor: TipTapEditor
	onInsertSignature: (src: string) => void
	onNewSignature: () => void
	onOpenLink: () => void
}) {
	const [openMenu, setOpenMenu] = useState<string | null>(null)
	const [signatures, setSignatures] = useState<string[]>(() => listSignatures())
	const imageInputRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		if (!openMenu) return
		const close = () => setOpenMenu(null)
		window.addEventListener('pointerdown', close)
		return () => window.removeEventListener('pointerdown', close)
	}, [openMenu])

	const blockValue = editor.isActive('heading', { level: 1 })
		? 'h1'
		: editor.isActive('heading', { level: 2 })
			? 'h2'
			: editor.isActive('heading', { level: 3 })
				? 'h3'
				: 'p'

	const setBlock = (value: string) => {
		const chain = editor.chain().focus()
		if (value === 'p') chain.setParagraph().run()
		else chain.toggleHeading({ level: Number(value[1]) as 1 | 2 | 3 }).run()
	}

	const insertImage = (file: File) => {
		const reader = new FileReader()
		reader.onload = () => {
			editor.chain().focus().setImage({ src: reader.result as string }).run()
		}
		reader.readAsDataURL(file)
	}

	const currentDir =
		(editor.getAttributes('paragraph').dir as string) ??
		(editor.getAttributes('heading').dir as string) ??
		null

	return (
		<div className="doc-toolbar" dir="rtl" onPointerDown={(e) => e.stopPropagation()}>
			{/* ביטול/חזרה */}
			<button className="doc-tool" title="ביטול (Ctrl+Z)" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
				<UndoGlyph />
			</button>
			<button className="doc-tool" title="חזרה (Ctrl+Y)" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
				<RedoGlyph />
			</button>

			<span className="doc-sep" />

			{/* סגנון פסקה, גופן וגודל — תפריטים מעוצבים */}
			<SelectDropdown
				id="block"
				openMenu={openMenu}
				setOpenMenu={setOpenMenu}
				title="סגנון פסקה"
				width={104}
				value={blockValue}
				options={[
					['p', 'טקסט רגיל'],
					['h1', 'כותרת 1'],
					['h2', 'כותרת 2'],
					['h3', 'כותרת 3'],
				]}
				onSelect={setBlock}
			/>

			<SelectDropdown
				id="font"
				openMenu={openMenu}
				setOpenMenu={setOpenMenu}
				title="גופן"
				width={128}
				value={(editor.getAttributes('textStyle').fontFamily as string) ?? ''}
				options={FONT_FAMILIES.map(([value, label]) => [value, label] as [string, string])}
				optionStyle={(value) => (value ? { fontFamily: value } : undefined)}
				onSelect={(v) => {
					if (v) editor.chain().focus().setFontFamily(v).run()
					else editor.chain().focus().unsetFontFamily().run()
				}}
			/>

			<SelectDropdown
				id="fontsize"
				openMenu={openMenu}
				setOpenMenu={setOpenMenu}
				title="גודל גופן"
				width={58}
				value={(editor.getAttributes('textStyle').fontSize as string) ?? '16px'}
				options={FONT_SIZES.map((size) => [size, String(parseInt(size))] as [string, string])}
				onSelect={(v) => editor.chain().focus().setFontSize(v).run()}
			/>

			<span className="doc-sep" />

			{/* הדגשות */}
			<MarkBtn editor={editor} mark="bold" label="ב" title="מודגש (Ctrl+B)" style={{ fontWeight: 800 }} />
			<MarkBtn editor={editor} mark="italic" label="נ" title="נטוי (Ctrl+I)" style={{ fontStyle: 'italic' }} />
			<MarkBtn editor={editor} mark="underline" label="ק" title="קו תחתון (Ctrl+U)" style={{ textDecoration: 'underline' }} />
			<MarkBtn editor={editor} mark="strike" label="ח" title="קו חוצה" style={{ textDecoration: 'line-through' }} />
			<MarkBtn editor={editor} mark="subscript" label="א₂" title="כתב תחתי" />
			<MarkBtn editor={editor} mark="superscript" label="א²" title="כתב עילי" />

			{/* צבע טקסט */}
			<Dropdown
				id="color"
				openMenu={openMenu}
				setOpenMenu={setOpenMenu}
				button={
					<span className="doc-color-glyph" style={{ borderBottomColor: (editor.getAttributes('textStyle').color as string) ?? '#211c15' }}>
						א
					</span>
				}
				title="צבע טקסט"
			>
				<div className="doc-palette">
					{TEXT_COLORS.map(([color, label]) => (
						<button
							key={color}
							className="doc-swatch"
							style={{ background: color }}
							title={label}
							onClick={() => {
								editor.chain().focus().setColor(color).run()
								setOpenMenu(null)
							}}
						/>
					))}
				</div>
				<button
					className="doc-menu-item"
					onClick={() => {
						editor.chain().focus().unsetColor().run()
						setOpenMenu(null)
					}}
				>
					ניקוי צבע
				</button>
			</Dropdown>

			{/* מרקר */}
			<Dropdown
				id="highlight"
				openMenu={openMenu}
				setOpenMenu={setOpenMenu}
				button={<span className="doc-hl-glyph">א</span>}
				title="צבע סימון (מרקר)"
			>
				<div className="doc-palette">
					{HIGHLIGHT_COLORS.map(([color, label]) => (
						<button
							key={color}
							className="doc-swatch"
							style={{ background: color }}
							title={label}
							onClick={() => {
								editor.chain().focus().setHighlight({ color }).run()
								setOpenMenu(null)
							}}
						/>
					))}
				</div>
				<button
					className="doc-menu-item"
					onClick={() => {
						editor.chain().focus().unsetHighlight().run()
						setOpenMenu(null)
					}}
				>
					הסרת סימון
				</button>
			</Dropdown>

			<span className="doc-sep" />

			{/* יישור וכיוון */}
			<AlignBtn editor={editor} align="right" title="יישור לימין" />
			<AlignBtn editor={editor} align="center" title="מרכוז" />
			<AlignBtn editor={editor} align="left" title="יישור לשמאל" />
			<AlignBtn editor={editor} align="justify" title="יישור דו-צדדי" />

			<Dropdown
				id="lineheight"
				openMenu={openMenu}
				setOpenMenu={setOpenMenu}
				button={<LineHeightGlyph />}
				title="גובה שורה"
			>
				{LINE_HEIGHTS.map(([value, label]) => (
					<button
						key={value}
						className="doc-menu-item"
						onClick={() => {
							editor.chain().focus().setLineHeight(value).run()
							setOpenMenu(null)
						}}
					>
						{label}
					</button>
				))}
			</Dropdown>

			<button
				className={`doc-tool ${currentDir === 'ltr' ? 'active' : ''}`}
				title="כיוון טקסט (RTL/LTR)"
				onClick={() =>
					editor.chain().focus().setTextDirection(currentDir === 'ltr' ? null : 'ltr').run()
				}
			>
				⇄
			</button>

			<span className="doc-sep" />

			{/* רשימות */}
			<button className={`doc-tool ${editor.isActive('bulletList') ? 'active' : ''}`} title="רשימת תבליטים" onClick={() => editor.chain().focus().toggleBulletList().run()}>
				<BulletGlyph />
			</button>
			<button className={`doc-tool ${editor.isActive('orderedList') ? 'active' : ''}`} title="רשימה ממוספרת" onClick={() => editor.chain().focus().toggleOrderedList().run()}>
				<NumberGlyph />
			</button>
			<button className={`doc-tool ${editor.isActive('taskList') ? 'active' : ''}`} title="רשימת משימות" onClick={() => editor.chain().focus().toggleTaskList().run()}>
				<ChecklistGlyph />
			</button>

			<span className="doc-sep" />

			{/* בלוקים */}
			<button className={`doc-tool ${editor.isActive('blockquote') ? 'active' : ''}`} title="ציטוט" onClick={() => editor.chain().focus().toggleBlockquote().run()}>
				❝
			</button>
			<button className={`doc-tool ${editor.isActive('codeBlock') ? 'active' : ''}`} title="בלוק קוד" onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
				{'</>'}
			</button>
			<button className="doc-tool" title="קו מפריד" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
				—
			</button>

			<span className="doc-sep" />

			{/* הוספות */}
			<button className={`doc-tool ${editor.isActive('link') ? 'active' : ''}`} title="קישור" onClick={onOpenLink}>
				<LinkGlyph />
			</button>
			<button className="doc-tool" title="הוספת תמונה" onClick={() => imageInputRef.current?.click()}>
				<ImageGlyph />
			</button>
			<Dropdown
				id="signature"
				openMenu={openMenu}
				setOpenMenu={(id) => {
					if (id === 'signature') setSignatures(listSignatures())
					setOpenMenu(id)
				}}
				button={<SignatureGlyph />}
				title="חתימה"
			>
				{signatures.length > 0 && (
					<div className="doc-sig-list">
						{signatures.map((src, i) => (
							<div key={i} className="doc-sig-item">
								<button
									className="doc-sig-thumb"
									title="הוספת החתימה למסמך"
									onClick={() => {
										onInsertSignature(src)
										setOpenMenu(null)
									}}
								>
									<img src={src} alt={`חתימה ${i + 1}`} />
								</button>
								<button
									className="doc-sig-delete"
									title="מחיקת החתימה השמורה"
									onClick={() => setSignatures(deleteSignature(i))}
								>
									<IconTrash size={13} />
								</button>
							</div>
						))}
					</div>
				)}
				<button
					className="doc-menu-item"
					onClick={() => {
						setOpenMenu(null)
						onNewSignature()
					}}
				>
					✒️ חתימה חדשה...
				</button>
			</Dropdown>
			<Dropdown id="table" openMenu={openMenu} setOpenMenu={setOpenMenu} button={<TableGlyph />} title="טבלה">
				<button
					className="doc-menu-item"
					onClick={() => {
						editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
						setOpenMenu(null)
					}}
				>
					הוספת טבלה 3×3
				</button>
				<button className="doc-menu-item" disabled={!editor.can().addRowAfter()} onClick={() => editor.chain().focus().addRowAfter().run()}>
					הוספת שורה
				</button>
				<button className="doc-menu-item" disabled={!editor.can().addColumnAfter()} onClick={() => editor.chain().focus().addColumnAfter().run()}>
					הוספת עמודה
				</button>
				<button className="doc-menu-item" disabled={!editor.can().deleteRow()} onClick={() => editor.chain().focus().deleteRow().run()}>
					מחיקת שורה
				</button>
				<button className="doc-menu-item" disabled={!editor.can().deleteColumn()} onClick={() => editor.chain().focus().deleteColumn().run()}>
					מחיקת עמודה
				</button>
				<button className="doc-menu-item danger" disabled={!editor.can().deleteTable()} onClick={() => { editor.chain().focus().deleteTable().run(); setOpenMenu(null) }}>
					מחיקת טבלה
				</button>
			</Dropdown>

			<span className="doc-sep" />

			<button className="doc-tool" title="ניקוי עיצוב" onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}>
				<EraserGlyph />
			</button>

			<input
				ref={imageInputRef}
				type="file"
				accept="image/png,image/jpeg,image/gif,image/webp"
				hidden
				onChange={(e) => {
					const file = e.target.files?.[0]
					e.target.value = ''
					if (file) insertImage(file)
				}}
			/>
		</div>
	)
}

/* ------------------------------ תתי-רכיבים ------------------------------ */

function MarkBtn({
	editor,
	mark,
	label,
	title,
	style,
}: {
	editor: TipTapEditor
	mark: string
	label: string
	title: string
	style?: React.CSSProperties
}) {
	return (
		<button
			className={`doc-tool ${editor.isActive(mark) ? 'active' : ''}`}
			title={title}
			style={style}
			onClick={() => editor.chain().focus().toggleMark(mark).run()}
		>
			{label}
		</button>
	)
}

function AlignBtn({
	editor,
	align,
	title,
}: {
	editor: TipTapEditor
	align: 'right' | 'center' | 'left' | 'justify'
	title: string
}) {
	return (
		<button
			className={`doc-tool ${editor.isActive({ textAlign: align }) ? 'active' : ''}`}
			title={title}
			onClick={() => editor.chain().focus().setTextAlign(align).run()}
		>
			<AlignGlyph align={align} />
		</button>
	)
}

/** תחליף מעוצב ל-select — כפתור עם תווית נוכחית ופאנל אפשרויות */
function SelectDropdown({
	id,
	openMenu,
	setOpenMenu,
	title,
	width,
	value,
	options,
	optionStyle,
	onSelect,
}: {
	id: string
	openMenu: string | null
	setOpenMenu: (id: string | null) => void
	title: string
	width: number
	value: string
	options: [string, string][]
	optionStyle?: (value: string) => React.CSSProperties | undefined
	onSelect: (value: string) => void
}) {
	const current = options.find(([v]) => v === value) ?? options[0]
	return (
		<span className="doc-dropdown">
			<button
				className={`doc-select-btn ${openMenu === id ? 'open' : ''}`}
				style={{ width }}
				title={title}
				onClick={() => setOpenMenu(openMenu === id ? null : id)}
			>
				<span className="doc-select-btn-label">{current[1]}</span>
				<small>▾</small>
			</button>
			{openMenu === id && (
				<div className="doc-dropdown-panel doc-select-panel">
					{options.map(([v, label]) => (
						<button
							key={v || '_default'}
							className={`doc-menu-item ${v === value ? 'selected' : ''}`}
							style={optionStyle?.(v)}
							onClick={() => {
								onSelect(v)
								setOpenMenu(null)
							}}
						>
							{label}
						</button>
					))}
				</div>
			)}
		</span>
	)
}

function Dropdown({
	id,
	openMenu,
	setOpenMenu,
	button,
	title,
	children,
}: {
	id: string
	openMenu: string | null
	setOpenMenu: (id: string | null) => void
	button: React.ReactNode
	title: string
	children: React.ReactNode
}) {
	return (
		<span className="doc-dropdown">
			<button
				className={`doc-tool ${openMenu === id ? 'active' : ''}`}
				title={title}
				onClick={() => setOpenMenu(openMenu === id ? null : id)}
			>
				{button} <small>▾</small>
			</button>
			{openMenu === id && <div className="doc-dropdown-panel">{children}</div>}
		</span>
	)
}

/* ------------------------------- אייקונים ------------------------------- */

function svgProps(size = 16) {
	return {
		width: size,
		height: size,
		viewBox: '0 0 24 24',
		fill: 'none',
		stroke: 'currentColor',
		strokeWidth: 2,
		strokeLinecap: 'round' as const,
		strokeLinejoin: 'round' as const,
		'aria-hidden': true,
	}
}

function UndoGlyph() {
	return (
		<svg {...svgProps()}>
			<path d="M15 6H8a5 5 0 000 10h8" />
			<path d="M11 2.5L7.5 6 11 9.5" />
		</svg>
	)
}

function RedoGlyph() {
	return (
		<svg {...svgProps()}>
			<path d="M9 6h7a5 5 0 010 10H8" />
			<path d="M13 2.5L16.5 6 13 9.5" />
		</svg>
	)
}

function AlignGlyph({ align }: { align: string }) {
	const lines =
		align === 'right'
			? ['M4 6h16', 'M9 12h11', 'M6 18h14']
			: align === 'left'
				? ['M4 6h16', 'M4 12h11', 'M4 18h14']
				: align === 'center'
					? ['M4 6h16', 'M7 12h10', 'M5 18h14']
					: ['M4 6h16', 'M4 12h16', 'M4 18h16']
	return (
		<svg {...svgProps()}>
			{lines.map((d) => (
				<path key={d} d={d} />
			))}
		</svg>
	)
}

function BulletGlyph() {
	return (
		<svg {...svgProps()}>
			<circle cx="5" cy="6" r="1.2" fill="currentColor" />
			<circle cx="5" cy="12" r="1.2" fill="currentColor" />
			<circle cx="5" cy="18" r="1.2" fill="currentColor" />
			<path d="M9.5 6h10.5M9.5 12h10.5M9.5 18h10.5" />
		</svg>
	)
}

function NumberGlyph() {
	return (
		<svg {...svgProps()}>
			<path d="M10 6h10M10 12h10M10 18h10" />
			<text x="3" y="8" fontSize="7" fill="currentColor" stroke="none">
				1
			</text>
			<text x="3" y="14.5" fontSize="7" fill="currentColor" stroke="none">
				2
			</text>
			<text x="3" y="21" fontSize="7" fill="currentColor" stroke="none">
				3
			</text>
		</svg>
	)
}

function ChecklistGlyph() {
	return (
		<svg {...svgProps()}>
			<rect x="3" y="4" width="6" height="6" rx="1.5" />
			<path d="M4.7 7l1.4 1.4L8.5 6" strokeWidth="1.6" />
			<rect x="3" y="14" width="6" height="6" rx="1.5" />
			<path d="M12.5 7h8M12.5 17h8" />
		</svg>
	)
}

function TableGlyph() {
	return (
		<svg {...svgProps()}>
			<rect x="3.5" y="4.5" width="17" height="15" rx="2" />
			<path d="M3.5 10h17M9.5 4.5v15M15.5 4.5v15" />
		</svg>
	)
}

function LineHeightGlyph() {
	return (
		<svg {...svgProps()}>
			<path d="M10 6h10M10 12h10M10 18h10" />
			<path d="M5 4v16M3 6.5L5 4l2 2.5M3 17.5L5 20l2-2.5" strokeWidth="1.6" />
		</svg>
	)
}

function EraserGlyph() {
	return (
		<svg {...svgProps()}>
			<path d="M6 20h14" />
			<path d="M9.5 19.5l-5-5a2 2 0 010-2.8l7-7a2 2 0 012.8 0l4.5 4.5a2 2 0 010 2.8l-7.5 7.5z" />
			<path d="M8 9l7 7" />
		</svg>
	)
}

function LinkGlyph() {
	return (
		<svg {...svgProps()}>
			<path d="M9.5 14.5l5-5" />
			<path d="M8 12l-2.2 2.2a3.8 3.8 0 105.4 5.4L13.4 17" />
			<path d="M16 12l2.2-2.2a3.8 3.8 0 10-5.4-5.4L10.6 7" />
		</svg>
	)
}

function ImageGlyph() {
	return (
		<svg {...svgProps()}>
			<rect x="3.5" y="5" width="17" height="14" rx="2.5" />
			<circle cx="9" cy="10" r="1.6" />
			<path d="M4.5 17l4.5-4 3.5 3 2.8-2.4 4.2 3.4" />
		</svg>
	)
}

function GearGlyph() {
	return (
		<svg {...svgProps(15)}>
			<circle cx="12" cy="12" r="3.2" />
			<path d="M12 2.8l1.2 2.6a7 7 0 012.3 1l2.8-.8 1.6 2.8-2 2.1a7 7 0 010 2.6l2 2.1-1.6 2.8-2.8-.8a7 7 0 01-2.3 1L12 21.2l-1.2-2.6a7 7 0 01-2.3-1l-2.8.8-1.6-2.8 2-2.1a7 7 0 010-2.6l-2-2.1 1.6-2.8 2.8.8a7 7 0 012.3-1L12 2.8z" strokeWidth="1.5" />
		</svg>
	)
}

function SignatureGlyph() {
	return (
		<svg {...svgProps()}>
			<path d="M3 19c3-1 4-6 5.5-11 .8-2.6 3-2.6 3.2 0 .2 3-1.7 7.5-.2 8.5 1.3.9 2.5-1.5 3.5-3 .8-1.2 2-1 2 .5s1.5 1.5 3 .5" strokeWidth="1.8" />
			<path d="M3 22h18" strokeWidth="1.6" opacity="0.5" />
		</svg>
	)
}

function WordGlyph() {
	return (
		<svg {...svgProps(15)}>
			<path d="M6 3h9l4 4v14H6a2 2 0 01-2-2V5a2 2 0 012-2z" />
			<path d="M15 3v4h4" />
			<path d="M8 11l1.6 6L11.5 12l1.9 5 1.6-6" strokeWidth="1.7" />
		</svg>
	)
}
