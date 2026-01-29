"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveAudioFile = saveAudioFile;
exports.deleteAudioFile = deleteAudioFile;
exports.getAudioFileSize = getAudioFileSize;
exports.createAudioRecord = createAudioRecord;
exports.updateAudioStatus = updateAudioStatus;
exports.getAudioRecord = getAudioRecord;
exports.listEpisodeAudio = listEpisodeAudio;
exports.getFailedAudio = getFailedAudio;
exports.calculateDuration = calculateDuration;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const db_1 = __importDefault(require("../db"));
const AUDIO_ROOT = process.env.AUDIO_ROOT || "/app/audio";
async function saveAudioFile(novelId, episodeNumber, language, audioData) {
    const episodeDir = path_1.default.join(AUDIO_ROOT, novelId, String(episodeNumber));
    await promises_1.default.mkdir(episodeDir, { recursive: true });
    const filePath = path_1.default.join(episodeDir, `${language}.mp3`);
    await promises_1.default.writeFile(filePath, audioData);
    return `/api/audio/files/${novelId}/${episodeNumber}/${language}`;
}
async function deleteAudioFile(novelId, episodeNumber, language) {
    const filePath = path_1.default.join(AUDIO_ROOT, novelId, String(episodeNumber), `${language}.mp3`);
    try {
        await promises_1.default.unlink(filePath);
        return true;
    }
    catch (_a) {
        return false;
    }
}
async function getAudioFileSize(novelId, episodeNumber, language) {
    const filePath = path_1.default.join(AUDIO_ROOT, novelId, String(episodeNumber), `${language}.mp3`);
    try {
        const stats = await promises_1.default.stat(filePath);
        return stats.size;
    }
    catch (_a) {
        return null;
    }
}
async function createAudioRecord(novelId, episodeNumber, language, voiceName) {
    const result = await db_1.default.query(`INSERT INTO audio_files (novel_id, episode_number, language, voice_name, status)
    VALUES ($1, $2, $3, $4, 'PENDING')
    ON CONFLICT (novel_id, episode_number, language)
    DO UPDATE SET 
      voice_name = EXCLUDED.voice_name, 
      status = 'PENDING', 
      error_message = NULL, 
      updated_at = NOW()
    RETURNING id`, [novelId, episodeNumber, language, voiceName]);
    return result.rows[0].id;
}
async function updateAudioStatus(novelId, episodeNumber, language, status, updates) {
    await db_1.default.query(`UPDATE audio_files
    SET status = $1, 
        audio_url = COALESCE($2, audio_url), 
        duration_seconds = COALESCE($3, duration_seconds),
        file_size_bytes = COALESCE($4, file_size_bytes), 
        error_message = $5, 
        updated_at = NOW()
    WHERE novel_id = $6 AND episode_number = $7 AND language = $8`, [
        status,
        (updates === null || updates === void 0 ? void 0 : updates.audioUrl) || null,
        (updates === null || updates === void 0 ? void 0 : updates.durationSeconds) || null,
        (updates === null || updates === void 0 ? void 0 : updates.fileSizeBytes) || null,
        (updates === null || updates === void 0 ? void 0 : updates.errorMessage) || null,
        novelId,
        episodeNumber,
        language,
    ]);
}
async function getAudioRecord(novelId, episodeNumber, language) {
    const result = await db_1.default.query(`SELECT * FROM audio_files 
     WHERE novel_id = $1 AND episode_number = $2 AND language = $3`, [novelId, episodeNumber, language]);
    return result.rows[0] || null;
}
async function listEpisodeAudio(novelId, episodeNumber) {
    const result = await db_1.default.query(`SELECT * FROM audio_files 
     WHERE novel_id = $1 AND episode_number = $2 
     ORDER BY language`, [novelId, episodeNumber]);
    return result.rows;
}
async function getFailedAudio(limit = 100) {
    const result = await db_1.default.query(`SELECT * FROM audio_files 
     WHERE status = 'FAILED' 
     ORDER BY updated_at DESC 
     LIMIT $1`, [limit]);
    return result.rows;
}
function calculateDuration(audioData) {
    return Math.floor(audioData.length / 8000);
}
