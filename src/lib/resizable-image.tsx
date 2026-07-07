import Image from '@tiptap/extension-image'
import {
	NodeViewWrapper,
	ReactNodeViewRenderer,
	type NodeViewProps,
} from '@tiptap/react'
import { useRef, useState } from 'react'

/**
 * תמונה חכמה במסמך:
 * - שינוי גודל בגרירת פינה
 * - מצבי פריסה: בתוך השורה, עיטוף טקסט (ימין/שמאל), ממורכזת, או "חופשי" —
 *   מיקום חופשי בכל נקודה בדף בגרירה, בלי להזיז את הטקסט
 * - במצבים הזורמים אפשר גם לגרור את התמונה למקום אחר בטקסט
 */

export type ImageDisplayMode = 'inline' | 'float-right' | 'float-left' | 'block' | 'free'

export const ResizableImage = Image.extend({
	name: 'image',

	addAttributes() {
		return {
			...this.parent?.(),
			width: { default: null },
			display: { default: 'inline' },
			posX: { default: null },
			posY: { default: null },
		}
	},

	addNodeView() {
		return ReactNodeViewRenderer(ImageView)
	},
}).configure({ allowBase64: true, inline: true })

function ImageView({ node, updateAttributes, selected, deleteNode, editor, getPos }: NodeViewProps) {
	const { src, width, display, posX, posY } = node.attrs as {
		src: string
		width: number | null
		display: ImageDisplayMode
		posX: number | null
		posY: number | null
	}
	const imgRef = useRef<HTMLImageElement>(null)
	const [liveWidth, setLiveWidth] = useState<number | null>(null)
	const [livePos, setLivePos] = useState<{ x: number; y: number } | null>(null)
	const editable = editor.isEditable

	// שמירת הבחירה על התמונה אחרי עדכון מאפיינים, כדי שהידיות והסרגל יישארו
	const reselect = () => {
		const pos = getPos()
		if (typeof pos === 'number') {
			requestAnimationFrame(() => editor.commands.setNodeSelection(pos))
		}
	}

	const startResize = (e: React.PointerEvent, dir: 1 | -1) => {
		e.preventDefault()
		e.stopPropagation()
		const startX = e.clientX
		const startW = imgRef.current?.offsetWidth ?? 200
		let finalW = startW
		const onMove = (ev: PointerEvent) => {
			finalW = Math.round(Math.min(640, Math.max(36, startW + dir * (ev.clientX - startX))))
			setLiveWidth(finalW)
		}
		const onUp = () => {
			window.removeEventListener('pointermove', onMove)
			window.removeEventListener('pointerup', onUp)
			setLiveWidth(null)
			updateAttributes({ width: finalW })
			reselect()
		}
		window.addEventListener('pointermove', onMove)
		window.addEventListener('pointerup', onUp)
	}

	const startFreeDrag = (e: React.PointerEvent) => {
		if (display !== 'free' || !editable) return
		e.preventDefault()
		e.stopPropagation()
		const sheet = (e.target as HTMLElement).closest('.ProseMirror') as HTMLElement | null
		if (!sheet) return
		const rect = sheet.getBoundingClientRect()
		const startLeft = posX ?? 40
		const startTop = posY ?? 40
		const grabX = e.clientX
		const grabY = e.clientY
		let final = { x: startLeft, y: startTop }
		const onMove = (ev: PointerEvent) => {
			final = {
				x: Math.round(Math.min(rect.width - 40, Math.max(0, startLeft + (ev.clientX - grabX)))),
				y: Math.round(Math.max(0, startTop + (ev.clientY - grabY))),
			}
			setLivePos(final)
		}
		const onUp = () => {
			window.removeEventListener('pointermove', onMove)
			window.removeEventListener('pointerup', onUp)
			setLivePos(null)
			updateAttributes({ posX: final.x, posY: final.y })
			reselect()
		}
		window.addEventListener('pointermove', onMove)
		window.addEventListener('pointerup', onUp)
	}

	const setMode = (mode: ImageDisplayMode) => {
		if (mode === 'free' && (posX == null || posY == null)) {
			// נקודת פתיחה: המיקום הנוכחי של התמונה בדף
			const sheet = imgRef.current?.closest('.ProseMirror') as HTMLElement | null
			const imgRect = imgRef.current?.getBoundingClientRect()
			const sheetRect = sheet?.getBoundingClientRect()
			updateAttributes({
				display: mode,
				posX: imgRect && sheetRect ? Math.round(imgRect.left - sheetRect.left) : 60,
				posY: imgRect && sheetRect ? Math.round(imgRect.top - sheetRect.top) : 60,
			})
		} else {
			updateAttributes({ display: mode })
		}
		reselect()
	}

	const displayedWidth = liveWidth ?? width ?? undefined
	const pos = livePos ?? { x: posX ?? 40, y: posY ?? 40 }
	const isFree = display === 'free'
	const dragging = livePos !== null

	return (
		<NodeViewWrapper
			as="span"
			className={`doc-img doc-img-${display} ${selected ? 'doc-img-selected' : ''} ${dragging ? 'doc-img-dragging' : ''}`}
			style={isFree ? { left: pos.x, top: pos.y } : undefined}
			draggable={!isFree && editable}
			data-drag-handle={!isFree && editable ? '' : undefined}
		>
			<img
				ref={imgRef}
				src={src}
				alt=""
				style={{ width: displayedWidth }}
				onPointerDown={isFree ? startFreeDrag : undefined}
				draggable={false}
			/>
			{selected && editable && (
				<>
					<span className="doc-img-handle doc-img-handle-l" onPointerDown={(e) => startResize(e, -1)} />
					<span className="doc-img-handle doc-img-handle-r" onPointerDown={(e) => startResize(e, 1)} />
					<span className="doc-img-toolbar" dir="rtl" contentEditable={false}>
						<ImgModeBtn active={display === 'inline'} title="בתוך השורה" onClick={() => setMode('inline')}>
							<InlineGlyph />
						</ImgModeBtn>
						<ImgModeBtn active={display === 'float-right'} title="עיטוף טקסט — ימין" onClick={() => setMode('float-right')}>
							<FloatGlyph side="right" />
						</ImgModeBtn>
						<ImgModeBtn active={display === 'float-left'} title="עיטוף טקסט — שמאל" onClick={() => setMode('float-left')}>
							<FloatGlyph side="left" />
						</ImgModeBtn>
						<ImgModeBtn active={display === 'block'} title="שורה נפרדת, ממורכז" onClick={() => setMode('block')}>
							<BlockGlyph />
						</ImgModeBtn>
						<ImgModeBtn active={isFree} title="מיקום חופשי — גררו לכל מקום בדף" onClick={() => setMode('free')}>
							<FreeGlyph />
						</ImgModeBtn>
						<span className="doc-img-toolbar-sep" />
						<ImgModeBtn active={false} title="מחיקת התמונה" onClick={() => deleteNode()}>
							<TrashGlyph />
						</ImgModeBtn>
					</span>
				</>
			)}
		</NodeViewWrapper>
	)
}

