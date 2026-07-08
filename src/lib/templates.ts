import { Editor, createShapeId, toRichText } from 'tldraw'
import { A4_PX } from './pdf'
import type { CanvasMode } from './projects'

/**
 * תבניות מוכנות ליצירת פרויקט:
 * - תבניות מסמך: תוכן TipTap JSON מוכן
 * - תבניות קנבס: פונקציה שבונה צורות על הקנבס בפתיחה הראשונה
 */

export interface ProjectTemplate {
	id: string
	name: string
	description: string
	emoji: string
	mode: CanvasMode
	docContent?: unknown
	buildCanvas?: (editor: Editor) => void
}

/* --------------------------- עזרי בניית מסמך --------------------------- */

function p(text = '', marks?: object[]) {
	return {
		type: 'paragraph',
		content: text ? [{ type: 'text', text, ...(marks ? { marks } : {}) }] : undefined,
	}
}

function h(level: number, text: string) {
	return { type: 'heading', attrs: { level }, content: [{ type: 'text', text }] }
}

function bullets(items: string[]) {
	return {
		type: 'bulletList',
		content: items.map((text) => ({ type: 'listItem', content: [p(text)] })),
	}
}

function tasks(items: string[]) {
	return {
		type: 'taskList',
		content: items.map((text) => ({
			type: 'taskItem',
			attrs: { checked: false },
			content: [p(text)],
		})),
	}
}

function tableRow(cells: string[], header = false) {
	return {
		type: 'tableRow',
		content: cells.map((text) => ({
			type: header ? 'tableHeader' : 'tableCell',
			content: [p(text, header ? [{ type: 'bold' }] : undefined)],
		})),
	}
}

/* ------------------------------- התבניות ------------------------------- */

