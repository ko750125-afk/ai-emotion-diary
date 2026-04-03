import { verifyUser, sendError } from './auth.js';

/**
 * Higher-order function to wrap API handlers with authentication and common logic.
 * @param {Function} handler - The original API handler.
 * @param {Object} options - Configuration options.
 * @param {string[]} options.methods - Allowed HTTP methods (e.g., ['GET', 'POST']).
 * @param {boolean} options.requireAuth - Whether authentication is required (default: true).
 */
export function withAuth(handler, options = {}) {
    const { methods = ['GET', 'POST'], requireAuth = true } = options;

    return async (req, res) => {
        // CORS Preflight
        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }

        // Method Check
        if (!methods.includes(req.method)) {
            return sendError(res, 405, `${req.method} Method Not Allowed`);
        }

        try {
            let user = null;

            if (requireAuth) {
                const { user: authedUser, error: authError } = await verifyUser(req);
                if (authError) {
                    return sendError(res, authError.status, authError.message);
                }
                user = authedUser;
            }

            // Execute original handler
            return await handler(req, res, user);

        } catch (error) {
            console.error(`API Error [${req.url}]:`, error);
            return sendError(res, 500, '서버 처리 중 오류가 발생했습니다.');
        }
    };
}
