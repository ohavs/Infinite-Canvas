import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
	IconClock,
	IconCopy,
	IconDots,
	IconImport,
	IconInfinity,
	IconLayers,
	IconPage,
	IconPencil,
	IconPlus,
	IconTextDoc,
	IconTrash,
	Logo,
} from '../components/icons'
import { ThemeControls } from '../components/ThemeControls'
import {
	createProject,
	deleteProject,
	duplicateProject,
	listProjects,
	projectMode,
	renameProject,
	stashPendingImport,
	type CanvasMode,
	type ProjectMeta,
} from '../lib/projects'
import './home.css'

const relativeTime = new Intl.RelativeTimeFormat('he', { numeric: 'auto' })
const absoluteTime = new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium', timeStyle: 'short' })
const headerDate = new Intl.DateTimeFormat('he-IL', {
	weekday: 'long',
	day: 'numeric',
	month: 'long',
	year: 'numeric',
})

function greeting(): string {
	const hour = new Date().getHours()
	if (hour >= 5 && hour < 12) return 'בוקר של יצירה ✨'
	if (hour >= 12 && hour < 17) return 'צהריים טובים, יוצרים?'
	if (hour >= 17 && hour < 21) return 'ערב טוב, הקנבס מחכה'
	return 'לילה של רעיונות 🌙'
}

function formatUpdatedAt(timestamp: number): string {
	const diffMs = timestamp - Date.now()
	const diffMinutes = Math.round(diffMs / 60_000)
	if (diffMinutes > -1) return 'לפני רגע'
	if (diffMinutes > -60) return relativeTime.format(diffMinutes, 'minute')
	const diffHours = Math.round(diffMinutes / 60)
	if (diffHours > -24) return relativeTime.format(diffHours, 'hour')
	const diffDays = Math.round(diffHours / 24)
	if (diffDays > -7) return relativeTime.format(diffDays, 'day')
	return absoluteTime.format(timestamp)
}

