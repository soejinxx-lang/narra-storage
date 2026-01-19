import fs from "fs/promises";
import path from "path";
import db from "../db";

const AUDIO_ROOT = process.env.AUDIO_ROOT || "/app/audio";

export interface AudioRecord {
  id: string;
  novel_id: string;
  episode: number;
  lang: string;
  voice: string;
  file_path: string;
  created_at: Date;
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
  const filePath = path.join(AUDIO_ROOT, novelId, String(episodeNumber), `${language}.mp3`);
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
  const filePath = path.join(AUDIO_ROOT, novelId, String(episodeNumber), `${language}.mp3`);
  try {
    const stats = await fs.stat(filePath);
    return stats.size;
  } catch {
    return null;
  }
}

export async function createAudioRecord(
  novelId: string,
  episode: number,
  lang: string,
  voice: string,
  filePath: string
): Promise<string> {
  const result = await db.query(
    `INSERT INTO audio_files (novel_id, episode, lang, voice, file_path)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (novel_id, episode, lang, voice)
    DO UPDATE SET file_path = EXCLUDED.file_path, voice = EXCLUDED.voice, created_at = NOW()
    RETURNING id`,
    [novelId, episode, lang, voice, filePath]
  );
  return result.rows[0].id;
}

export async function deleteAudioRecord(
  novelId: string,
  episode: number,
  lang: string,
  voice?: string
): Promise<void> {
  if (voice) {
    await db.query(
      `DELETE FROM audio_files WHERE novel_id = $1 AND episode = $2 AND lang = $3 AND voice = $4`,
      [novelId, episode, lang, voice]
    );
    return;
  }

  await db.query(
    `DELETE FROM audio_files WHERE novel_id = $1 AND episode = $2 AND lang = $3`,
    [novelId, episode, lang]
  );
}

export async function getAudioRecord(
  novelId: string,
  episode: number,
  lang: string
): Promise<AudioRecord | null> {
  const result = await db.query(
    `SELECT * FROM audio_files
     WHERE novel_id = $1 AND episode = $2 AND lang = $3
     ORDER BY created_at DESC
     LIMIT 1`,
    [novelId, episode, lang]
  );
  return result.rows[0] || null;
}

export async function listEpisodeAudio(
  novelId: string,
  episode: number
): Promise<AudioRecord[]> {
  const result = await db.query(
    `SELECT * FROM audio_files WHERE novel_id = $1 AND episode = $2 ORDER BY lang`,
    [novelId, episode]
  );
  return result.rows;
}

export function calculateDuration(audioData: Buffer): number {
  return Math.floor(audioData.length / 8000);
}
