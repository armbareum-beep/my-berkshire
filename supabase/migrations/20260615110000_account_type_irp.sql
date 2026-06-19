-- 계좌 유형에 IRP 추가. 기존 PENSION 은 '연금저축'으로 사용(라벨은 앱에서).
-- IRP 와 연금저축은 한도·세제가 다른 별개 계좌라 유형을 분리한다.
alter type account_type add value if not exists 'IRP';
