import {
	AlignmentType,
	BorderStyle,
	Document,
	ExternalHyperlink,
	Footer,
	Header,
	HeadingLevel,
	HorizontalPositionAlign,
	HorizontalPositionRelativeFrom,
	ImageRun,
	Packer,
	PageNumber,
	Paragraph,
	ShadingType,
	Table,
	TableCell,
	TableRow,
	TextRun,
	TextWrappingSide,
	TextWrappingType,
	VerticalPositionRelativeFrom,
	WidthType,
	type IParagraphOptions,
	type IRunOptions,
} from 'docx'

/**
 * ממיר את מסמך ה-TipTap (JSON של ProseMirror) לקובץ Word ‎(.docx).
 * מכסה: פסקאות, כותרות, הדגשות (מודגש/נטוי/קו תחתון/קו חוצה), צבע, מרקר,
 * גודל וסוג גופן, יישור, כיוון RTL, רשימות (תבליטים/ממוספרות/משימות),
 * ציטוט, קוד, קו מפריד, קישורים, תמונות וטבלאות.
 */

interface PMNode {
	type: string
	attrs?: Record<string, unknown>
	content?: PMNode[]
	marks?: { type: string; attrs?: Record<string, unknown> }[]
	text?: string
}

const ALIGN_MAP: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
	right: AlignmentType.RIGHT,
	left: AlignmentType.LEFT,
	center: AlignmentType.CENTER,
	justify: AlignmentType.JUSTIFIED,
}

const HEADING_MAP: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
	1: HeadingLevel.HEADING_1,
	2: HeadingLevel.HEADING_2,
	3: HeadingLevel.HEADING_3,
}

function pxToHalfPoints(px: number): number {
	return Math.round(px * 0.75 * 2)
}

function cssColorToHex(value: string | undefined): string | undefined {
	if (!value) return undefined
	const v = value.trim()
	if (v.startsWith('#')) return v.slice(1)
	const m = v.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/)
	if (m) {
		return [m[1], m[2], m[3]]
			.map((c) => Number(c).toString(16).padStart(2, '0'))
			.join('')
	}
	return undefined
}

/** מזהה אם הטקסט מכיל תווים עבריים/ערביים — לצורך סימון RTL בוורד */
function hasRtlChars(text: string): boolean {
	return /[֐-׿؀-ۿ]/.test(text)
}

const PX_TO_EMU = 9525

interface ImageAttrs {
	width?: number | null
	display?: string | null
	posX?: number | null
	posY?: number | null
}

async function dataUrlToImageRun(dataUrl: string, attrs: ImageAttrs = {}): Promise<ImageRun | null> {
	try {
		const match = dataUrl.match(/^data:image\/(png|jpe?g|gif);base64,(.+)$/)
		if (!match) return null
		const type = match[1] === 'gif' ? 'gif' : match[1] === 'png' ? 'png' : 'jpg'
		const binary = atob(match[2])
		const bytes = new Uint8Array(binary.length)
		for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
		const natural = await new Promise<{ width: number; height: number }>((resolve, reject) => {
			const img = new Image()
			img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
			img.onerror = () => reject(new Error('image load failed'))
			img.src = dataUrl
		})
		// גודל התצוגה: רוחב שנקבע בעורך, מוגבל לרוחב אזור התוכן של A4 (כ-620px)
		const targetW = Math.min(attrs.width ?? natural.width, 620)
		const scale = targetW / natural.width
		const transformation = {
			width: Math.round(natural.width * scale),
			height: Math.round(natural.height * scale),
		}

		// מצבי פריסה מתקדמים ממופים לעיגון צף אמיתי בוורד
		const display = attrs.display
		if (display === 'float-right' || display === 'float-left') {
			return new ImageRun({
				type,
				data: bytes,
				transformation,
				floating: {
					horizontalPosition: {
						relative: HorizontalPositionRelativeFrom.MARGIN,
						align:
							display === 'float-right' ? HorizontalPositionAlign.RIGHT : HorizontalPositionAlign.LEFT,
					},
					verticalPosition: { relative: VerticalPositionRelativeFrom.PARAGRAPH, offset: 0 },
					wrap: { type: TextWrappingType.SQUARE, side: TextWrappingSide.LARGEST },
					margins: { left: 91440, right: 91440, top: 45720, bottom: 45720 },
				},
			})
		}
		if (display === 'free' && attrs.posX != null && attrs.posY != null) {
			return new ImageRun({
				type,
				data: bytes,
				transformation,
				floating: {
					horizontalPosition: {
						relative: HorizontalPositionRelativeFrom.PAGE,
						offset: Math.round(attrs.posX * PX_TO_EMU),
					},
					verticalPosition: {
						relative: VerticalPositionRelativeFrom.PAGE,
						offset: Math.round(attrs.posY * PX_TO_EMU),
					},
					wrap: { type: TextWrappingType.NONE },
					behindDocument: false,
					allowOverlap: true,
				},
			})
		}
		return new ImageRun({ type, data: bytes, transformation })
	} catch {
		return null
	}
}

