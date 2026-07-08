import type { Editor as TipTapEditor } from '@tiptap/react'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * כפתורי "+" צפים בריחוף מעל טבלה — כמו בוורד:
 * ליד כל שורה (בצד ימין, ההתחלה ב-RTL) כפתור שמוסיף שורה מתחתיה,
 * ומעל כל עמודה (בקצה השמאלי שלה) כפתור שמוסיף עמודה אחריה.
 */

interface HoverState {
	row: { x: number; y: number }
	col: { x: number; y: number }
	cellEl: HTMLElement
}

export function TableHoverControls({
	editor,
	scrollRef,
}: {
	editor: TipTapEditor
	scrollRef: React.RefObject<HTMLElement | null>
}) {
	const [hover, setHover] = useState<HoverState | null>(null)
	const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

	const scheduleHide = useCallback(() => {
		clearTimeout(hideTimer.current)
		hideTimer.current = setTimeout(() => setHover(null), 350)
	}, [])

	useEffect(() => {
		const container = scrollRef.current
		if (!container) return

		const onMove = (event: MouseEvent) => {
			const target = event.target as HTMLElement
			// ריחוף על הכפתורים עצמם — לא מסתירים
			if (target.closest('.doc-table-plus')) {
				clearTimeout(hideTimer.current)
				return
			}
			const cell = target.closest('td, th') as HTMLElement | null
			if (!cell || !container.contains(cell)) {
				scheduleHide()
				return
			}
			clearTimeout(hideTimer.current)
			const table = cell.closest('table')
			if (!table) return
			const containerRect = container.getBoundingClientRect()
			const cellRect = cell.getBoundingClientRect()
			const tableRect = table.getBoundingClientRect()
			const toLocal = (clientX: number, clientY: number) => ({
				x: clientX - containerRect.left + container.scrollLeft,
				y: clientY - containerRect.top + container.scrollTop,
			})
			setHover({
				// כפתור שורה: מימין לטבלה, בגובה הקצה התחתון של השורה
				row: toLocal(tableRect.right + 13, cellRect.bottom),
				// כפתור עמודה: מעל הטבלה, בקצה השמאלי של העמודה (הוספה "אחרי" ב-RTL)
				col: toLocal(cellRect.left, tableRect.top - 13),
				cellEl: cell,
			})
		}

		const onLeave = () => scheduleHide()
		container.addEventListener('mousemove', onMove)
		container.addEventListener('mouseleave', onLeave)
		return () => {
			container.removeEventListener('mousemove', onMove)
			container.removeEventListener('mouseleave', onLeave)
			clearTimeout(hideTimer.current)
		}
	}, [editor, scrollRef, scheduleHide])

	// הסתרה בכל שינוי מסמך (מספרי שורות/מיקומים משתנים)
	useEffect(() => {
		const hide = () => setHover(null)
		editor.on('update', hide)
		return () => {
			editor.off('update', hide)
		}
	}, [editor])

	if (!hover) return null

	const runInCell = (command: 'addRowAfter' | 'addColumnAfter') => {
		const pos = editor.view.posAtDOM(hover.cellEl, 0)
		if (pos < 0) return
		const chain = editor.chain().focus().setTextSelection(pos + 1)
		if (command === 'addRowAfter') chain.addRowAfter().run()
		else chain.addColumnAfter().run()
		setHover(null)
	}

	return (
		<>
			<button
				className="doc-table-plus"
				style={{ left: hover.row.x, top: hover.row.y }}
				title="הוספת שורה מתחת"
				onMouseDown={(e) => e.preventDefault()}
				onClick={() => runInCell('addRowAfter')}
			>
				＋
			</button>
			<button
				className="doc-table-plus"
				style={{ left: hover.col.x, top: hover.col.y }}
				title="הוספת עמודה"
				onMouseDown={(e) => e.preventDefault()}
				onClick={() => runInCell('addColumnAfter')}
			>
				＋
			</button>
		</>
	)
}