export function HomePage() {
	const navigate = useNavigate()
	const [projects, setProjects] = useState<ProjectMeta[]>(() => listProjects())
	const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null)
	const [creating, setCreating] = useState(false)
	const [renaming, setRenaming] = useState<ProjectMeta | null>(null)
	const [deleting, setDeleting] = useState<ProjectMeta | null>(null)
	const fileInputRef = useRef<HTMLInputElement>(null)

	const refresh = useCallback(() => setProjects(listProjects()), [])

	useEffect(() => {
		window.addEventListener('projects-changed', refresh)
		window.addEventListener('storage', refresh)
		return () => {
			window.removeEventListener('projects-changed', refresh)
			window.removeEventListener('storage', refresh)
		}
	}, [refresh])

	useEffect(() => {
		if (menuOpenFor === null) return
		const close = () => setMenuOpenFor(null)
		window.addEventListener('pointerdown', close)
		return () => window.removeEventListener('pointerdown', close)
	}, [menuOpenFor])

	const lastUpdated = useMemo(
		() => (projects.length ? formatUpdatedAt(Math.max(...projects.map((p) => p.updatedAt))) : '—'),
		[projects]
	)

	const handleImportFile = async (file: File) => {
		const text = await file.text()
		const baseName = file.name.replace(/\.tldr$/i, '').trim()
		const project = createProject(baseName || undefined, 'infinite')
		stashPendingImport(project.id, text)
		navigate(`/p/${project.id}`)
	}

	return (
		<div className="home">
			<header className="topbar">
				<div className="topbar-inner">
					<div className="brand">
						<Logo size={38} />
						<div className="brand-text">
							<strong>קנבס אינסופי</strong>
							<span>סטודיו ציור אישי</span>
						</div>
					</div>
					<nav className="topbar-nav" aria-label="ניווט ראשי">
						<span className="nav-pill nav-pill-active">
							<IconLayers size={15} /> הפרויקטים שלי
						</span>
					</nav>
					<div className="topbar-side">
						<span className="topbar-date">
							<IconClock size={14} />
							<span>{headerDate.format(Date.now())}</span>
						</span>
						<ThemeControls />
					</div>
				</div>
			</header>

			<main className="home-main">
				<section className="hero-banner">
					<div className="hero-banner-art" aria-hidden>
						<svg viewBox="0 0 200 120" preserveAspectRatio="none">
							<path
								d="M-10 95c30-45 55-65 78-52 18 10 8 38 26 44 22 8 40-30 62-38 18-7 34 2 54 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="10"
								strokeLinecap="round"
								opacity="0.16"
							/>
							<path
								d="M-10 112c34-30 60-42 84-33 20 8 16 26 36 28 24 2 38-24 60-28 16-3 30 4 40 14"
								fill="none"
								stroke="currentColor"
								strokeWidth="6"
								strokeLinecap="round"
								opacity="0.3"
							/>
						</svg>
					</div>
					<div className="hero-banner-content">
						<h1>{greeting()}</h1>
						<p className="hero-sub">
							קנבס אינסופי, דפי A4 ומסמכי טקסט — הכל נשמר אוטומטית אצלך בדפדפן.
						</p>
						<div className="hero-meta">
							<span>{projects.length} פרויקטים</span>
							<i />
							<span>עדכון אחרון: {lastUpdated}</span>
							<i />
							<span>שמירה מקומית, בלי חשבון</span>
						</div>
					</div>
					<div className="hero-actions">
						<button className="btn btn-ink btn-lg" onClick={() => setCreating(true)}>
							<IconPlus size={16} /> פרויקט חדש
						</button>
						<button className="btn btn-ghost" onClick={() => fileInputRef.current?.click()}>
							<IconImport size={16} /> ייבוא ‎.tldr
						</button>
					</div>
				</section>

				{projects.length > 0 && (
					<div className="grid-title">
						<h2>הפרויקטים שלך</h2>
					</div>
				)}

				{projects.length === 0 ? (
					<section className="home-empty">
						<span className="home-empty-icon">
							<IconInfinity size={34} />
						</span>
						<h2>עוד אין כאן פרויקטים</h2>
						<p>צרו לוח ראשון — קנבס אינסופי חופשי או דף A4 מסודר, עם כל כלי הציור והטקסט.</p>
						<button className="btn btn-ink btn-lg" onClick={() => setCreating(true)}>
							<IconPlus size={16} /> יצירת פרויקט ראשון
						</button>
					</section>
				) : (
					<section className="project-grid">
						{projects.map((project) => {
							const mode = projectMode(project)
							return (
								<article
									key={project.id}
									className="project-card"
									onClick={() => navigate(`/p/${project.id}`)}
								>
									<div className="project-thumb">
										{mode === 'doc' ? (
											project.excerpt ? (
												<div className="doc-card-preview" dir="rtl">
													{project.excerpt}
												</div>
											) : (
												<span className="project-thumb-empty">
													<IconTextDoc size={30} />
												</span>
											)
										) : project.thumbnail ? (
											<img src={project.thumbnail} alt="" loading="lazy" />
										) : (
											<span className="project-thumb-empty">
												{mode === 'a4' ? <IconPage size={30} /> : <IconInfinity size={32} />}
											</span>
										)}
										<span className={`mode-chip ${mode !== 'infinite' ? 'mode-chip-a4' : ''}`}>
											{mode === 'a4' ? (
												<>
													<IconPage size={12} /> דפי A4
												</>
											) : mode === 'doc' ? (
												<>
													<IconTextDoc size={12} /> מסמך
												</>
											) : (
												<>
													<IconInfinity size={13} /> אינסופי
												</>
											)}
										</span>
									</div>
									<div className="project-info">
										<div className="project-text">
											<h3 title={project.name}>{project.name}</h3>
											<time>
												<IconClock size={12} /> {formatUpdatedAt(project.updatedAt)}
											</time>
										</div>
										<div className="project-menu-wrap" onClick={(e) => e.stopPropagation()}>
											<button
												className="icon-btn"
												aria-label="פעולות בפרויקט"
												onPointerDown={(e) => e.stopPropagation()}
												onClick={() =>
													setMenuOpenFor(menuOpenFor === project.id ? null : project.id)
												}
											>
												<IconDots />
											</button>
											{menuOpenFor === project.id && (
												<div className="project-menu" onPointerDown={(e) => e.stopPropagation()}>
													<button
														onClick={() => {
															setMenuOpenFor(null)
															setRenaming(project)
														}}
													>
														<IconPencil /> שינוי שם
													</button>
													<button
														onClick={() => {
															setMenuOpenFor(null)
															void duplicateProject(project.id).then(refresh)
														}}
													>
														<IconCopy /> שכפול
													</button>
													<button
														className="danger"
														onClick={() => {
															setMenuOpenFor(null)
															setDeleting(project)
														}}
													>
														<IconTrash /> מחיקה
													</button>
												</div>
											)}
										</div>
									</div>
								</article>
							)
						})}
					</section>
				)}
			</main>

			<input
				ref={fileInputRef}
				type="file"
				accept=".tldr,application/json"
				hidden
				onChange={(e) => {
					const file = e.target.files?.[0]
					e.target.value = ''
					if (file) void handleImportFile(file)
				}}
			/>

			{creating && (
				<NewProjectDialog
					onClose={() => setCreating(false)}
					onSubmit={(name, mode) => {
						const project = createProject(name || undefined, mode)
						navigate(`/p/${project.id}`)
					}}
				/>
			)}

			{renaming && (
				<RenameDialog
					project={renaming}
					onClose={() => setRenaming(null)}
					onSubmit={(name) => {
						renameProject(renaming.id, name)
						setRenaming(null)
						refresh()
					}}
				/>
			)}

			{deleting && (
				<ConfirmDeleteDialog
					project={deleting}
					onClose={() => setDeleting(null)}
					onConfirm={async () => {
						await deleteProject(deleting.id)
						setDeleting(null)
						refresh()
					}}
				/>
			)}
		</div>
	)
}

