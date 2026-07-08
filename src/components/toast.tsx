import { useEffect, useState } from 'react'

/** מערכת הודעות קטנה — showToast מכל מקום, <ToastHost/> מרונדר פעם אחת ב-App */

type ToastKind = 'success' | 'error' | 'info'

interface ToastItem {
	id: number
	message: string
	kind: ToastKind
	leaving?: boolean
}

let nextId = 1

export function showToast(message: string, kind: ToastKind = 'info') {
	window.dispatchEvent(new CustomEvent('ic-toast', { detail: { id: nextId++, message, kind } }))
}

export function ToastHost() {
	const [toasts, setToasts] = useState<ToastItem[]>([])

	useEffect(() => {
		const timers: ReturnType<typeof setTimeout>[] = []
		const onToast = (e: Event) => {
			const toast = (e as CustomEvent<ToastItem>).detail
			setToasts((prev) => [...prev.slice(-2), toast])
			timers.push(
				setTimeout(() => {
					setToasts((prev) => prev.map((t) => (t.id === toast.id ? { ...t, leaving: true } : t)))
				}, 3200),
				setTimeout(() => {
					setToasts((prev) => prev.filter((t) => t.id !== toast.id))
				}, 3450)
			)
		}
		window.addEventListener('ic-toast', onToast)
		return () => {
			window.removeEventListener('ic-toast', onToast)
			timers.forEach(clearTimeout)
		}
	}, [])

	if (toasts.length === 0) return null

	return (
		<div className="toast-host" dir="rtl">
			{toasts.map((t) => (
				<div key={t.id} className={`toast toast-${t.kind} ${t.leaving ? 'toast-leaving' : ''}`}>
					<span className="toast-dot" />
					{t.message}
				</div>
			))}
		</div>
	)
}
