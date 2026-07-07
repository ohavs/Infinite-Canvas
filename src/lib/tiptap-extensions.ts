import { Extension } from '@tiptap/react'
import TextStyle from '@tiptap/extension-text-style'

/**
 * הרחבות קטנות משלנו ל-TipTap:
 * - FontSize: גודל גופן על גבי mark של TextStyle (style="font-size")
 * - ParagraphDirection: כיוון טקסט (rtl/ltr) לכל פסקה/כותרת
 * - LineHeight: גובה שורה לכל פסקה/כותרת
 */

declare module '@tiptap/react' {
	interface Commands<ReturnType> {
		fontSize: {
			setFontSize: (size: string) => ReturnType
			unsetFontSize: () => ReturnType
		}
		paragraphDirection: {
			setTextDirection: (dir: 'rtl' | 'ltr' | null) => ReturnType
		}
		lineHeight: {
			setLineHeight: (lineHeight: string | null) => ReturnType
		}
	}
}

export const FontSize = Extension.create({
	name: 'fontSize',

	addOptions() {
		return { types: ['textStyle'] }
	},

	addGlobalAttributes() {
		return [
			{
				types: this.options.types,
				attributes: {
					fontSize: {
						default: null,
						parseHTML: (element) => element.style.fontSize || null,
						renderHTML: (attributes) => {
							if (!attributes.fontSize) return {}
							return { style: `font-size: ${attributes.fontSize}` }
						},
					},
				},
			},
		]
	},

	addCommands() {
		return {
			setFontSize:
				(size) =>
				({ chain }) =>
					chain().setMark('textStyle', { fontSize: size }).run(),
			unsetFontSize:
				() =>
				({ chain }) =>
					chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
		}
	},

	addExtensions() {
		return [TextStyle]
	},
})

const BLOCK_TYPES = ['paragraph', 'heading']

export const ParagraphDirection = Extension.create({
	name: 'paragraphDirection',

	addGlobalAttributes() {
		return [
			{
				types: BLOCK_TYPES,
				attributes: {
					dir: {
						default: null,
						parseHTML: (element) => element.getAttribute('dir'),
						renderHTML: (attributes) => (attributes.dir ? { dir: attributes.dir } : {}),
					},
				},
			},
		]
	},

	addCommands() {
		return {
			setTextDirection:
				(dir) =>
				({ commands }) =>
					BLOCK_TYPES.map((type) => commands.updateAttributes(type, { dir })).some(Boolean),
		}
	},
})

export const LineHeight = Extension.create({
	name: 'lineHeight',

	addGlobalAttributes() {
		return [
			{
				types: BLOCK_TYPES,
				attributes: {
					lineHeight: {
						default: null,
						parseHTML: (element) => element.style.lineHeight || null,
						renderHTML: (attributes) => {
							if (!attributes.lineHeight) return {}
							return { style: `line-height: ${attributes.lineHeight}` }
						},
					},
				},
			},
		]
	},

	addCommands() {
		return {
			setLineHeight:
				(lineHeight) =>
				({ commands }) =>
					BLOCK_TYPES.map((type) => commands.updateAttributes(type, { lineHeight })).some(Boolean),
		}
	},
})
