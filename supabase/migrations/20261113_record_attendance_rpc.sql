CREATE OR REPLACE FUNCTION record_attendance_v1(
  p_school_id uuid, p_student_id uuid, p_status text,
  p_recorded_by uuid, p_gate text, p_recorded_on date,
  p_event_type text, p_message text, p_tone text
) RETURNS void AS $$
BEGIN
  INSERT INTO attendance_records (school_id, student_id, status, recorded_by, gate, recorded_on)
  VALUES (p_school_id, p_student_id, p_status, p_recorded_by, p_gate, p_recorded_on)
  ON CONFLICT (school_id, student_id, recorded_on)
  DO UPDATE SET status = EXCLUDED.status, recorded_by = EXCLUDED.recorded_by, gate = EXCLUDED.gate;

  INSERT INTO activity_events (school_id, actor_id, event_type, message, tone)
  VALUES (p_school_id, p_recorded_by, p_event_type, p_message, p_tone);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION record_bulk_attendance_v1(
  p_school_id uuid, p_student_ids uuid[], p_status text,
  p_recorded_by uuid, p_gate text, p_recorded_on date,
  p_event_type text, p_message text, p_tone text
) RETURNS void AS $$
BEGIN
  INSERT INTO attendance_records (school_id, student_id, status, recorded_by, gate, recorded_on)
  SELECT p_school_id, unnest(p_student_ids), p_status, p_recorded_by, p_gate, p_recorded_on
  ON CONFLICT (school_id, student_id, recorded_on)
  DO UPDATE SET status = EXCLUDED.status, recorded_by = EXCLUDED.recorded_by, gate = EXCLUDED.gate;

  INSERT INTO activity_events (school_id, actor_id, event_type, message, tone)
  VALUES (p_school_id, p_recorded_by, p_event_type, p_message, p_tone);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
