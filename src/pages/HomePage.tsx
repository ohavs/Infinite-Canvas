import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
	createProject,
	deleteProject,
	duplicateProject,
	listProjects,
	renameProject,
	stashPendingImport,
	type ProjectMeta,
} from '../lib/projects'
import './home.css'

const relativeTime = new Intl.RelativeTimeFormat('he', { numeric: 'auto' })
const absoluteTime = new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium', timeStyle: 'short' })

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

	const handleCreate = () => {
		const project = createProject()
		navigate(`/p/${project.id}`)
	}

	const handleImportFile = async (file: File) => {
		const text = await file.text()
		const baseName = file.name.replace(/\.tldr$/i, '').trim()
		const project = createProject(baseName || undefined)
		stashPendingImport(project.id, text)
		navigate(`/p/${project.id}`)
	}

	const handleDuplicate = async (id: string) => {
		await duplicateProject(id)
		refresh()
	}

	return (
		<div className="home">
			<header className="home-header">
				<div className="home-header-inner">
					<div className="home-brand">
						<span className="home-logo" aria-hidden>
							<svg viewBox="0 0 100 100" width="34" height="34">
								<rect width="100" height="100" rx="22" fill="currentColor" opacity="0.92" />
								<path
									d="M28 66c8-24 14-34 22-34 6 0 8 5 6 12l-4 14c-1 4 1 6 4 6 4 0 8-4 12-12"
									stroke="var(--ic-bg)"
									strokeWidth="8"
									strokeLinecap="round"
									fill="none"
								/>
							</svg>
						</span>
						<div>
							<h1>קנבס אינסופי</h1>
							<p>לוח ציור חופשי בעברית — נשמר אוטומטית בדפדפן שלך</p>
						</div>
					</div>
					<div className="home-actions">
						<button className="btn btn-ghost" onClick={() => fileInputRef.current?.click()}>
							ייבוא קובץ ‎.tldr
						</button>
						<button className="btn btn-primary" onClick={handleCreate}>
							<span aria-hidden>＋</span> פרויקט חדש
						</button>
					</div>
				</div>
			</header>

			<main className="home-main">
				{projects.length === 0 ? (
					<div className="home-empty">
						<div className="home-empty-art" aria-hidden>
							🎨
						</div>
						<h2>עוד אין כאן פרויקטים</h2>
						<p>צרו פרויקט ראשון וקבלו קנבס אינסופי עם כל כלי הציור, הצורות והטקסט.</p>
						<button className="btn btn-primary btn-lg" onClick={handleCreate}>
							יצירת פרויקט ראשון
						</button>
					</div>
				) : (
					<div className="project-grid">
						{projects.map((project) => (
							<article
								key={project.id}
								className="project-card"
								onClick={() => navigate(`/p/${project.id}`)}
							>
								<div className="project-thumb">
									{project.thumbnail ? (
										<img src={project.thumbnail} alt="" loading="lazy" />
									) : (
										<span className="project-thumb-empty" aria-hidden>
											✏️
										</span>
									)}
								</div>
								<div className="project-info">
									<div className="project-text">
										<h3 title={project.name}>{project.name}</h3>
										<time>{formatUpdatedAt(project.updatedAt)}</time>
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
											⋮
										</button>
										{menuOpenFor === project.id && (
											<div className="project-menu" onPointerDown={(e) => e.stopPropagation()}>
												<button
													onClick={() => {
														setMenuOpenFor(null)
														setRenaming(project)
													}}
												>
													שינוי שם
												</button>
												<button
													onClick={() => {
														setMenuOpenFor(null)
														void handleDuplicate(project.id)
													}}
												>
													שכפול
												</button>
												<button
													className="danger"
													onClick={() => {
														setMenuOpenFor(null)
														setDeleting(project)
													}}
												>
													מחיקה
												</button>
											</div>
										)}
									</div>
								</div>
							</article>
						))}
					</div>
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
					<button type="submit" className="btn btn-primary" disabled={!name.trim()}>
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
					מחיקה לצמיתות
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
