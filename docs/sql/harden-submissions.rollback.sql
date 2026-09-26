-- 還原 harden-submissions.sql（移除 trigger 與函式）。可重複執行；不會動任何資料。
DROP TRIGGER IF EXISTS rolematch_guard_submission ON submissions;
DROP FUNCTION IF EXISTS rolematch_guard_submission();
