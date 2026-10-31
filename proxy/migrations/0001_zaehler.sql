-- Abfragen je Token und Tag
CREATE TABLE IF NOT EXISTS zaehler (
  token TEXT NOT NULL,
  tag   TEXT NOT NULL,
  n     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (token, tag)
);
