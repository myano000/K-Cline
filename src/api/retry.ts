import { showSystemNotification } from "../integrations/notifications"

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

export function withRetry(options: RetryOptions = {}) {
	const { maxRetries, baseDelay, maxDelay, retryAllErrors, showNotification } = { ...DEFAULT_OPTIONS, ...options }

	return function (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) {
		const originalMethod = descriptor.value

		descriptor.value = async function* (...args: any[]) {
			for (let attempt = 0; attempt < maxRetries; attempt++) {
				try {
					yield* originalMethod.apply(this, args)
					return
				} catch (error: any) {
					const isRateLimit = error?.message?.includes("rate limit") || error?.status === 429
					const isLastAttempt = attempt === maxRetries - 1

					if ((!isRateLimit && !retryAllErrors) || isLastAttempt) {
						throw error
					}

					const delay = Math.min(maxDelay, baseDelay * Math.pow(2, attempt))

					if (showNotification) {
						await showSystemNotification({
							title: "Rate Limit",
							subtitle: `リトライ ${attempt + 1}/${maxRetries}`,
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
