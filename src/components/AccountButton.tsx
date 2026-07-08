import { useEffect, useState } from 'react'
import {
	cloudEnabled,
	signInWithGoogle,
	signOutCloud,
	syncNow,
	watchAuth,
	watchSync,
	type CloudUser,
} from '../lib/cloud'
import { showToast } from './toast'
import './account-button.css'

/** כפתור חשבון + סנכרון ענן — מוצג רק כשקונפיגורציית Firebase קיימת */
export function AccountButton() {
	const [user, setUser] = useState<CloudUser | null>(null)
	const [sync, setSync] = useState<{ syncing: boolean; lastSyncAt: number | null }>({
		syncing: false,
		lastSyncAt: null,
	})
	const [menuOpen, setMenuOpen] = useState(false)

	useEffect(() => {
		if (!cloudEnabled) return
		const offAuth = watchAuth(setUser)
		const offSync = watchSync(setSync)
		return () => {
			offAuth()
			offSync()
		}
	}, [])

	useEffect(() => {
		if (!menuOpen) return
		const close = () => setMenuOpen(false)
		window.addEventListener('pointerdown', close)
		return () => window.removeEventListener('pointerdown', close)
	}, [menuOpen])

	if (!cloudEnabled) return null

	if (!user) {
		return (
			<button
				className="account-signin"
				onClick={() =>
					void signInWithGoogle().catch(() => showToast('ההתחברות נכשלה, נסו שוב', 'error'))
				}
			>
				<GoogleGlyph /> התחברות
			</button>
		)
	}

	return (
		<span className="account-wrap" onPointerDown={(e) => e.stopPropagation()}>
			<button
				className={`account-avatar ${sync.syncing ? 'syncing' : ''}`}
				title={user.name ?? 'החשבון שלי'}
				onClick={() => setMenuOpen(!menuOpen)}
			>
				{user.photo ? <img src={user.photo} alt="" /> : (user.name?.[0] ?? '👤')}
			</button>
			{menuOpen && (
				<div className="account-menu" dir="rtl">
					<div className="account-menu-header">
						<strong>{user.name ?? 'מחובר'}</strong>
						<span>
							{sync.syncing
								? 'מסנכרן...'
								: sync.lastSyncAt
									? 'מסונכרן ✓'
									: 'ממתין לסנכרון'}
						</span>
					</div>
					<button
						className="account-menu-item"
						onClick={() => {
							void syncNow().then(() => showToast('הסנכרון הושלם', 'success'))
							setMenuOpen(false)
						}}
					>
						🔄 סנכרון עכשיו
					</button>
					<button
						className="account-menu-item danger"
						onClick={() => {
							void signOutCloud()
							setMenuOpen(false)
						}}
					>
						התנתקות
					</button>
				</div>
			)}
		</span>
	)
}

function GoogleGlyph() {
	return (
		<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden>
			<path
				d="M21.6 12.2c0-.7-.06-1.4-.18-2H12v3.9h5.4a4.6 4.6 0 01-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4z"
				fill="#4285F4"
			/>
			<path
				d="M12 22c2.7 0 5-. 9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0012 22z"
				fill="#34A853"
			/>
			<path d="M6.4 14a6 6 0 010-3.9V7.4H3.1a10 10 0 000 9.1L6.4 14z" fill="#FBBC05" />
			<path
				d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 003.1 7.4L6.4 10c.8-2.3 3-4.1 5.6-4.1z"
				fill="#EA4335"
			/>
		</svg>
	)
}
