"use strict";
/**
 * TypeScript-Python Bridge for Translation
 *
 * Calls Python translation_core pipeline from Node.js Worker
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.translateWithPython = translateWithPython;
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
/**
 * Translate text using Python translation_core pipeline
 *
 * @param options Translation options
 * @returns Translated text
 */
async function translateWithPython(options) {
    const { novelTitle, text, sourceLanguage = 'ko', targetLanguage } = options;
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, 'translate_cli.py');
        const python = (0, child_process_1.spawn)('python', [
            scriptPath,
            '--title', novelTitle,
            '--text', text,
            '--source', sourceLanguage,
            '--target', targetLanguage
        ], {
            env: Object.assign(Object.assign({}, process.env), { PYTHONUNBUFFERED: '1' // Disable Python output buffering
             })
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
            }
            else {
                resolve(stdout);
            }
        });
        python.on('error', (err) => {
            reject(new Error(`Failed to spawn Python process: ${err.message}`));
        });
    });
}
