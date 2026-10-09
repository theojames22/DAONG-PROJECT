export type Role = "employee" | "admin";
export type OutputStatus = "pending" | "checking" | "done";
export type AttachmentType = "file" | "link" | "image";
export type DayStatus = "present" | "unverified" | "incomplete" | "absent";

// Admin dashboard additions
export type ProjectStatus = "pending" | "approved" | "rejected";
export type ThemePreference = "light" | "dark";

export interface Profile {
  id: string;
  full_name: string | null;
  position: string | null;
  role: Role;
  required_weekly_hours: number;
  email?: string | null;
  profile_picture_url?: string | null;
  theme_preference?: ThemePreference;
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
  reviewed_by?: string | null;
  created_at?: string;
  reviewer?: { full_name: string | null } | null;
}

export interface Project {
  id: string;
  title: string;
  description: string | null;
  file_url: string;
  status: ProjectStatus;
  submitted_by: string;
  reviewed_by: string | null;
  reviewer_notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields (from `sender:profiles!...` / `reviewer:profiles!...`)
  submitter?: { full_name: string | null; position: string | null } | null;
  reviewer?: { full_name: string | null } | null;
}

export interface Notification {
  id: string;
  sender_id: string;
  receiver_id: string;
  message: string;
  project_id: string | null;
  is_read: boolean;
  created_at: string;
  // Joined fields (from `sender:profiles!...` / `project:projects(...)`)
  sender?: { full_name: string | null } | null;
  project?: { id: string; title: string; status: ProjectStatus } | null;
}
