import { useEffect, useState } from 'react'
import {
	PALETTES,
	getPalette,
	getTheme,
	setPalette,
	setTheme,
	type PaletteId,
	type ThemeMode,
} from '../lib/theme'
import './theme-controls.css'

/** כפתורי מצב כהה/בהיר + בחירת פלטת צבעים — מוצגים בכל מסך */
export function ThemeControls() {
	const [theme, setThemeState] = useState<ThemeMode>(() => getTheme())
	const [palette, setPaletteState] = useState<PaletteId>(() => getPalette())
	const [pickerOpen, setPickerOpen] = useState(false)

	useEffect(() => {
		const sync = () => {
			setThemeState(getTheme())
			setPaletteState(getPalette())
		}
		window.addEventListener('ic-theme-changed', sync)
		return () => window.removeEventListener('ic-theme-changed', sync)
	}, [])

	useEffect(() => {
		if (!pickerOpen) return
		const close = () => setPickerOpen(false)
		window.addEventListener('pointerdown', close)
		return () => window.removeEventListener('pointerdown', close)
	}, [pickerOpen])

	return (
		<div className="theme-controls" onPointerDown={(e) => e.stopPropagation()}>
			<button
				className="theme-btn"
				title={theme === 'dark' ? 'מעבר למצב בהיר' : 'מעבר למצב כהה'}
				onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
			>
				{theme === 'dark' ? <SunGlyph /> : <MoonGlyph />}
			</button>
			<span className="theme-picker-wrap">
				<button
					className="theme-btn"
					title="פלטת צבעים"
					onClick={() => setPickerOpen(!pickerOpen)}
				>
					<span className="theme-swatch" />
				</button>
				{pickerOpen && (
					<div className="theme-picker" dir="rtl">
						{PALETTES.map((p) => (
							<button
								key={p.id}
								className={`theme-palette-option ${palette === p.id ? 'active' : ''}`}
								onClick={() => {
									setPalette(p.id)
									setPickerOpen(false)
								}}
							>
								<span className="theme-palette-dot" style={{ background: p.swatch }} />
								{p.label}
							</button>
						))}
					</div>
				)}
			</span>
		</div>
	)
}

function glyphProps() {
	return {
		width: 16,
		height: 16,
		viewBox: '0 0 24 24',
		fill: 'none',
		stroke: 'currentColor',
		strokeWidth: 2,
		strokeLinecap: 'round' as const,
		strokeLinejoin: 'round' as const,
		'aria-hidden': true,
	}
}

function SunGlyph() {
	return (
		<svg {...glyphProps()}>
			<circle cx="12" cy="12" r="4.2" />
			<path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5 5l1.7 1.7M17.3 17.3L19 19M19 5l-1.7 1.7M6.7 17.3L5 19" />
		</svg>
	)
}

function MoonGlyph() {
	return (
		<svg {...glyphProps()}>
			<path d="M20 14.5A8.5 8.5 0 019.5 4 8.5 8.5 0 1020 14.5z" />
		</svg>
	)
}
