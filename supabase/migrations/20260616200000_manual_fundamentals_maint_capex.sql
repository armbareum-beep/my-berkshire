-- ENUF — 수기 유지(maintenance)CapEx 추가
-- 정통 오너이익(버핏式) = 순이익 + D&A − 유지CapEx. 공시는 유지/성장 CapEx 를 안 나눠줌 →
-- 기본은 총CapEx 전액(가장 보수적)을 빼지만, 사용자가 유지CapEx 판단값을 넣으면 그걸로 대체.
-- 둘 다 주관적 가정 → 화면에 무엇을 뺐는지 투명하게 표기(§12-1 정직성).

alter table manual_fundamentals
  add column maint_capex numeric check (maint_capex >= 0);
-- 유지CapEx(₩, 수기). null=총CapEx 사용;
