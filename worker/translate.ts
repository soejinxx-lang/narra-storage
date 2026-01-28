/**
 * TypeScript-Python Bridge for Translation
 * 
 * Calls Python translation_core pipeline from Node.js Worker
 */

import { spawn } from 'child_process';
import * as path from 'path';

export interface TranslateOptions {
    novelTitle: string;
    text: string;
    sourceLanguage?: string;
    targetLanguage: string;
}

/**
 * Translate text using Python translation_core pipeline
 * 
 * @param options Translation options
 * @returns Translated text
 */
export async function translateWithPython(options: TranslateOptions): Promise<string> {
    const {
        novelTitle,
        text,
        sourceLanguage = 'ko',
        targetLanguage
    } = options;

    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, 'translate_cli.py');

        const python = spawn('python3', [
            scriptPath,
            '--title', novelTitle,
            '--text', text,
            '--source', sourceLanguage,
            '--target', targetLanguage
        ], {
            env: {
                ...process.env,
                PYTHONUNBUFFERED: '1'  // Disable Python output buffering
            }
        });

        let stdout = '';
        let stderr = '';

        python.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        python.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        python.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`Python translation failed (exit code ${code}): ${stderr}`));
            } else {
                resolve(stdout);
            }
        });

        python.on('error', (err) => {
            reject(new Error(`Failed to spawn Python process: ${err.message}`));
        });
    });
}