function textRunsFromNode(node: PMNode): (TextRun | ExternalHyperlink)[] {
	if (node.type === 'hardBreak') {
		return [new TextRun({ break: 1 })]
	}
	if (node.type !== 'text' || !node.text) return []

	const runOptions: Record<string, unknown> = {}
	let link: string | undefined

	for (const mark of node.marks ?? []) {
		switch (mark.type) {
			case 'bold':
				runOptions.bold = true
				break
			case 'italic':
				runOptions.italics = true
				break
			case 'underline':
				runOptions.underline = {}
				break
			case 'strike':
				runOptions.strike = true
				break
			case 'subscript':
				runOptions.subScript = true
				break
			case 'superscript':
				runOptions.superScript = true
				break
			case 'code':
				runOptions.font = 'Courier New'
				runOptions.shading = { type: ShadingType.CLEAR, fill: 'F2EDE3' }
				break
			case 'textStyle': {
				const color = cssColorToHex(mark.attrs?.color as string | undefined)
				if (color) runOptions.color = color
				const fontFamily = mark.attrs?.fontFamily as string | undefined
				if (fontFamily) runOptions.font = fontFamily.split(',')[0].replace(/['"]/g, '').trim()
				const fontSize = mark.attrs?.fontSize as string | undefined
				if (fontSize?.endsWith('px')) runOptions.size = pxToHalfPoints(parseFloat(fontSize))
				break
			}
			case 'highlight': {
				const fill = cssColorToHex(mark.attrs?.color as string | undefined) ?? 'FFF2A8'
				runOptions.shading = { type: ShadingType.CLEAR, fill }
				break
			}
			case 'link':
				link = mark.attrs?.href as string | undefined
				break
		}
	}

	if (hasRtlChars(node.text)) {
		runOptions.rightToLeft = true
	}

	const run = new TextRun({ text: node.text, ...(runOptions as IRunOptions) })
	if (link) {
		return [
			new ExternalHyperlink({
				children: [new TextRun({ text: node.text, style: 'Hyperlink', ...(runOptions as IRunOptions) })],
				link,
			}),
		]
	}
	return [run]
}

interface BlockContext {
	numberingRef?: string
	bulletLevel?: number
	numberLevel?: number
	checkbox?: boolean | null
	quote?: boolean
}

async function inlineChildren(node: PMNode): Promise<(TextRun | ExternalHyperlink | ImageRun)[]> {
	const out: (TextRun | ExternalHyperlink | ImageRun)[] = []
	for (const child of node.content ?? []) {
		if (child.type === 'image') {
			const src = child.attrs?.src as string | undefined
			if (src?.startsWith('data:')) {
				const image = await dataUrlToImageRun(src, (child.attrs ?? {}) as ImageAttrs)
				if (image) out.push(image)
			}
		} else {
			out.push(...textRunsFromNode(child))
		}
	}
	return out
}

async function paragraphFromNode(node: PMNode, ctx: BlockContext = {}): Promise<Paragraph> {
	const attrs = node.attrs ?? {}
	const opts: Record<string, unknown> = {
		children: await inlineChildren(node),
	}

	const align = ALIGN_MAP[(attrs.textAlign as string) ?? '']
	if (align) opts.alignment = align

	// ברירת המחדל של המסמך היא עברית — פסקה דו-כיוונית אלא אם סומנה LTR במפורש
	opts.bidirectional = attrs.dir !== 'ltr'

	if (node.type === 'heading') {
		const level = HEADING_MAP[(attrs.level as number) ?? 1]
		if (level) opts.heading = level
	}

	if (ctx.checkbox != null) {
		const box = new TextRun({ text: ctx.checkbox ? '☑ ' : '☐ ', rightToLeft: true })
		opts.children = [box, ...(opts.children as TextRun[])]
	}

	if (ctx.bulletLevel != null) opts.bullet = { level: ctx.bulletLevel }
	if (ctx.numberingRef != null) {
		opts.numbering = { reference: ctx.numberingRef, level: ctx.numberLevel ?? 0 }
	}
	if (ctx.quote) {
		opts.indent = { start: 480 }
		opts.border = {
			start: { style: BorderStyle.SINGLE, size: 18, color: 'E8722A', space: 8 },
		}
	}

	return new Paragraph(opts as IParagraphOptions)
}

async function blocksFromNode(
	node: PMNode,
	ctx: BlockContext = {}
): Promise<(Paragraph | Table)[]> {
	const out: (Paragraph | Table)[] = []

	switch (node.type) {
		case 'paragraph':
		case 'heading':
			out.push(await paragraphFromNode(node, ctx))
			break

		case 'bulletList': {
			for (const item of node.content ?? []) {
				out.push(...(await listItemBlocks(item, { ...ctx, bulletLevel: (ctx.bulletLevel ?? -1) + 1 })))
			}
			break
		}

		case 'orderedList': {
			for (const item of node.content ?? []) {
				out.push(
					...(await listItemBlocks(item, {
						...ctx,
						numberingRef: 'ic-numbering',
						numberLevel: (ctx.numberLevel ?? -1) + 1,
					}))
				)
			}
			break
		}

		case 'taskList': {
			for (const item of node.content ?? []) {
				out.push(...(await listItemBlocks(item, { ...ctx, checkbox: Boolean(item.attrs?.checked) })))
			}
			break
		}

		case 'blockquote': {
			for (const child of node.content ?? []) {
				out.push(...(await blocksFromNode(child, { ...ctx, quote: true })))
			}
			break
		}

		case 'codeBlock': {
			const text = (node.content ?? []).map((c) => c.text ?? '').join('')
			for (const line of text.split('\n')) {
				out.push(
					new Paragraph({
						children: [
							new TextRun({ text: line || ' ', font: 'Courier New', size: 20 }),
						],
						shading: { type: ShadingType.CLEAR, fill: 'F2EDE3' },
					})
				)
			}
			break
		}

		case 'horizontalRule':
			out.push(
				new Paragraph({
					border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'C9BFae' } },
				})
			)
			break

		case 'image': {
			const src = node.attrs?.src as string | undefined
			if (src?.startsWith('data:')) {
				const image = await dataUrlToImageRun(src, (node.attrs ?? {}) as ImageAttrs)
				if (image) out.push(new Paragraph({ children: [image] }))
			}
			break
		}

		case 'table': {
			const rows: TableRow[] = []
			for (const rowNode of node.content ?? []) {
				const cells: TableCell[] = []
				for (const cellNode of rowNode.content ?? []) {
					const cellBlocks: Paragraph[] = []
					for (const child of cellNode.content ?? []) {
						const blocks = await blocksFromNode(child)
						for (const b of blocks) if (b instanceof Paragraph) cellBlocks.push(b)
					}
					cells.push(
						new TableCell({
							children: cellBlocks.length ? cellBlocks : [new Paragraph({})],
							shading:
								cellNode.type === 'tableHeader'
									? { type: ShadingType.CLEAR, fill: 'F6EFE3' }
									: undefined,
						})
					)
				}
				rows.push(new TableRow({ children: cells }))
			}
			out.push(
				new Table({
					rows,
					width: { size: 100, type: WidthType.PERCENTAGE },
					visuallyRightToLeft: true,
				})
			)
			break
		}

		default:
			// סוג לא מוכר — ננסה לרדת לילדים
			for (const child of node.content ?? []) {
				out.push(...(await blocksFromNode(child, ctx)))
			}
	}

	return out
}

