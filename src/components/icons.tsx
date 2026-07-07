/** סט אייקוני קו אחיד לאפליקציה (SVG inline, ללא תלות חיצונית) */

interface IconProps {
	size?: number
	strokeWidth?: number
}

function base(size: number) {
	return {
		width: size,
		height: size,
		viewBox: '0 0 24 24',
		fill: 'none',
		stroke: 'currentColor',
		strokeLinecap: 'round' as const,
		strokeLinejoin: 'round' as const,
		'aria-hidden': true,
	}
}

export function IconPlus({ size = 18, strokeWidth = 2.2 }: IconProps) {
	return (
		<svg {...base(size)} strokeWidth={strokeWidth}>
			<path d="M12 5v14M5 12h14" />
		</svg>
	)
}

export function IconImport({ size = 18, strokeWidth = 2 }: IconProps) {
	return (
		<svg {...base(size)} strokeWidth={strokeWidth}>
			<path d="M12 3v10m0 0l-4-4m4 4l4-4" />
			<path d="M4 15v3a3 3 0 003 3h10a3 3 0 003-3v-3" />
		</svg>
	)
}

export function IconClock({ size = 16, strokeWidth = 2 }: IconProps) {
	return (
		<svg {...base(size)} strokeWidth={strokeWidth}>
			<circle cx="12" cy="12" r="8.5" />
			<path d="M12 7.5V12l3 2" />
		</svg>
	)
}

export function IconDots({ size = 18, strokeWidth = 2 }: IconProps) {
	return (
		<svg {...base(size)} strokeWidth={strokeWidth}>
			<circle cx="12" cy="5.2" r="0.9" fill="currentColor" />
			<circle cx="12" cy="12" r="0.9" fill="currentColor" />
			<circle cx="12" cy="18.8" r="0.9" fill="currentColor" />
		</svg>
	)
}

export function IconPencil({ size = 16, strokeWidth = 2 }: IconProps) {
	return (
		<svg {...base(size)} strokeWidth={strokeWidth}>
			<path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 013 3L8 19l-4 1z" />
			<path d="M14.5 6.5l3 3" />
		</svg>
	)
}

export function IconCopy({ size = 16, strokeWidth = 2 }: IconProps) {
	return (
		<svg {...base(size)} strokeWidth={strokeWidth}>
			<rect x="9" y="9" width="11" height="11" rx="2.5" />
			<path d="M5 15H4.5A1.5 1.5 0 013 13.5v-9A1.5 1.5 0 014.5 3h9A1.5 1.5 0 0115 4.5V5" />
		</svg>
	)
}

export function IconTrash({ size = 16, strokeWidth = 2 }: IconProps) {
	return (
		<svg {...base(size)} strokeWidth={strokeWidth}>
			<path d="M4 6.5h16M9.5 4h5M7 6.5l.8 12A2 2 0 009.8 20.5h4.4a2 2 0 002-1.9l.8-12.1" />
			<path d="M10 10.5v6M14 10.5v6" />
		</svg>
	)
}

export function IconInfinity({ size = 22, strokeWidth = 2 }: IconProps) {
	return (
		<svg {...base(size)} strokeWidth={strokeWidth}>
			<path d="M8.5 15.5c-2 2-5.5.7-5.5-2.5s3.5-4.5 5.5-2.5l7 5c2 2 5.5.7 5.5-2.5s-3.5-4.5-5.5-2.5l-7 5z" />
		</svg>
	)
}

export function IconPage({ size = 22, strokeWidth = 2 }: IconProps) {
	return (
		<svg {...base(size)} strokeWidth={strokeWidth}>
			<rect x="5.5" y="3" width="13" height="18" rx="2" />
			<path d="M9 8h6M9 12h6M9 16h3.5" />
		</svg>
	)
}

export function IconPdf({ size = 16, strokeWidth = 2 }: IconProps) {
	return (
		<svg {...base(size)} strokeWidth={strokeWidth}>
			<path d="M6 3h8l4 4v12a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2z" />
			<path d="M14 3v4h4" />
			<path d="M8.5 16.5v-4h1.2a1.4 1.4 0 010 2.8H8.5M15.5 12.5H13v4m0-2h2" />
		</svg>
	)
}

export function IconBack({ size = 18, strokeWidth = 2.2 }: IconProps) {
	// חץ "חזרה" בכיוון RTL (מצביע ימינה)
	return (
		<svg {...base(size)} strokeWidth={strokeWidth}>
			<path d="M9 5l7 7-7 7" />
		</svg>
	)
}

export function IconLayers({ size = 18, strokeWidth = 2 }: IconProps) {
	return (
		<svg {...base(size)} strokeWidth={strokeWidth}>
			<path d="M12 3l9 5-9 5-9-5 9-5z" />
			<path d="M3.5 13.5L12 18l8.5-4.5" />
		</svg>
	)
}

export function IconShield({ size = 18, strokeWidth = 2 }: IconProps) {
	return (
		<svg {...base(size)} strokeWidth={strokeWidth}>
			<path d="M12 3l7 3v5c0 4.5-3 8.3-7 9.5-4-1.2-7-5-7-9.5V6l7-3z" />
			<path d="M9.2 12l2 2 3.6-4" />
		</svg>
	)
}

export function IconSparkle({ size = 18, strokeWidth = 2 }: IconProps) {
	return (
		<svg {...base(size)} strokeWidth={strokeWidth}>
			<path d="M12 4l1.8 5.2L19 11l-5.2 1.8L12 18l-1.8-5.2L5 11l5.2-1.8L12 4z" />
		</svg>
	)
}

export function IconTextDoc({ size = 22, strokeWidth = 2 }: IconProps) {
	return (
		<svg {...base(size)} strokeWidth={strokeWidth}>
			<path d="M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z" />
			<path d="M14 3v5h5" />
			<path d="M8.5 12h7M8.5 15.5h7M8.5 19h4" strokeWidth="1.7" />
		</svg>
	)
}

/** לוגו האפליקציה — טיפה כתומה עם קו ציור */
export function Logo({ size = 34 }: { size?: number }) {
	return (
		<svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
			<defs>
				<linearGradient id="ic-logo-g" x1="0" y1="0" x2="1" y2="1">
					<stop offset="0" stopColor="#f08339" />
					<stop offset="1" stopColor="#a8480e" />
				</linearGradient>
			</defs>
			<rect width="100" height="100" rx="30" fill="url(#ic-logo-g)" />
			<path
				d="M28 66c8-24 14-34 22-34 6 0 8 5 6 12l-4 14c-1 4 1 6 4 6 4 0 8-4 12-12"
				stroke="#fff"
				strokeWidth="8"
				strokeLinecap="round"
				fill="none"
			/>
		</svg>
	)
}
