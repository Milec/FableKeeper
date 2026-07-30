-- ---------------------------------------------------------------------------
-- 0009 — add the 'town' world entry type
--
-- The vocabulary only had city and village, which forces every settlement to
-- one extreme. It matters most for map imports: the median settlement on a
-- generated Azgaar map sits near 3,700 people, so with only two types either
-- two thirds of a map becomes "cities" or every market town is filed as a
-- village.
--
-- `alter type ... add value` is transaction-safe on PG12+ as long as the new
-- value isn't also *used* in the same transaction; nothing here does.
-- `if not exists` keeps the migration re-runnable.
-- ---------------------------------------------------------------------------

alter type public.world_entry_type add value if not exists 'town' after 'city';
