import { Extension } from '@tiptap/react'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { TableMap, cellAround } from '@tiptap/pm/tables'
import type { EditorView } from '@tiptap/pm/view'

/**
 * שינוי גודל עמודות בטבלה עם תמיכה מלאה ב-RTL.
 * מנגנון ה-resize המובנה של prosemirror-tables מחשב את הגרירה לפי כיוון
 * שמאל-לימין ולכן פועל הפוך בעברית — כאן מנגנון עצמאי:
 * ריחוף ליד הקצה השמאלי של תא (סוף העמודה ב-RTL) מציג סמן גרירה,
 * וגרירה שמאלה מרחיבה / ימינה מקצרת, כמצופה.
 */

const EDGE_THRESHOLD = 6
const MIN_COL_WIDTH = 42

interface DragState {
	col: number
	startX: number
	startWidth: number
	tableStart: number
	colEl: HTMLTableColElement | null
}

function findResizableColumn(view: EditorView, event: MouseEvent) {
	const target = (event.target as HTMLElement).closest('td, th')
	if (!target || !view.dom.contains(target)) return null
	const rect = target.getBoundingClientRect()
	// ב-RTL הגבול בין עמודה לעמודה הבאה נמצא בקצה השמאלי של התא
	if (Math.abs(event.clientX - rect.left) > EDGE_THRESHOLD) return null
	const posInside = view.posAtDOM(target, 0)
	if (posInside < 0) return null
	const $cell = cellAround(view.state.doc.resolve(posInside))
	if (!$cell) return null
	const table = $cell.node(-1)
	const tableStart = $cell.start(-1)
	const map = TableMap.get(table)
	const cellNode = $cell.nodeAfter
	if (!cellNode) return null
	const col = map.colCount($cell.pos - tableStart) + cellNode.attrs.colspan - 1
	const colgroup = (target.closest('table') as HTMLTableElement | null)?.querySelector('colgroup')
	const colEl = (colgroup?.children[col] as HTMLTableColElement | undefined) ?? null
	return {
		col,
		tableStart,
		startWidth: colEl?.offsetWidth || rect.width,
		colEl,
	}
}

function commitColumnWidth(view: EditorView, tableStart: number, col: number, width: number) {
	const $table = view.state.doc.resolve(tableStart)
	const table = $table.node()
	if (!table || table.type.name !== 'table') return
	const map = TableMap.get(table)
	const tr = view.state.tr
	for (let row = 0; row < map.height; row++) {
		const mapIndex = row * map.width + col
		// דילוג על המשכי rowspan
		if (row > 0 && map.map[mapIndex] === map.map[mapIndex - map.width]) continue
		const cellPos = map.map[mapIndex]
		const cell = table.nodeAt(cellPos)
		if (!cell) continue
		const attrs = cell.attrs as { colspan: number; colwidth: number[] | null }
		const index = col - map.colCount(cellPos)
		const colwidth = attrs.colwidth
			? attrs.colwidth.slice()
			: (new Array(attrs.colspan).fill(0) as number[])
		colwidth[index] = width
		tr.setNodeMarkup(tableStart + cellPos, null, { ...attrs, colwidth })
	}
	if (tr.docChanged) view.dispatch(tr)
}

export const RtlTableColumnResize = Extension.create({
	name: 'rtlTableColumnResize',

	addProseMirrorPlugins() {
		let drag: DragState | null = null

		return [
			new Plugin({
				key: new PluginKey('rtlTableColumnResize'),
				props: {
					handleDOMEvents: {
						mousemove(view, event) {
							if (drag || !view.editable) return false
							const found = findResizableColumn(view, event)
							view.dom.classList.toggle('ic-col-resize', Boolean(found))
							return false
						},
						mousedown(view, event) {
							if (!view.editable) return false
							const found = findResizableColumn(view, event)
							if (!found) return false
							event.preventDefault()
							drag = {
								col: found.col,
								startX: event.clientX,
								startWidth: found.startWidth,
								tableStart: found.tableStart,
								colEl: found.colEl,
							}
							const onMove = (ev: MouseEvent) => {
								if (!drag) return
								// RTL: גרירה שמאלה (clientX קטן) מרחיבה את העמודה
								const width = Math.max(
									MIN_COL_WIDTH,
									Math.round(drag.startWidth + (drag.startX - ev.clientX))
								)
								if (drag.colEl) drag.colEl.style.width = `${width}px`
							}
							const onUp = (ev: MouseEvent) => {
								window.removeEventListener('mousemove', onMove)
								window.removeEventListener('mouseup', onUp)
								if (!drag) return
								const width = Math.max(
									MIN_COL_WIDTH,
									Math.round(drag.startWidth + (drag.startX - ev.clientX))
								)
								commitColumnWidth(view, drag.tableStart, drag.col, width)
								drag = null
								view.dom.classList.remove('ic-col-resize')
							}
							window.addEventListener('mousemove', onMove)
							window.addEventListener('mouseup', onUp)
							return true
						},
					},
				},
			}),
		]
	},
})
