import db from "../app/db";

export async function getUserIdFromToken(authHeader: string | null): Promise<string | null> {
    if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
    const token = authHeader.split(" ")[1];
    if (process.env.ADMIN_API_KEY && token === process.env.ADMIN_API_KEY) return 'ADMIN';
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
