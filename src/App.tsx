import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { getUserPreferences, setUserPreferences } from 'tldraw'
import { getProject, projectMode } from './lib/projects'
import { DocEditorPage } from './pages/DocEditorPage'
import { EditorPage } from './pages/EditorPage'
import { HomePage } from './pages/HomePage'

/**
 * ברירת המחדל של האפליקציה היא עברית: אם המשתמש עוד לא בחר שפה ב-tldraw,
 * נקבע עברית (he) — התרגום הרשמי המלא של tldraw, כולל היפוך אוטומטי של
 * כל הממשק ל-RTL. המשתמש עדיין יכול להחליף שפה מתפריט ההעדפות של העורך.
 */
function ensureHebrewDefault() {
	const prefs = getUserPreferences()
	const patch: Partial<typeof prefs> = {}
	if (prefs.locale == null) patch.locale = 'he'
	// ערכת נושא לפי מערכת ההפעלה, אלא אם המשתמש בחר אחרת
	if (prefs.colorScheme == null) patch.colorScheme = 'system'
	if (Object.keys(patch).length > 0) {
		setUserPreferences({ ...prefs, ...patch })
	}
}

/** בוחר את העורך המתאים לפי סוג הפרויקט: קנבס (tldraw) או מסמך טקסט */
function ProjectPage() {
	const { projectId = '' } = useParams()
	const project = getProject(projectId)
	if (projectMode(project) === 'doc') return <DocEditorPage />
	return <EditorPage />
}

export function App() {
	useEffect(() => {
		ensureHebrewDefault()
	}, [])

	return (
		<HashRouter>
			<Routes>
				<Route path="/" element={<HomePage />} />
				<Route path="/p/:projectId" element={<ProjectPage />} />
				<Route path="*" element={<Navigate to="/" replace />} />
			</Routes>
		</HashRouter>
	)
}
