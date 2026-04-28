import type { Bot } from 'grammy'
import { scrape } from '../../instagram/scraper.js'
import { sendMedia } from '../../instagram/send-media.js'
import {
	InstagramError,
	InvalidUrlError,
	NotFoundError,
	PrivateContentError,
} from '../../instagram/types.js'
import { findInstagramUrl } from '../../instagram/url-parser.js'
import { logger } from '../../logger.js'

function userMessageForError(err: unknown): string {
	if (err instanceof InvalidUrlError)
		return '❌ Это не похоже на ссылку Instagram.'
	if (err instanceof NotFoundError) return '❌ Пост не найден или удалён.'
	if (err instanceof PrivateContentError)
		return '🔒 Пост приватный — я работаю только с публичными.'
	if (err instanceof InstagramError)
		return '⚠️ Не удалось получить медиа. Попробуй ещё раз позже.'
	return '⚠️ Что-то пошло не так. Попробуй ещё раз.'
}

export function registerMessage(bot: Bot): void {
	bot.on('message:text', async ctx => {
		const text = ctx.message.text
		if (text.startsWith('/')) return

		const url = findInstagramUrl(text)
		if (!url) {
			await ctx.reply(
				'Пришли ссылку на пост или Reels Instagram. /help для подробностей.',
			)
			return
		}

		const log = logger.child({
			chatId: ctx.chat.id,
			userId: ctx.from?.id,
			url,
		})

		try {
			await ctx.replyWithChatAction('upload_video')
			const result = await scrape(url)
			log.info(
				{ items: result.items.length, source: result.source },
				'scrape success',
			)
			await sendMedia(ctx, result)
		} catch (err) {
			log.error({ err }, 'scrape or send failed')
			await ctx.reply(userMessageForError(err))
		}
	})
}
