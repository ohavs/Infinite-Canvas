/** ניהול חתימות שמורות — נשמרות כ-PNG שקוף ב-localStorage לשימוש חוזר */

const SIGNATURES_KEY = 'infinite-canvas:signatures'
export const MAX_SIGNATURES = 4

export function listSignatures(): string[] {
	try {
		const raw = localStorage.getItem(SIGNATURES_KEY)
		const parsed = raw ? JSON.parse(raw) : []
		return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string') : []
	} catch {
		return []
	}
}

export function saveSignature(dataUrl: string): string[] {
	const next = [dataUrl, ...listSignatures()].slice(0, MAX_SIGNATURES)
	localStorage.setItem(SIGNATURES_KEY, JSON.stringify(next))
	return next
}

export function deleteSignature(index: number): string[] {
	const next = listSignatures().filter((_, i) => i !== index)
	localStorage.setItem(SIGNATURES_KEY, JSON.stringify(next))
	return next
}

/** חיתוך שוליים שקופים מסביב לחתימה המצוירת */
export function trimCanvas(canvas: HTMLCanvasElement): string {
	const ctx = canvas.getContext('2d')
	if (!ctx) return canvas.toDataURL('image/png')
	const { width, height } = canvas
	const data = ctx.getImageData(0, 0, width, height).data
	let minX = width
	let minY = height
	let maxX = -1
	let maxY = -1
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (data[(y * width + x) * 4 + 3] > 8) {
				if (x < minX) minX = x
				if (x > maxX) maxX = x
				if (y < minY) minY = y
				if (y > maxY) maxY = y
			}
		}
	}
	if (maxX < 0) return canvas.toDataURL('image/png')
	const pad = 6
	minX = Math.max(0, minX - pad)
	minY = Math.max(0, minY - pad)
	maxX = Math.min(width - 1, maxX + pad)
	maxY = Math.min(height - 1, maxY + pad)
	const out = document.createElement('canvas')
	out.width = maxX - minX + 1
	out.height = maxY - minY + 1
	out.getContext('2d')?.drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height)
	return out.toDataURL('image/png')
}
