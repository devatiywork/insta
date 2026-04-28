import { type Context, InputFile, InputMediaBuilder } from 'grammy'
import type { InputMediaPhoto, InputMediaVideo } from 'grammy/types'
import type { ScrapeResult } from './types.js'

const TG_CAPTION_LIMIT = 1024

function buildCaption(result: ScrapeResult): string | undefined {
	if (!result.caption && !result.author) return undefined
	const author = result.author ? `@${result.author}` : ''
	const text = [author, result.caption].filter(Boolean).join('\n\n')
	if (!text) return undefined
	return text.length > TG_CAPTION_LIMIT
		? text.slice(0, TG_CAPTION_LIMIT - 1) + '…'
		: text
}

function fileFromUrl(url: string, kind: 'photo' | 'video'): InputFile {
	const ext = kind === 'video' ? 'mp4' : 'jpg'
	return new InputFile(new URL(url), `media.${ext}`)
}

export async function sendMedia(
	ctx: Context,
	result: ScrapeResult,
): Promise<void> {
	const caption = buildCaption(result)

	if (result.items.length === 1) {
		const item = result.items[0]!
		const file = fileFromUrl(item.url, item.kind)
		if (item.kind === 'video') {
			await ctx.replyWithVideo(file, {
				caption,
				supports_streaming: true,
				width: item.width,
				height: item.height,
				duration: item.durationSec ? Math.round(item.durationSec) : undefined,
			})
		} else {
			await ctx.replyWithPhoto(file, { caption })
		}
		return
	}

	const group: Array<InputMediaPhoto | InputMediaVideo> = result.items.map(
		(item, index) => {
			const file = fileFromUrl(item.url, item.kind)
			const itemCaption = index === 0 ? caption : undefined
			return item.kind === 'video'
				? InputMediaBuilder.video(file, { caption: itemCaption })
				: InputMediaBuilder.photo(file, { caption: itemCaption })
		},
	)

	for (let i = 0; i < group.length; i += 10) {
		const chunk = group.slice(i, i + 10)
		await ctx.replyWithMediaGroup(chunk)
	}
}
