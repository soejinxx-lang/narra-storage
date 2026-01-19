import fs from "fs/promises";
import path from "path";
import db from "../db";

const AUDIO_ROOT = process.env.AUDIO_ROOT || "/app/audio";

export interface AudioRecord {
  id: string;
  novel_id: string;
  episode_number: number;
  language: string;
  audio_url: string | null;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  status: "PENDING" | "PROCESSING" | "DONE" | "FAILED";
  error_message: string | null;
  voice_name: string | null;
  created_at: Date;
  updated_at: Date;
}

export async function saveAudioFile(
  novelId: string,
  episodeNumber: number,
  language: string,
  audioData: Buffer
): Promise<string> {
  const episodeDir = path.join(AUDIO_ROOT, novelId, String(episodeNumber));
  await fs.mkdir(episodeDir, { recursive: true });
  const filePath = path.join(episodeDir, `${language}.mp3`);
  await fs.writeFile(filePath, audioData);
  return `/api/audio/files/${novelId}/${episodeNumber}/${language}`;
}

export async function deleteAudioFile(
  novelId: string,
  episodeNumber: number,
  language: string
): Promise<boolean> {
  const filePath = path.join(
    AUDIO_ROOT,
    novelId,
    String(episodeNumber),
    `${language}.mp3`
  );
  try {
    await fs.unlink(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function getAudioFileSize(
  novelId: string,
  episodeNumber: number,
  language: string
): Promise<number | null> {
  const filePath = path.join(
    AUDIO_ROOT,
    novelId,
    String(episodeNumber),
    `${language}.mp3`
  );
  try {
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch {
    return null;
  }
}

export async function createAudioRecord(
  novelId: string,
  episodeNumber: number,
  language: string,
  voiceName: string
): Promise<string> {
  const result = await db.query(
    `INSERT INTO audio_files (novel_id, episode_number, language, voice_name, status)
    VALUES ($1, $2, $3, $4, 'PENDING')
    ON CONFLICT (novel_id, episode_number, language)
    DO UPDATE SET 
      voice_name = EXCLUDED.voice_name, 
      status = 'PENDING', 
      error_message = NULL, 
      updated_at = NOW()
    RETURNING id`,
    [novelId, episodeNumber, language, voiceName]
  );
  return result.rows[0].id;
}

export async function updateAudioStatus(
  novelId: string,
  episodeNumber: number,
  language: string,
  status: "PROCESSING" | "DONE" | "FAILED" | "PENDING",
  updates?: {
    audioUrl?: string;
    durationSeconds?: number;
    fileSizeBytes?: number;
    errorMessage?: string;
  }
): Promise<void> {
  await db.query(
    `UPDATE audio_files
    SET status = $1, 
        audio_url = COALESCE($2, audio_url), 
        duration_seconds = COALESCE($3, duration_seconds),
        file_size_bytes = COALESCE($4, file_size_bytes), 
        error_message = $5, 
        updated_at = NOW()
    WHERE novel_id = $6 AND episode_number = $7 AND language = $8`,
    [
      status,
      updates?.audioUrl || null,
      updates?.durationSeconds || null,
      updates?.fileSizeBytes || null,
      updates?.errorMessage || null,
      novelId,
      episodeNumber,
      language,
    ]
  );
}

export async function getAudioRecord(
  novelId: string,
  episodeNumber: number,
  language: string
): Promise<AudioRecord | null> {
  const result = await db.query(
    `SELECT * FROM audio_files 
     WHERE novel_id = $1 AND episode_number = $2 AND language = $3`,
    [novelId, episodeNumber, language]
  );
  return result.rows[0] || null;
}

export async function listEpisodeAudio(
  novelId: string,
  episodeNumber: number
): Promise<AudioRecord[]> {
  const result = await db.query(
    `SELECT * FROM audio_files 
     WHERE novel_id = $1 AND episode_number = $2 
     ORDER BY language`,
    [novelId, episodeNumber]
  );
  return result.rows;
}

export async function getFailedAudio(limit: number = 100): Promise<AudioRecord[]> {
  const result = await db.query(
    `SELECT * FROM audio_files 
     WHERE status = 'FAILED' 
     ORDER BY updated_at DESC 
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

export function calculateDuration(audioData: Buffer): number {
  return Math.floor(audioData.length / 8000);
}
