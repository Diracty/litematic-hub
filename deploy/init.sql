CREATE TABLE IF NOT EXISTS litematic_files (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  session_id TEXT NOT NULL,
  name TEXT NOT NULL,
  original_filename TEXT,
  size_bytes INTEGER NOT NULL,
  part_count INTEGER NOT NULL DEFAULT 0,
  block_count INTEGER NOT NULL DEFAULT 0,
  entity_count INTEGER NOT NULL DEFAULT 0,
  block_entity_count INTEGER NOT NULL DEFAULT 0,
  region_count INTEGER NOT NULL DEFAULT 0,
  block_types JSONB DEFAULT '{}',
  entity_types JSONB DEFAULT '{}',
  block_entity_types JSONB DEFAULT '{}',
  dimensions_x INTEGER DEFAULT 0,
  dimensions_y INTEGER DEFAULT 0,
  dimensions_z INTEGER DEFAULT 0,
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS litematic_files_session_idx ON litematic_files (session_id);
CREATE INDEX IF NOT EXISTS litematic_files_key_idx ON litematic_files (key);

CREATE TABLE IF NOT EXISTS litematic_parts (
  id SERIAL PRIMARY KEY,
  file_key TEXT NOT NULL REFERENCES litematic_files (key) ON DELETE CASCADE,
  part_number INTEGER NOT NULL,
  data TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS litematic_parts_key_idx ON litematic_parts (file_key);
