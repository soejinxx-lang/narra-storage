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
from translation_core.paragraph_editor_ko import restructure_paragraphs_ko
from translation_core.paragraph_editor_en import restructure_paragraphs_en
from translation_core.paragraph_editor_ja import restructure_paragraphs_ja
from translation_core.paragraph_editor_zh import restructure_paragraphs_zh
from translation_core.paragraph_editor_es import restructure_paragraphs_es
from translation_core.paragraph_editor_fr import restructure_paragraphs_fr
from translation_core.paragraph_editor_de import restructure_paragraphs_de
from translation_core.paragraph_editor_pt import restructure_paragraphs_pt
from translation_core.paragraph_editor_id import restructure_paragraphs_id

def restructure_paragraphs_only(text: str, target_language: str) -> str:
    """
    문단 편집만 수행 (번역 없음)
    Worker가 청크 병합 후 호출
    """
    print(f"[Python] Starting paragraph restructuring for {target_language}...", file=sys.stderr)
    
    if target_language == "ko":
        result = restructure_paragraphs_ko(text)
    elif target_language == "en":
        result = restructure_paragraphs_en(text)
    elif target_language == "ja":
        result = restructure_paragraphs_ja(text)
    elif target_language == "zh":
        result = restructure_paragraphs_zh(text)
    elif target_language == "es":
        result = restructure_paragraphs_es(text)
    elif target_language == "fr":
        result = restructure_paragraphs_fr(text)
    elif target_language == "de":
        result = restructure_paragraphs_de(text)
    elif target_language == "pt":
        result = restructure_paragraphs_pt(text)
    elif target_language == "id":
        result = restructure_paragraphs_id(text)
    else:
        print(f"[Python] No paragraph editor for {target_language}, returning original", file=sys.stderr)
        result = text
    
    print(f"[Python] Paragraph restructuring complete", file=sys.stderr)
    return result

def main():
    parser = argparse.ArgumentParser(description='Translate text using translation_core')
    parser.add_argument('--mode', default='translate', choices=['translate', 'restructure'], 
                        help='Mode: translate (full pipeline) or restructure (paragraph editing only)')
    parser.add_argument('--title', help='Novel title (required for translate mode)')
    parser.add_argument('--text', required=True, help='Text to translate or restructure')
    parser.add_argument('--source', default='ko', help='Source language (default: ko)')
    parser.add_argument('--target', default='en', help='Target language (default: en)')
    
    args = parser.parse_args()

    try:
        if args.mode == 'restructure':
            # 문단 편집만 수행
            result = restructure_paragraphs_only(args.text, args.target)
        else:
            # 전체 번역 파이프라인
            if not args.title:
                print("Error: --title is required for translate mode", file=sys.stderr)
                sys.exit(1)
            
            result = translate_text(
                title=args.title,
                text=args.text,
                source_language=args.source,
                target_language=args.target
            )
        
        # Output only the result (no extra logging)
        print(result, end='')
        sys.exit(0)
        
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
