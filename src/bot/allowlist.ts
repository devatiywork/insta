import type { Context, MiddlewareFn } from 'grammy'
import { config } from '../config.js'
import { logger } from '../logger.js'

export function createAllowlist(): MiddlewareFn<Context> {
	const allowed = config.allowedUserIds
	if (allowed.size === 0) {
		logger.warn('ALLOWED_USER_IDS not set — bot is open to anyone')
		return (_ctx, next) => next()
	}
	logger.info({ count: allowed.size }, 'user allowlist active')

	return async (ctx, next) => {
		const userId = ctx.from?.id
		if (userId !== undefined && allowed.has(userId)) {
			return next()
		}
		logger.warn(
			{
				userId,
				username: ctx.from?.username,
				chatId: ctx.chat?.id,
				text: ctx.message?.text?.slice(0, 100),
			},
			'blocked: user not in allowlist',
		)
		if (ctx.chat) {
			await ctx.reply('⛔️ У тебя нет доступа к этому боту. Пошел нахуй.')
		}
	}
}
