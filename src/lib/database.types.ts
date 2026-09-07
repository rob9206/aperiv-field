export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// Field-facing subset of Aperiv's shared database contract. Keep in sync with
// aperiv/lib/database.types.ts and its Field submission migration.
export type Database = {
  public: {
    Tables: {
      properties: {
        Row: {
          id: string;
          name: string;
          address: string;
          region: string;
          units_count: number;
        };
        Insert: {
          id?: string;
          name: string;
          address: string;
          region: string;
          units_count: number;
        };
        Update: {
          id?: string;
          name?: string;
          address?: string;
          region?: string;
          units_count?: number;
        };
        Relationships: [];
      };
      turnovers: {
        Row: {
          id: string;
          unit_id: string;
          stage:
            | 'move_out'
            | 'walkthrough'
            | 'work_orders'
            | 'vendor_review'
            | 'ready';
          started_at: string;
          target_at: string;
          expected_ready_at: string;
          previous_tenant_name: string;
          previous_lease_term: string;
          deposit_amount: number;
          deposit_withheld: number;
          estimated_cost: number;
          actual_cost: number;
        };
        Insert: {
          id?: string;
          unit_id: string;
          stage:
            | 'move_out'
            | 'walkthrough'
            | 'work_orders'
            | 'vendor_review'
            | 'ready';
          started_at: string;
          target_at: string;
          expected_ready_at: string;
          previous_tenant_name: string;
          previous_lease_term: string;
          deposit_amount: number;
          deposit_withheld: number;
          estimated_cost: number;
          actual_cost: number;
        };
        Update: {
          id?: string;
          unit_id?: string;
          stage?:
            | 'move_out'
            | 'walkthrough'
            | 'work_orders'
            | 'vendor_review'
            | 'ready';
          started_at?: string;
          target_at?: string;
          expected_ready_at?: string;
          previous_tenant_name?: string;
          previous_lease_term?: string;
          deposit_amount?: number;
          deposit_withheld?: number;
          estimated_cost?: number;
          actual_cost?: number;
        };
        Relationships: [];
      };
      units: {
        Row: {
          id: string;
          property_id: string;
          unit_number: string;
          building: string | null;
          floor: number | null;
          bedrooms: number | null;
          bathrooms: number | null;
          recorded_sqft: number | null;
          status: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          unit_number: string;
          building: string | null;
          floor: number | null;
          bedrooms: number | null;
          bathrooms: number | null;
          recorded_sqft: number | null;
          status: string;
        };
        Update: {
          id?: string;
          property_id?: string;
          unit_number?: string;
          building?: string | null;
          floor?: number | null;
          bedrooms?: number | null;
          bathrooms?: number | null;
          recorded_sqft?: number | null;
          status?: string;
        };
        Relationships: [];
      };
      walkthroughs: {
        Row: {
          status: 'in_progress' | 'complete';
          source_draft_id: string | null;
          verification_status: 'verified' | 'unverified' | null;
          id: string;
          unit_id: string;
          captured_at: string;
          captured_by: string;
          scan_duration_seconds: number;
          device: string;
          photo_count: number;
          measured_sqft: number;
          condition_summary: string;
          rooms: Json;
          condition_findings: Json;
          total_estimated_amount: number;
        };
        Insert: {
          status?: 'in_progress' | 'complete';
          source_draft_id?: string | null;
          verification_status?: 'verified' | 'unverified' | null;
          id?: string;
          unit_id: string;
          captured_at: string;
          captured_by: string;
          scan_duration_seconds: number;
          device: string;
          photo_count: number;
          measured_sqft: number;
          condition_summary: string;
          rooms: Json;
          condition_findings: Json;
          total_estimated_amount: number;
        };
        Update: {
          status?: 'in_progress' | 'complete';
          source_draft_id?: string | null;
          verification_status?: 'verified' | 'unverified' | null;
          id?: string;
          unit_id?: string;
          captured_at?: string;
          captured_by?: string;
          scan_duration_seconds?: number;
          device?: string;
          photo_count?: number;
          measured_sqft?: number;
          condition_summary?: string;
          rooms?: Json;
          condition_findings?: Json;
          total_estimated_amount?: number;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Property = Database['public']['Tables']['properties']['Row'];
export type Unit = Database['public']['Tables']['units']['Row'];
export type Walkthrough = Database['public']['Tables']['walkthroughs']['Row'];
