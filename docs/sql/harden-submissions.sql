-- ============================================================================
-- 志願分組：填寫志願的資料庫層防護（一次性手動執行，可重複執行）
--
-- 解決的問題（見 docs/checklist-code-review.md 最後一節）：
--   1. 組員「儲存志願」跟主辦方「執行分組」同時發生時，志願會存進資料庫、卻不在分組結果裡
--   2. 兩個人同時搶最後一個名額，可以都成功（多出一人）
--
-- 做法：在 submissions 表加一個 BEFORE INSERT / UPDATE 的 trigger。trigger 一開始先用
--   SELECT ... FOR UPDATE 鎖住這個活動那一列，再檢查「活動是否還在填寫中」與「名額是否已滿」：
--   * 「執行分組」（UPDATE activities SET status = 'finalizing'）要拿同一把鎖 → 兩邊一定有先後，
--     不會再有「志願存進去了、分組卻沒算到」的空隙
--   * 同一個活動的兩個同時送出會依序處理，名額檢查看得到前一筆
--   不符合時丟出自訂錯誤碼，程式會轉成友善的 409 訊息：RM001 = 活動已不接受填寫，RM002 = 名額已滿
--
-- 沒有執行這份 SQL 也不會壞：程式本身的檢查照舊，只是少了這層保險（窗口只有幾十毫秒）。
-- 執行前提：資料表已經存在（部署後打開一次 https://你的網址/api/health 就會自動建立）。
-- 要還原：執行 docs/sql/harden-submissions.rollback.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION rolematch_guard_submission() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  act_status text;
  act_roles  jsonb;
  cap        int;
  cnt        int;
BEGIN
  -- 鎖住活動那一列（跟「執行分組」互斥；同活動的兩個同時送出依序處理）
  SELECT status, roles INTO act_status, act_roles
    FROM activities WHERE id = NEW.activity_id FOR UPDATE;

  -- 找不到活動：交給外鍵去報錯，這裡不攔
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF act_status <> 'open' THEN
    RAISE EXCEPTION 'activity is not open for submissions' USING ERRCODE = 'RM001';
  END IF;

  -- 名額只在「新增」時檢查（修改自己的志願不佔新名額）
  IF TG_OP = 'INSERT' THEN
    SELECT COALESCE(sum((r->>'capacity')::int), 0) INTO cap
      FROM jsonb_array_elements(act_roles) AS r;
    SELECT count(*) INTO cnt FROM submissions WHERE activity_id = NEW.activity_id;
    IF cnt >= cap THEN
      RAISE EXCEPTION 'activity is full' USING ERRCODE = 'RM002';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rolematch_guard_submission ON submissions;

CREATE TRIGGER rolematch_guard_submission
  BEFORE INSERT OR UPDATE OF prefs ON submissions
  FOR EACH ROW EXECUTE FUNCTION rolematch_guard_submission();
