import { jsPDF } from 'jspdf'
import { Box, Editor, type TLShape } from 'tldraw'

/** מידות דף A4 ביחידות קנבס (96dpi): 210×297 מ"מ */
export const A4_PX = { w: 794, h: 1123 }
/** רווח אנכי בין דפי A4 על הקנבס */
export const A4_GAP = 56
const PX_TO_MM = 25.4 / 96

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(reader.result as string)
		reader.onerror = () => reject(reader.error)
		reader.readAsDataURL(blob)
	})
}

/** כל מסגרות ה-A4 בעמוד הנוכחי, ממוינות מלמעלה למטה */
export function findA4Frames(editor: Editor): TLShape[] {
	return editor
		.getCurrentPageShapes()
		.filter((s) => s.type === 'frame' && (s.meta as { a4?: boolean } | undefined)?.a4)
		.sort((a, b) => a.y - b.y)
}

/**
 * ייצוא העמוד הנוכחי ל-PDF.
 * במצב דפי A4 — כל דף על הקנבס הופך לעמוד A4 בקובץ;
 * במצב קנבס אינסופי — הקובץ נחתך לגבולות התוכן.
 * מחזיר false אם אין מה לייצא.
 */
export async function exportCurrentPageToPdf(
	editor: Editor,
	opts: { fileName: string; mode: 'infinite' | 'a4' | 'doc' }
): Promise<boolean> {
	const shapeIds = [...editor.getCurrentPageShapeIds()]
	if (shapeIds.length === 0) return false

	if (opts.mode === 'a4') {
		const frames = findA4Frames(editor)
		const pageBoxes = frames.length
			? frames.map((f) => new Box(f.x, f.y, A4_PX.w, A4_PX.h))
			: [new Box(0, 0, A4_PX.w, A4_PX.h)]

		const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
		for (let i = 0; i < pageBoxes.length; i++) {
			// JPEG — קטן משמעותית מ-PNG בתוך PDF, והרקע ממילא אטום
			const { blob } = await editor.toImage(shapeIds, {
				format: 'jpeg',
				quality: 0.85,
				background: true,
				bounds: pageBoxes[i],
				padding: 0,
				scale: 2,
			})
			if (i > 0) pdf.addPage('a4', 'portrait')
			pdf.addImage(await blobToDataUrl(blob), 'JPEG', 0, 0, 210, 297)
		}
		pdf.save(`${opts.fileName}.pdf`)
		return true
	}

	const bounds = editor.getCurrentPageBounds()
	if (!bounds) return false
	const padding = 32
	// הגבלת רזולוציה כדי לא לחרוג ממגבלות canvas בדפדפן
	const scale = Math.min(2, 6000 / (bounds.w + padding * 2), 6000 / (bounds.h + padding * 2))
	const { blob } = await editor.toImage(shapeIds, {
		format: 'jpeg',
		quality: 0.85,
		background: true,
		padding,
		scale,
	})
	const wMm = (bounds.w + padding * 2) * PX_TO_MM
	const hMm = (bounds.h + padding * 2) * PX_TO_MM
	const pdf = new jsPDF({
		orientation: wMm > hMm ? 'landscape' : 'portrait',
		unit: 'mm',
		format: [wMm, hMm],
	})
	pdf.addImage(await blobToDataUrl(blob), 'JPEG', 0, 0, wMm, hMm)
	pdf.save(`${opts.fileName}.pdf`)
	return true
}
