import { useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { getUserPreferences, setUserPreferences } from 'tldraw'
import { ToastHost } from './components/toast'
import { getProject, projectMode } from './lib/projects'
import { DocEditorPage } from './pages/DocEditorPage'
import { EditorPage } from './pages/EditorPage'
import { HomePage } from './pages/HomePage'

/**
 * ברירת המחדל של האפליקציה היא עברית: אם המשתמש עוד לא בחר שפה ב-tldraw,
 * נקבע עברית (he) — התרגום הרשמי המלא של tldraw, כולל היפוך אוטומטי של
 * כל הממשק ל-RTL. המשתמש עדיין יכול להחליף שפה מתפריט ההעדפות של העורך.
 *
 * הקנבס תמיד בהיר: ערכת הצבעים של tldraw נקבעת ל-light בכל טעינה, בלי
 * קשר למצב הכהה/בהיר של שאר האפליקציה — משטח הציור נשאר לבן ונעים.
 */
function ensureHebrewDefault() {
	const prefs = getUserPreferences()
	setUserPreferences({
		...prefs,
		locale: prefs.locale ?? 'he',
		colorScheme: 'light',
	})
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
			<ToastHost />
		</HashRouter>
	)
}
