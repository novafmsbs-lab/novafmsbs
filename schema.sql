-- ============================================================
-- Nova FM 87.9 — Sorteador (Cloudflare D1 / SQLite)
-- ============================================================

PRAGMA foreign_keys = ON;

-- ---------- Ouvintes ----------
-- Uma pessoa = um WhatsApp. Esta é a âncora anti-duplicata.
CREATE TABLE IF NOT EXISTS ouvintes (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  whatsapp       TEXT    NOT NULL UNIQUE,        -- só dígitos: 47999999999
  nome           TEXT    NOT NULL,
  vitorias       INTEGER NOT NULL DEFAULT 0,
  ultima_vitoria TEXT,                           -- ISO date; base da carência
  bloqueado      INTEGER NOT NULL DEFAULT 0,     -- 1 = fora dos sorteios (equipe, fraude)
  criado_em      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------- Promoções ----------
CREATE TABLE IF NOT EXISTS promocoes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  nome          TEXT    NOT NULL,
  premio        TEXT,
  escopo        TEXT    NOT NULL DEFAULT 'geral',     -- 'geral' | 'programa'
  programa      TEXT,                                  -- preenchido se escopo='programa'
  modo          TEXT    NOT NULL DEFAULT 'cartela',   -- 'cartela' | 'igualdade'
  carencia_dias INTEGER NOT NULL DEFAULT 30,          -- quem ganhou há menos disso, fica de fora
  teto_diario   INTEGER NOT NULL DEFAULT 1,           -- participações por programa, por dia
  status        TEXT    NOT NULL DEFAULT 'aberta',    -- 'aberta' | 'encerrada'
  criado_em     TEXT    NOT NULL DEFAULT (datetime('now')),
  CHECK (escopo IN ('geral','programa')),
  CHECK (modo   IN ('cartela','igualdade')),
  CHECK (status IN ('aberta','encerrada'))
);

-- ---------- Participações ----------
-- O teto é garantido pelo BANCO, não pelo JavaScript:
-- o índice único abaixo impede a mesma pessoa de entrar
-- duas vezes no mesmo programa, no mesmo dia, na mesma promoção.
CREATE TABLE IF NOT EXISTS participacoes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ouvinte_id  INTEGER NOT NULL REFERENCES ouvintes(id)  ON DELETE CASCADE,
  promocao_id INTEGER NOT NULL REFERENCES promocoes(id) ON DELETE CASCADE,
  programa    TEXT    NOT NULL,                   -- detectado pelo horário no servidor
  dia         TEXT    NOT NULL,                   -- YYYY-MM-DD (fuso de São Paulo)
  slot        INTEGER NOT NULL DEFAULT 1,         -- 1..teto_diario
  criado_em   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_part_teto
  ON participacoes (ouvinte_id, promocao_id, programa, dia, slot);

CREATE INDEX IF NOT EXISTS ix_part_promo    ON participacoes (promocao_id);
CREATE INDEX IF NOT EXISTS ix_part_programa ON participacoes (promocao_id, programa);

-- ---------- Sorteios (auditoria) ----------
-- Guarda a "fotografia" do momento do sorteio: quem estava no bolo,
-- quantas chances cada um tinha e a semente aleatória usada.
CREATE TABLE IF NOT EXISTS sorteios (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  promocao_id   INTEGER NOT NULL REFERENCES promocoes(id) ON DELETE CASCADE,
  modo          TEXT    NOT NULL,
  escopo        TEXT    NOT NULL,
  programa      TEXT,
  participantes INTEGER NOT NULL,
  chances       INTEGER NOT NULL,
  seed          TEXT    NOT NULL,                 -- aleatoriedade criptográfica registrada
  snapshot      TEXT    NOT NULL,                 -- JSON: o bolo exato no momento do sorteio
  criado_em     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ganhadores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  sorteio_id INTEGER NOT NULL REFERENCES sorteios(id)  ON DELETE CASCADE,
  ouvinte_id INTEGER NOT NULL REFERENCES ouvintes(id)  ON DELETE CASCADE,
  posicao    INTEGER NOT NULL,                    -- 1, 2, 3...
  suplente   INTEGER NOT NULL DEFAULT 0           -- 1 = suplente
);

CREATE INDEX IF NOT EXISTS ix_ganh_sorteio ON ganhadores (sorteio_id);

-- ---------- Promoção de exemplo (pode apagar) ----------
INSERT INTO promocoes (nome, premio, escopo, modo, carencia_dias, teto_diario)
SELECT 'Promoção de teste', 'Par de ingressos', 'geral', 'cartela', 30, 1
WHERE NOT EXISTS (SELECT 1 FROM promocoes);
