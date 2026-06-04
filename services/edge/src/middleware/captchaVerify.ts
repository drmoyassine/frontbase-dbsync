import { getBotProtectionAsync } from '../config/securityConfig.js';

/**
 * Server-side verification for Turnstile and Google reCAPTCHA v2/v3 tokens.
 * 
 * Supports fail-open: if the secret keys are missing, the verification server
 * is unreachable, or response is invalid, the request will be allowed and
 * a warning will be logged. This prevents locking users out due to third-party outages.
 */
export async function verifyCaptchaToken(
    token: string,
    clientIp: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const botConfig = await getBotProtectionAsync();
        
        // 1. Fail-open if bot protection is disabled or config is missing
        if (!botConfig || !botConfig.enabled) {
            return { success: true };
        }

        const { provider, secretKey } = botConfig;
        if (!secretKey) {
            console.warn('[CAPTCHA] Bot protection is enabled but secretKey is missing. Failing open.');
            return { success: true };
        }

        // 2. Select verification endpoint
        let verifyUrl = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
        if (provider === 'recaptcha_v2' || provider === 'recaptcha_v3') {
            verifyUrl = 'https://www.google.com/recaptcha/api/siteverify';
        }

        // 3. Perform HTTP POST request to siteverify with 3s timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        try {
            const formData = new URLSearchParams();
            formData.append('secret', secretKey);
            formData.append('response', token);
            formData.append('remoteip', clientIp);

            const response = await fetch(verifyUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData.toString(),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                console.warn(`[CAPTCHA] Siteverify response error: ${response.status}. Failing open.`);
                return { success: true };
            }

            const result = (await response.json()) as any;
            if (result && typeof result === 'object') {
                // reCAPTCHA v3 score check (if applicable)
                if (provider === 'recaptcha_v3') {
                    // Default threshold 0.5. Can be customized or fall back.
                    const score = typeof result.score === 'number' ? result.score : 1.0;
                    if (result.success && score < 0.5) {
                        console.warn(`[CAPTCHA] reCAPTCHA v3 blocked request: score ${score} is below threshold 0.5.`);
                        return { success: false, error: 'Low CAPTCHA score' };
                    }
                }
                
                return {
                    success: !!result.success,
                    error: result.success ? undefined : (result['error-codes']?.join(', ') || 'Verification failed'),
                };
            }
        } catch (fetchErr) {
            clearTimeout(timeoutId);
            console.warn('[CAPTCHA] Verification request timed out or failed. Failing open.', (fetchErr as Error).message);
            return { success: true };
        }
    } catch (e) {
        console.error('[CAPTCHA] Unexpected error in verifyCaptchaToken. Failing open.', e);
        return { success: true };
    }

    return { success: true };
}
