export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UnitStatus = 'to_do' | 'in_progress' | 'needs_review' | 'approved';
export type WalkthroughStatus = 'draft' | 'submitted' | 'approved';

type TableDef<Row extends Record<string, unknown>> = {
  Row: Row;
  Insert: Partial<Row> & Record<string, unknown>;
  Update: Partial<Row>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      properties: TableDef<{
        id: string;
        name: string;
        created_at: string;
      }>;
      units: TableDef<{
        id: string;
        property_id: string;
        unit_number: string;
        status: UnitStatus;
        assigned_to: string | null;
        verified_sqft: number | null;
      }>;
      walkthroughs: TableDef<{
        id: string;
        unit_id: string;
        crew_id: string;
        status: WalkthroughStatus;
        issues_count: number;
        created_at: string;
      }>;
      crew: TableDef<{
        id: string;
        name: string;
        role: string;
      }>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type Property = Database['public']['Tables']['properties']['Row'];
export type Unit = Database['public']['Tables']['units']['Row'];
export type Walkthrough = Database['public']['Tables']['walkthroughs']['Row'];
export type Crew = Database['public']['Tables']['crew']['Row'];
