import db from "../app/db";

export const SYSTEM_ADMIN_ID = 'bb2f8cbe-208a-4807-b542-ad2b8b247a9d';

/**
 * Get user ID from Authorization header
 * Returns null for unauthenticated requests
 */
export async function getUserIdFromToken(authHeader: string | null): Promise<string | null> {
    if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
    const token = authHeader.split(" ")[1];
    // ✅ Admin API Key → system_admin 고정 매핑
    if (process.env.ADMIN_API_KEY && token === process.env.ADMIN_API_KEY) {
        console.log('🔑 [Auth] Admin API Key → system_admin');
        return SYSTEM_ADMIN_ID;
    }
    try {
        const res = await db.query(
            `SELECT user_id FROM user_sessions WHERE token = $1 AND expires_at > NOW()`,
            [token]
        );
        return res.rows[0]?.user_id || null;
    } catch (e) {
        console.error("Auth Check Error:", e);
        return null;
    }
}

/**
 * Check if user is admin
 * Used for filtering hidden content
 */
export async function isAdmin(authHeader: string | null): Promise<boolean> {
    const userId = await getUserIdFromToken(authHeader);
    if (!userId) return false;

    // system_admin은 항상 admin
    if (userId === SYSTEM_ADMIN_ID) return true;

    try {
        const res = await db.query(
            `SELECT is_admin FROM users WHERE id = $1`,
            [userId]
        );
        return res.rows[0]?.is_admin === true;
    } catch (e) {
        console.error("Admin Check Error:", e);
        return false;
    }
}
