/**
 * Hand-authored database types for the Phase 1 schema.
 *
 * These mirror `supabase/migrations`. Once the schema stabilises they can be
 * regenerated with `supabase gen types typescript` (or the Supabase MCP
 * `generate_typescript_types` tool) to stay perfectly in sync.
 */

export type CampaignRole =
  | "owner"
  | "game_master"
  | "assistant_gm"
  | "player"
  | "viewer";

/** World Builder entry categories (see the request's World Builder module). */
export type WorldEntryType =
  | "world"
  | "continent"
  | "region"
  | "nation"
  | "kingdom"
  | "province"
  | "city"
  | "village"
  | "landmark"
  | "dungeon"
  | "ruin"
  | "organization"
  | "noble_house"
  | "guild"
  | "religion"
  | "pantheon"
  | "culture"
  | "language"
  | "historical_event"
  | "npc"
  | "monster"
  | "item"
  | "book"
  | "note"
  | "article";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      campaigns: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          slug: string;
          description: string | null;
          system: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          slug: string;
          description?: string | null;
          system?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["campaigns"]["Insert"]>;
        Relationships: [];
      };
      campaign_members: {
        Row: {
          id: string;
          campaign_id: string;
          user_id: string;
          role: CampaignRole;
          created_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          user_id: string;
          role?: CampaignRole;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["campaign_members"]["Insert"]
        >;
        Relationships: [];
      };
      campaign_invites: {
        Row: {
          id: string;
          campaign_id: string;
          email: string;
          role: CampaignRole;
          token: string;
          invited_by: string;
          expires_at: string;
          accepted_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          email: string;
          role?: CampaignRole;
          token?: string;
          invited_by: string;
          expires_at?: string;
          accepted_at?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["campaign_invites"]["Insert"]
        >;
        Relationships: [];
      };
      worlds: {
        Row: {
          id: string;
          campaign_id: string;
          name: string;
          slug: string;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          name: string;
          slug: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["worlds"]["Insert"]>;
        Relationships: [];
      };
      world_entries: {
        Row: {
          id: string;
          world_id: string;
          campaign_id: string;
          type: WorldEntryType;
          title: string;
          slug: string;
          summary: string | null;
          content: Json;
          is_secret: boolean;
          tags: string[];
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          world_id: string;
          campaign_id: string;
          type: WorldEntryType;
          title: string;
          slug: string;
          summary?: string | null;
          content?: Json;
          is_secret?: boolean;
          tags?: string[];
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["world_entries"]["Insert"]
        >;
        Relationships: [];
      };
      entry_links: {
        Row: {
          id: string;
          source_entry_id: string;
          target_entry_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          source_entry_id: string;
          target_entry_id: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["entry_links"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      /** Returns the caller's role in a campaign, or null if not a member. */
      campaign_role: {
        Args: { p_campaign_id: string };
        Returns: CampaignRole | null;
      };
      /** True if the caller is a member of the given campaign. */
      is_campaign_member: {
        Args: { p_campaign_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      campaign_role: CampaignRole;
      world_entry_type: WorldEntryType;
    };
    CompositeTypes: Record<never, never>;
  };
}

// Convenience row aliases.
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Campaign = Database["public"]["Tables"]["campaigns"]["Row"];
export type CampaignMember =
  Database["public"]["Tables"]["campaign_members"]["Row"];
export type World = Database["public"]["Tables"]["worlds"]["Row"];
export type WorldEntry = Database["public"]["Tables"]["world_entries"]["Row"];
