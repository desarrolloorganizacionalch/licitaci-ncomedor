export type Role = "evaluador" | "admin";
export type Score = 0 | 5 | 10;

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  active: boolean;
  created_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  active: boolean;
  sort_order: number;
}

export interface Criterion {
  id: number;
  code: string;
  title: string;
  instruction: string;
  good_desc: string;
  regular_desc: string;
  bad_desc: string;
}

export interface Answer {
  criterion_id: number;
  score: Score;
  observation: string | null;
}

export interface Evaluation {
  id: string;
  evaluator_id: string | null;
  evaluator_name: string;
  evaluator_key?: string | null;
  supplier_id: string;
  visit_date: string;
  total_score: number;
  created_at: string;
  updated_at: string;
  evaluation_answers?: Answer[];
}

export interface AllowedUser {
  email: string;
  full_name: string;
  role: Role;
  created_at: string;
}
