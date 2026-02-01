# CHANGELOG

## 2026-02-01

### Cost Optimization: Translation Pipeline
**Changed STAGE 2 and STAGE 5 to GPT-4o-mini**

- **Files Modified:**
  - `worker/translation_core/pipeline.py` - STAGE 2 (Editing) → GPT-4o-mini
  - `worker/translation_core/paragraph_editor_*.py` (9 languages) - STAGE 5 (Rhythm) → GPT-4o-mini

- **Impact:**
  - Cost reduction: ~30% ($1,500/month → $1,050/month)
  - Quality: Maintained (STAGE 1 Translation and STAGE 3 Advanced Editing still use GPT-4o)

- **Rationale:**
  - STAGE 1 (Translation) is the core and must use GPT-4o
  - STAGE 2 (Editing) is simple polishing, GPT-4o-mini is sufficient
  - STAGE 5 (Rhythm) is rule-based + GPT validation, GPT-4o-mini is sufficient
  - STAGE 3 (Advanced Editing) remains GPT-4o for quality

---

### Simplified View Count System
**Removed Ghost Pool system, implemented straightforward +1 increment**

- **Files Modified:**
  - `app/api/episodes/[id]/view/route.ts` - Simplified to basic increment
  - `app/db.ts` - Added `ghost_pool` column (unused, for future use)

- **Previous System:**
  - Complex ghost pool with random generation (1-100 ghosts)
  - Time-based ghost arrival (5-30 minute intervals)
  - Required cron jobs for automatic increments

- **New System:**
  - Click → `views + 1`
  - Simple, honest, straightforward
  - No background jobs needed

- **Rationale:**
  - Ghost pool system was too complex for current needs
  - Required additional infrastructure (cron jobs)
  - Honest metrics are better for analytics

---

### Fixed View Count API
**Added missing proxy API route in narra-web**

- **Files Modified:**
  - `narra-web/app/api/episodes/[id]/view/route.ts` - Created proxy to Storage API

- **Issue:**
  - EpisodeReader was calling `/api/episodes/[id]/view` but route didn't exist in narra-web
  - Requests were failing silently (404)

- **Solution:**
  - Created proxy route that forwards to Storage API
  - Uses `NEXT_PUBLIC_STORAGE_API_URL` environment variable
