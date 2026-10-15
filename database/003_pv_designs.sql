CREATE TABLE pv_designs (
  id uuid PRIMARY KEY,
  content jsonb NOT NULL,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