async function listItemBlocks(item: PMNode, ctx: BlockContext): Promise<(Paragraph | Table)[]> {
	const out: (Paragraph | Table)[] = []
	for (const child of item.content ?? []) {
		if (child.type === 'paragraph') {
			out.push(await paragraphFromNode(child, ctx))
		} else {
			out.push(...(await blocksFromNode(child, ctx)))
		}
	}
	return out
}

export interface DocxExportOptions {
	/** שורות הכותרת העליונה (חוזרת בכל עמוד): כותרת מודגשת, ואחריה שורות רגילות */
	headerTitle?: string
	headerLines?: string[]
	/** מספרי עמודים בכותרת התחתונה */
	pageNumbers?: boolean
}

export async function exportDocToDocx(
	docJson: unknown,
	fileName: string,
	options: DocxExportOptions = {}
): Promise<void> {
	const root = docJson as PMNode
	const children: (Paragraph | Table)[] = []
	for (const node of root.content ?? []) {
		children.push(...(await blocksFromNode(node)))
	}
	if (children.length === 0) children.push(new Paragraph({}))

	const headerParagraphs: Paragraph[] = []
	if (options.headerTitle) {
		headerParagraphs.push(
			new Paragraph({
				bidirectional: true,
				children: [new TextRun({ text: options.headerTitle, bold: true, rightToLeft: true })],
			})
		)
	}
	for (const line of options.headerLines ?? []) {
		if (!line.trim()) continue
		headerParagraphs.push(
			new Paragraph({
				bidirectional: true,
				children: [
					new TextRun({ text: line, rightToLeft: true, color: '6b6257', size: 20 }),
				],
			})
		)
	}
	if (headerParagraphs.length > 0) {
		headerParagraphs.push(
			new Paragraph({
				border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D8CDBC' } },
			})
		)
	}

	const doc = new Document({
		numbering: {
			config: [
				{
					reference: 'ic-numbering',
					levels: [0, 1, 2, 3].map((level) => ({
						level,
						format: 'decimal' as const,
						text: `%${level + 1}.`,
						alignment: AlignmentType.START,
					})),
				},
			],
		},
		styles: {
			default: {
				document: {
					run: { font: 'Arial', size: 24, rightToLeft: true },
				},
			},
		},
		sections: [
			{
				properties: {
					page: {
						size: { width: 11906, height: 16838 }, // A4 ב-twips
						margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 },
					},
				},
				headers:
					headerParagraphs.length > 0
						? { default: new Header({ children: headerParagraphs }) }
						: undefined,
				footers: options.pageNumbers
					? {
							default: new Footer({
								children: [
									new Paragraph({
										alignment: AlignmentType.CENTER,
										children: [
											new TextRun({ children: [PageNumber.CURRENT] }),
											new TextRun({ text: ' / ' }),
											new TextRun({ children: [PageNumber.TOTAL_PAGES] }),
										],
									}),
								],
							}),
						}
					: undefined,
				children,
			},
		],
	})

	const blob = await Packer.toBlob(doc)
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = `${fileName || 'document'}.docx`
	a.click()
	URL.revokeObjectURL(url)
}
