-- ============================================================
-- Nova FM — Programação no banco (fonte única da verdade)
-- Rode em produção:
--   wrangler d1 execute novafm-sorteios --remote --file=./migracao-programacao.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS programacao (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  nome   TEXT    NOT NULL,
  inicio TEXT    NOT NULL,          -- 'HH:MM'
  fim    TEXT    NOT NULL,          -- 'HH:MM'
  ativo  INTEGER NOT NULL DEFAULT 1,
  ordem  INTEGER NOT NULL DEFAULT 0
);

-- Zera e recarrega com a grade ATUAL (14/07/2026)
DELETE FROM programacao;
INSERT INTO programacao (nome, inicio, fim, ativo, ordem) VALUES
  ('Manhã da Nova',        '08:00', '10:00', 1, 1),
  ('Papo de Comadre',      '10:00', '12:00', 1, 2),
  ('Almoçando com a Nova', '12:00', '13:00', 1, 3),
  ('Salada Mista',         '13:00', '16:00', 1, 4),
  ('Boteco da Nova',       '16:00', '19:00', 1, 5),
  ('Voz do Brasil',        '19:00', '20:00', 1, 6),
  ('Bailão da Nova',       '20:00', '22:00', 1, 7);
