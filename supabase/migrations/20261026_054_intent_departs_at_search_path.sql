-- 054: pin intent_departs_at's search_path (053 left it role-mutable; the
-- Supabase security advisor flags that — function_search_path_mutable).
alter function public.intent_departs_at(date, time, int) set search_path = public;
