export type Role = "employee" | "admin";
export type OutputStatus = "pending" | "checking" | "done";
export type AttachmentType = "file" | "link" | "image";
export type DayStatus = "present" | "unverified" | "incomplete" | "absent";

export interface Profile {
  id: string;
  full_name: string | null;
  position: string | null;
  role: Role;
  required_weekly_hours: number;
}

export interface Session {
  id: string;
  employee_id: string;
  time_in: string; // ISO timestamp
  time_out: string | null; // null = still clocked in
}

export interface Output {
  id: string;
  employee_id: string;
  date: string; // YYYY-MM-DD
  title: string | null;
  attachment_type: AttachmentType;
  attachment_url: string;
  status: OutputStatus;
  reviewer_notes: string | null;
}
