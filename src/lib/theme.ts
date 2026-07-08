/** ערכת נושא (בהיר/כהה) ופלטת צבעים — עם זכירת בחירת המשתמש */

export type ThemeMode = 'light' | 'dark'
export type PaletteId = 'tangerine' | 'ocean' | 'forest' | 'grape' | 'rose'

const THEME_KEY = 'infinite-canvas:theme'
const PALETTE_KEY = 'infinite-canvas:palette'

export const PALETTES: { id: PaletteId; label: string; swatch: string }[] = [
	{ id: 'tangerine', label: 'קלמנטינה', swatch: '#e8722a' },
	{ id: 'ocean', label: 'אוקיינוס', swatch: '#2f6fed' },
	{ id: 'forest', label: 'יער', swatch: '#199155' },
	{ id: 'grape', label: 'ענבים', swatch: '#8b46e0' },
	{ id: 'rose', label: 'ורד', swatch: '#e0447c' },
]

export function getTheme(): ThemeMode {
	const stored = localStorage.getItem(THEME_KEY)
	if (stored === 'light' || stored === 'dark') return stored
	return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function getPalette(): PaletteId {
	const stored = localStorage.getItem(PALETTE_KEY) as PaletteId | null
	return PALETTES.some((p) => p.id === stored) ? (stored as PaletteId) : 'tangerine'
}

function apply() {
	const root = document.documentElement
	root.dataset.theme = getTheme()
	root.dataset.palette = getPalette()
}

export function setTheme(mode: ThemeMode) {
	localStorage.setItem(THEME_KEY, mode)
	apply()
	window.dispatchEvent(new Event('ic-theme-changed'))
}

export function setPalette(palette: PaletteId) {
	localStorage.setItem(PALETTE_KEY, palette)
	apply()
	window.dispatchEvent(new Event('ic-theme-changed'))
}

/** מופעל פעם אחת לפני הרינדור הראשון */
export function initTheme() {
	apply()
}
