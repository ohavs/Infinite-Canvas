import { jsPDF } from 'jspdf'
import { Box, Editor } from 'tldraw'

/** מידות דף A4 ביחידות קנבס (96dpi): 210×297 מ"מ */
export const A4_PX = { w: 794, h: 1123 }
const PX_TO_MM = 25.4 / 96

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(reader.result as string)
		reader.onerror = () => reject(reader.error)
		reader.readAsDataURL(blob)
	})
}

/** מאתר את מסגרת ה-A4 של העמוד הנוכחי (אם קיימת) */
export function findA4Frame(editor: Editor) {
	return editor
		.getCurrentPageShapes()
		.find((s) => s.type === 'frame' && (s.meta as { a4?: boolean } | undefined)?.a4)
}

/**
 * ייצוא העמוד הנוכחי ל-PDF.
 * במצב דף A4 — מייצא בדיוק את שטח הדף לקובץ A4 סטנדרטי;
 * במצב קנבס אינסופי — הקובץ נחתך לגבולות התוכן.
 * מחזיר false אם אין מה לייצא.
 */
export async function exportCurrentPageToPdf(
	editor: Editor,
	opts: { fileName: string; mode: 'infinite' | 'a4' }
): Promise<boolean> {
	const shapeIds = [...editor.getCurrentPageShapeIds()]
	if (shapeIds.length === 0) return false

	if (opts.mode === 'a4') {
		const frame = findA4Frame(editor)
		const bounds = frame
			? new Box(frame.x, frame.y, A4_PX.w, A4_PX.h)
			: new Box(0, 0, A4_PX.w, A4_PX.h)
		// JPEG — קטן משמעותית מ-PNG בתוך PDF, והרקע ממילא אטום
		const { blob } = await editor.toImage(shapeIds, {
			format: 'jpeg',
			quality: 0.85,
			background: true,
			bounds,
			padding: 0,
			scale: 2,
		})
		const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
		pdf.addImage(await blobToDataUrl(blob), 'JPEG', 0, 0, 210, 297)
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