function ImgModeBtn({
	active,
	title,
	onClick,
	children,
}: {
	active: boolean
	title: string
	onClick: () => void
	children: React.ReactNode
}) {
	return (
		<button
			type="button"
			className={`doc-img-btn ${active ? 'active' : ''}`}
			title={title}
			onPointerDown={(e) => {
				e.preventDefault()
				e.stopPropagation()
			}}
			onClick={onClick}
		>
			{children}
		</button>
	)
}

/* ------------------------------- אייקונים ------------------------------- */

function glyphProps() {
	return {
		width: 15,
		height: 15,
		viewBox: '0 0 24 24',
		fill: 'none',
		stroke: 'currentColor',
		strokeWidth: 1.9,
		strokeLinecap: 'round' as const,
		strokeLinejoin: 'round' as const,
		'aria-hidden': true,
	}
}

function InlineGlyph() {
	return (
		<svg {...glyphProps()}>
			<path d="M3 6h18M3 12h5M16 12h5M3 18h18" />
			<rect x="10" y="9.5" width="4" height="5" rx="1" />
		</svg>
	)
}

function FloatGlyph({ side }: { side: 'right' | 'left' }) {
	const rectX = side === 'right' ? 15 : 3
	const lines =
		side === 'right'
			? ['M3 6h9', 'M3 12h9', 'M3 18h18']
			: ['M12 6h9', 'M12 12h9', 'M3 18h18']
	return (
		<svg {...glyphProps()}>
			<rect x={rectX} y="4" width="6" height="10" rx="1" />
			{lines.map((d) => (
				<path key={d} d={d} />
			))}
		</svg>
	)
}

function BlockGlyph() {
	return (
		<svg {...glyphProps()}>
			<path d="M3 4h18M3 20h18" />
			<rect x="7" y="8" width="10" height="8" rx="1" />
		</svg>
	)
}

function FreeGlyph() {
	return (
		<svg {...glyphProps()}>
			<path d="M12 3v18M3 12h18" />
			<path d="M12 3l-2.4 2.4M12 3l2.4 2.4M12 21l-2.4-2.4M12 21l2.4-2.4M3 12l2.4-2.4M3 12l2.4 2.4M21 12l-2.4-2.4M21 12l-2.4 2.4" />
		</svg>
	)
}

function TrashGlyph() {
	return (
		<svg {...glyphProps()}>
			<path d="M4 6.5h16M9.5 4h5M7 6.5l.8 12a2 2 0 002 1.9h4.4a2 2 0 002-1.9l.8-12" />
		</svg>
	)
}
