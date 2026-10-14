CREATE TABLE sites (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  customer text NOT NULL,
  location text NOT NULL,
  capacity_kw double precision NOT NULL CHECK (capacity_kw > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE inspections (
  id uuid PRIMARY KEY,
  site_id uuid NOT NULL REFERENCES sites(id),
  title text NOT NULL,
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'completed')),
  is_demo boolean NOT NULL DEFAULT false,
  checklist jsonb NOT NULL DEFAULT '{"photos":false,"components":false,"handover":false}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE photos (
  id uuid PRIMARY KEY,
  inspection_id uuid NOT NULL REFERENCES inspections(id),
  filename text NOT NULL,
  object_key text NOT NULL UNIQUE,
  width integer NOT NULL CHECK (width > 0),
  height integer NOT NULL CHECK (height > 0),
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE findings (
  id uuid PRIMARY KEY,
  photo_id uuid NOT NULL REFERENCES photos(id),
  label text NOT NULL,
  box jsonb NOT NULL,
  notes text NOT NULL DEFAULT '',
  source text NOT NULL CHECK (source IN ('manual', 'demo', 'model')),
  score double precision CHECK (score BETWEEN 0 AND 1),
  model_version text,
  resolved boolean NOT NULL DEFAULT false,
  resolution_notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE reviews (
  id uuid PRIMARY KEY,
  finding_id uuid NOT NULL REFERENCES findings(id),
  decision text NOT NULL CHECK (decision IN ('accepted', 'rejected')),
  priority text NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
  notes text NOT NULL DEFAULT '',
  reviewer text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sequence bigint GENERATED ALWAYS AS IDENTITY
);
CREATE TABLE audit_events (
  id uuid PRIMARY KEY,
  inspection_id uuid NOT NULL REFERENCES inspections(id),
  actor text NOT NULL,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inspections_site ON inspections(site_id);
CREATE INDEX photos_inspection ON photos(inspection_id);
CREATE INDEX findings_photo ON findings(photo_id);
CREATE INDEX reviews_latest ON reviews(finding_id, sequence DESC);
CREATE INDEX audit_inspection ON audit_events(inspection_id, created_at);