function NewProjectDialog({
	onClose,
	onSubmit,
}: {
	onClose: () => void
	onSubmit: (name: string, mode: CanvasMode) => void
}) {
	const [name, setName] = useState('')
	const [mode, setMode] = useState<CanvasMode>('infinite')
	return (
		<Modal onClose={onClose}>
			<h3>פרויקט חדש</h3>
			<form
				onSubmit={(e) => {
					e.preventDefault()
					onSubmit(name, mode)
				}}
			>
				<label className="field-label" htmlFor="new-project-name">
					שם הפרויקט
				</label>
				<input
					id="new-project-name"
					className="text-input"
					value={name}
					autoFocus
					placeholder="פרויקט ללא שם"
					onChange={(e) => setName(e.target.value)}
				/>
				<span className="field-label">סוג הקנבס</span>
				<div className="mode-picker" role="radiogroup" aria-label="סוג הקנבס">
					<button
						type="button"
						role="radio"
						aria-checked={mode === 'infinite'}
						className={`mode-option ${mode === 'infinite' ? 'mode-option-active' : ''}`}
						onClick={() => setMode('infinite')}
					>
						<span className="mode-option-icon">
							<IconInfinity size={24} />
						</span>
						<strong>קנבס אינסופי</strong>
						<span>משטח חופשי בלי גבולות, לכל כיוון</span>
					</button>
					<button
						type="button"
						role="radio"
						aria-checked={mode === 'a4'}
						className={`mode-option ${mode === 'a4' ? 'mode-option-active' : ''}`}
						onClick={() => setMode('a4')}
					>
						<span className="mode-option-icon">
							<IconPage size={24} />
						</span>
						<strong>דפי A4</strong>
						<span>ציור על עמודים מסודרים, מוכן ל-PDF</span>
					</button>
					<button
						type="button"
						role="radio"
						aria-checked={mode === 'doc'}
						className={`mode-option ${mode === 'doc' ? 'mode-option-active' : ''}`}
						onClick={() => setMode('doc')}
					>
						<span className="mode-option-icon">
							<IconTextDoc size={24} />
						</span>
						<strong>מסמך טקסט</strong>
						<span>עורך כתיבה מלא כמו וורד, עם ייצוא ל-Word</span>
					</button>
				</div>
				<div className="modal-actions">
					<button type="button" className="btn btn-ghost" onClick={onClose}>
						ביטול
					</button>
					<button type="submit" className="btn btn-accent">
						<IconPlus size={15} /> יצירה
					</button>
				</div>
			</form>
		</Modal>
	)
}

function RenameDialog({
	project,
	onClose,
	onSubmit,
}: {
	project: ProjectMeta
	onClose: () => void
	onSubmit: (name: string) => void
}) {
	const [name, setName] = useState(project.name)
	return (
		<Modal onClose={onClose}>
			<h3>שינוי שם הפרויקט</h3>
			<form
				onSubmit={(e) => {
					e.preventDefault()
					if (name.trim()) onSubmit(name)
				}}
			>
				<input
					className="text-input"
					value={name}
					autoFocus
					onFocus={(e) => e.target.select()}
					onChange={(e) => setName(e.target.value)}
				/>
				<div className="modal-actions">
					<button type="button" className="btn btn-ghost" onClick={onClose}>
						ביטול
					</button>
					<button type="submit" className="btn btn-accent" disabled={!name.trim()}>
						שמירה
					</button>
				</div>
			</form>
		</Modal>
	)
}

function ConfirmDeleteDialog({
	project,
	onClose,
	onConfirm,
}: {
	project: ProjectMeta
	onClose: () => void
	onConfirm: () => void
}) {
	return (
		<Modal onClose={onClose}>
			<h3>מחיקת הפרויקט „{project.name}"?</h3>
			<p className="modal-text">הפעולה תמחק את הקנבס לצמיתות מהדפדפן. אי אפשר לשחזר אותה.</p>
			<div className="modal-actions">
				<button className="btn btn-ghost" onClick={onClose}>
					ביטול
				</button>
				<button className="btn btn-danger" onClick={onConfirm}>
					<IconTrash size={15} /> מחיקה לצמיתות
				</button>
			</div>
		</Modal>
	)
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose()
		}
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [onClose])

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal" role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
				{children}
			</div>
		</div>
	)
}
