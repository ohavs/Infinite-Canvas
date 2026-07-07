import CharacterCount from '@tiptap/extension-character-count'
import { Color } from '@tiptap/extension-color'
import FontFamily from '@tiptap/extension-font-family'
import Highlight from '@tiptap/extension-highlight'
import Image from '@tiptap/extension-image'
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
import { IconBack, IconPdf } from '../components/icons'
import { exportDocToDocx } from '../lib/docx-export'
import {
	getProject,
	loadDocContent,
	renameProject,
	saveDocContent,
	setProjectExcerpt,
	touchProject,
} from '../lib/projects'
import { FontSize, LineHeight, ParagraphDirection } from '../lib/tiptap-extensions'
import './doc-editor.css'

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
	const saveTimeout = useRef<ReturnType<typeof setTimeout>>(undefined)

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
			Table.configure({ resizable: true }),
			TableRow,
			TableCell,
			TableHeader,
			Image.configure({ allowBase64: true }),
		],
		content: (loadDocContent(projectId) as object | null) ?? undefined,
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
		await exportDocToDocx(editor.getJSON(), project?.name || 'document')
	}, [editor, project?.name])

	if (!project) return null

	const words = editor?.storage.characterCount.words() ?? 0

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
					<button className="doc-btn doc-btn-ghost" onClick={() => window.print()}>
						<IconPdf size={15} /> PDF / הדפסה
					</button>
					<button className="doc-btn doc-btn-ink" onClick={() => void handleExportDocx()}>
						<WordGlyph /> ייצוא ל-Word
					</button>
				</div>
			</header>

			{editor && <Toolbar editor={editor} />}

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
							onClick={() => toggleLink(editor)}
						>
							🔗
						</button>
					</div>
				</BubbleMenu>
			)}

			<main className="doc-scroll">
				<div className="doc-sheet-wrap">
					<EditorContent editor={editor} className="doc-sheet" />
				</div>
			</main>
		</div>
	)
}

/* ------------------------------ סרגל כלים ------------------------------ */

function toggleLink(editor: TipTapEditor) {
	if (editor.isActive('link')) {
		editor.chain().focus().unsetLink().run()
		return
	}
	const url = window.prompt('כתובת הקישור:')
	if (!url) return
	const href = /^https?:\/\//i.test(url) ? url : `https://${url}`
	editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
}

function Toolbar({ editor }: { editor: TipTapEditor }) {
	const [openMenu, setOpenMenu] = useState<string | null>(null)
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

			{/* סגנון פסקה, גופן וגודל */}
			<select className="doc-select" value={blockValue} onChange={(e) => setBlock(e.target.value)} title="סגנון פסקה">
				<option value="p">טקסט רגיל</option>
				<option value="h1">כותרת 1</option>
				<option value="h2">כותרת 2</option>
				<option value="h3">כותרת 3</option>
			</select>

			<select
				className="doc-select"
				value={(editor.getAttributes('textStyle').fontFamily as string) ?? ''}
				onChange={(e) => {
					const v = e.target.value
					if (v) editor.chain().focus().setFontFamily(v).run()
					else editor.chain().focus().unsetFontFamily().run()
				}}
				title="גופן"
			>
				{FONT_FAMILIES.map(([value, label]) => (
					<option key={label} value={value}>
						{label}
					</option>
				))}
			</select>

			<select
				className="doc-select doc-select-narrow"
				value={(editor.getAttributes('textStyle').fontSize as string) ?? '16px'}
				onChange={(e) => editor.chain().focus().setFontSize(e.target.value).run()}
				title="גודל גופן"
			>
				{FONT_SIZES.map((size) => (
					<option key={size} value={size}>
						{parseInt(size)}
					</option>
				))}
			</select>

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
			<button className={`doc-tool ${editor.isActive('link') ? 'active' : ''}`} title="קישור" onClick={() => toggleLink(editor)}>
				🔗
			</button>
			<button className="doc-tool" title="הוספת תמונה" onClick={() => imageInputRef.current?.click()}>
				🖼
			</button>
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

function WordGlyph() {
	return (
		<svg {...svgProps(15)}>
			<path d="M6 3h9l4 4v14H6a2 2 0 01-2-2V5a2 2 0 012-2z" />
			<path d="M15 3v4h4" />
			<path d="M8 11l1.6 6L11.5 12l1.9 5 1.6-6" strokeWidth="1.7" />
		</svg>
	)
}
