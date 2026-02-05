-- Add report fields to projects
-- Run this AFTER migrations/001_init.sql

alter table public.projects
  add column if not exists report_bucket text,
  add column if not exists report_path text,
  add column if not exists report_mime_type text,
  add column if not exists report_byte_size bigint,
  add column if not exists report_generated_at timestamptz,
  add column if not exists report_error text;