export const TEMPLATES: ProjectTemplate[] = [
	{
		id: 'formal-letter',
		name: 'מכתב רשמי',
		description: 'מבנה מכתב מלא: נמען, פתיחה, גוף וחתימה',
		emoji: '✉️',
		mode: 'doc',
		docContent: {
			type: 'doc',
			content: [
				p('לכבוד', [{ type: 'bold' }]),
				p('שם הנמען'),
				p('כתובת הנמען'),
				p(),
				p('הנדון: נושא המכתב', [{ type: 'bold' }]),
				p(),
				p('שלום רב,'),
				p('כאן כותבים את גוף המכתב. פסקה ראשונה שמציגה את הרקע והסיבה לפנייה.'),
				p('פסקה שנייה עם הפירוט המלא, הבקשה או ההבהרה.'),
				p(),
				p('בברכה,'),
				p('שם מלא'),
				p('טלפון · דוא"ל'),
			],
		},
	},
	{
		id: 'meeting-summary',
		name: 'סיכום פגישה',
		description: 'פרטי הפגישה, נושאים, החלטות ומשימות להמשך',
		emoji: '📋',
		mode: 'doc',
		docContent: {
			type: 'doc',
			content: [
				h(1, 'סיכום פגישה'),
				{
					type: 'table',
					content: [
						tableRow(['תאריך', 'משתתפים', 'מטרת הפגישה'], true),
						tableRow(['', '', '']),
					],
				},
				h(2, 'נושאים שנדונו'),
				bullets(['נושא ראשון', 'נושא שני', 'נושא שלישי']),
				h(2, 'החלטות'),
				bullets(['החלטה ראשונה', 'החלטה שנייה']),
				h(2, 'משימות להמשך'),
				tasks(['משימה ראשונה — אחראי ותאריך יעד', 'משימה שנייה — אחראי ותאריך יעד']),
			],
		},
	},
	{
		id: 'todo-list',
		name: 'רשימת משימות',
		description: 'רשימת צ׳ק פשוטה ונקייה להתחלה מהירה',
		emoji: '✅',
		mode: 'doc',
		docContent: {
			type: 'doc',
			content: [
				h(1, 'המשימות שלי'),
				h(2, 'היום'),
				tasks(['משימה דחופה ראשונה', 'משימה שנייה', 'משימה שלישית']),
				h(2, 'השבוע'),
				tasks(['משימה לשבוע הקרוב', 'עוד משימה']),
			],
		},
	},
	{
		id: 'resume',
		name: 'קורות חיים',
		description: 'מבנה קלאסי: תמצית, ניסיון, השכלה וכישורים',
		emoji: '💼',
		mode: 'doc',
		docContent: {
			type: 'doc',
			content: [
				h(1, 'שם מלא'),
				p('עיר · טלפון · דוא"ל · לינקדאין'),
				h(2, 'תמצית'),
				p('שתיים-שלוש שורות שמסכמות מי אתם, מה ההתמחות ומה מחפשים.'),
				h(2, 'ניסיון תעסוקתי'),
				p('תפקיד · חברה · שנים', [{ type: 'bold' }]),
				bullets(['הישג מרכזי עם מספרים', 'תחומי אחריות עיקריים']),
				p('תפקיד קודם · חברה · שנים', [{ type: 'bold' }]),
				bullets(['הישג מרכזי', 'אחריות מרכזית']),
				h(2, 'השכלה'),
				bullets(['תואר · מוסד · שנים']),
				h(2, 'כישורים'),
				bullets(['כישור 1 · כישור 2 · כישור 3']),
			],
		},
	},
	{
		id: 'kanban',
		name: 'לוח קאנבן',
		description: 'שלוש עמודות — לביצוע, בתהליך, הושלם — עם פתקיות',
		emoji: '🗂️',
		mode: 'infinite',
		buildCanvas: (editor) => {
			const columns = [
				{ name: 'לביצוע', x: 640 },
				{ name: 'בתהליך', x: 320 },
				{ name: 'הושלם', x: 0 },
			]
			const noteTexts = ['משימה ראשונה', 'משימה שנייה', 'רעיון לבדיקה']
			editor.run(() => {
				for (const col of columns) {
					const frameId = createShapeId()
					editor.createShape({
						id: frameId,
						type: 'frame',
						x: col.x,
						y: 0,
						props: { w: 290, h: 640, name: col.name },
					})
				}
				noteTexts.forEach((text, i) => {
					editor.createShape({
						id: createShapeId(),
						type: 'note',
						x: 680,
						y: 40 + i * 210,
						props: { richText: toRichText(text), color: ['yellow', 'orange', 'light-blue'][i] },
					})
				})
			})
			editor.zoomToFit()
		},
	},
	{
		id: 'mind-map',
		name: 'מפת חשיבה',
		description: 'נושא מרכזי עם ענפים מסביב — מוכן לסיעור מוחות',
		emoji: '🧠',
		mode: 'infinite',
		buildCanvas: (editor) => {
			const center = { x: 0, y: 0, w: 240, h: 110 }
			const branches = [
				{ x: -380, y: -220 },
				{ x: 180, y: -220 },
				{ x: -520, y: 0 },
				{ x: 320, y: 0 },
				{ x: -380, y: 220 },
				{ x: 180, y: 220 },
			]
			const colors = ['orange', 'light-blue', 'light-green', 'light-violet', 'yellow', 'light-red']
			editor.run(() => {
				editor.createShape({
					id: createShapeId(),
					type: 'geo',
					x: center.x,
					y: center.y,
					props: {
						geo: 'ellipse',
						w: center.w,
						h: center.h,
						color: 'orange',
						fill: 'solid',
						richText: toRichText('הנושא המרכזי'),
						size: 'm',
					},
				})
				branches.forEach((b, i) => {
					editor.createShape({
						id: createShapeId(),
						type: 'geo',
						x: b.x,
						y: b.y,
						props: {
							geo: 'rectangle',
							w: 200,
							h: 70,
							color: colors[i],
							fill: 'semi',
							richText: toRichText(`ענף ${i + 1}`),
							size: 's',
						},
					})
					// קו מחבר מהמרכז לענף
					const from = { x: center.x + center.w / 2, y: center.y + center.h / 2 }
					const to = { x: b.x + 100, y: b.y + 35 }
					editor.createShape({
						id: createShapeId(),
						type: 'arrow',
						x: 0,
						y: 0,
						props: {
							start: { x: from.x, y: from.y },
							end: { x: to.x, y: to.y },
							color: 'grey',
							size: 's',
						},
					})
				})
			})
			editor.zoomToFit()
		},
	},
	{
		id: 'weekly-plan',
		name: 'תכנון שבועי',
		description: 'דף A4 עם משבצת לכל יום בשבוע',
		emoji: '🗓️',
		mode: 'a4',
		buildCanvas: (editor) => {
			const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
			editor.run(() => {
				editor.createShape({
					id: createShapeId(),
					type: 'text',
					x: A4_PX.w / 2 - 160,
					y: 42,
					props: { richText: toRichText('תכנון שבועי'), size: 'l', color: 'orange', w: 320, autoSize: false, textAlign: 'middle' },
				})
				days.forEach((day, i) => {
					const row = Math.floor(i / 2)
					const colInRow = i % 2
					const w = 330
					const x = colInRow === 0 ? A4_PX.w - w - 44 : 44
					const y = 130 + row * 240
					editor.createShape({
						id: createShapeId(),
						type: 'geo',
						x,
						y,
						props: {
							geo: 'rectangle',
							w,
							h: 210,
							color: 'grey',
							fill: 'none',
							dash: 'solid',
							size: 's',
							richText: toRichText(day),
							align: 'middle',
							verticalAlign: 'start',
						},
					})
				})
			})
		},
	},
]

/* --------------------------- תבנית ממתינה --------------------------- */

const pendingTemplates = new Map<string, ProjectTemplate>()

export function stashPendingTemplate(projectId: string, template: ProjectTemplate) {
	pendingTemplates.set(projectId, template)
}

/** קריאה בלי צריכה — בטוח לשימוש בזמן render (שעלול לרוץ יותר מפעם אחת) */
export function peekPendingTemplate(projectId: string): ProjectTemplate | undefined {
	return pendingTemplates.get(projectId)
}

export function clearPendingTemplate(projectId: string) {
	pendingTemplates.delete(projectId)
}

export function takePendingTemplate(projectId: string): ProjectTemplate | undefined {
	const t = pendingTemplates.get(projectId)
	pendingTemplates.delete(projectId)
	return t
}
