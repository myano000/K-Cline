import { showSystemNotification } from "../integrations/notifications"
import { ApiConfiguration } from "../shared/api"

interface RetryOptions {
	maxRetries?: number
	baseDelay?: number
	maxDelay?: number
	retryAllErrors?: boolean
	showNotification?: boolean
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
	maxRetries: 3,
	baseDelay: 1_000,
	maxDelay: 10_000,
	retryAllErrors: false,
	showNotification: true,
}

const getRetrySettings = (): Required<RetryOptions> => {
	const apiConfig: ApiConfiguration = (globalThis as any).apiConfiguration || {}
	return {
		maxRetries: apiConfig.maxRetries ?? DEFAULT_OPTIONS.maxRetries,
		baseDelay: apiConfig.baseDelay ?? DEFAULT_OPTIONS.baseDelay,
		maxDelay: apiConfig.maxDelay ?? DEFAULT_OPTIONS.maxDelay,
		retryAllErrors: apiConfig.retryAllErrors ?? DEFAULT_OPTIONS.retryAllErrors,
		showNotification: DEFAULT_OPTIONS.showNotification,
	}
}

export function withRetry(options: RetryOptions = {}) {
	return function (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) {
		const originalMethod = descriptor.value

		descriptor.value = async function* (...args: any[]) {
			const settings = getRetrySettings()

			for (let attempt = 0; attempt < settings.maxRetries; attempt++) {
				try {
					yield* originalMethod.apply(this, args)
					return
				} catch (error: any) {
					const isRateLimit = error?.message?.includes("rate limit") || error?.status === 429
					const isLastAttempt = attempt === settings.maxRetries - 1

					if ((!isRateLimit && !settings.retryAllErrors) || isLastAttempt) {
						throw error
					}

					const delay = Math.min(settings.maxDelay, settings.baseDelay * Math.pow(2, attempt))

					if (settings.showNotification) {
						await showSystemNotification({
							title: "Rate Limit",
							subtitle: `リトライ ${attempt + 1}/${settings.maxRetries}`,
							message: `${Math.round(delay / 1000)}秒後に再試行します`,
						})
					}

					await new Promise((resolve) => setTimeout(resolve, delay))
				}
			}
		}

		return descriptor
	}
}
