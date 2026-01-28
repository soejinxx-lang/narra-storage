#!/usr/bin/env python3
"""
CLI wrapper for translation_core.pipeline.translate_text()
Allows TypeScript Worker to call Python translation logic
"""

import sys
import argparse
import os

# Add parent directory to path to import translation_core
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from translation_core.pipeline import translate_text

def main():
    parser = argparse.ArgumentParser(description='Translate text using translation_core')
    parser.add_argument('--title', required=True, help='Novel title')
    parser.add_argument('--text', required=True, help='Text to translate')
    parser.add_argument('--source', default='ko', help='Source language (default: ko)')
    parser.add_argument('--target', default='en', help='Target language (default: en)')
    
    args = parser.parse_args()

    try:
        result = translate_text(
            title=args.title,
            text=args.text,
            source_language=args.source,
            target_language=args.target
        )
        
        # Output only the translated text (no extra logging)
        print(result, end='')
        sys.exit(0)
        
    except Exception as e:
        print(f"Translation error: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
