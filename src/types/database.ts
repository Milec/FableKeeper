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
  | "town"
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

export type QuestStatus = "active" | "completed" | "failed" | "on_hold";

/** PF2E ability score keys. */
export interface AbilityScores {
  str?: number;
  dex?: number;
  con?: number;
  int?: number;
  wis?: number;
  cha?: number;
}

/** Commonly-surfaced derived defenses stored on a character. */
export interface CharacterDefenses {
  ac?: number;
  hp_max?: number;
  hp_current?: number;
  speed?: number;
  perception?: number;
  class_dc?: number;
}

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
      maps: {
        Row: {
          id: string;
          campaign_id: string;
          world_id: string | null;
          name: string;
          description: string | null;
          image_url: string | null;
          source: Json;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          world_id?: string | null;
          name: string;
          description?: string | null;
          image_url?: string | null;
          source?: Json;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          description?: string | null;
          image_url?: string | null;
          world_id?: string | null;
          source?: Json;
        };
        Relationships: [];
      };
      map_pins: {
        Row: {
          id: string;
          map_id: string;
          campaign_id: string;
          entry_id: string | null;
          label: string;
          kind: string;
          x: number;
          y: number;
          is_revealed: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          map_id: string;
          campaign_id: string;
          entry_id?: string | null;
          label: string;
          kind?: string;
          x: number;
          y: number;
          is_revealed?: boolean;
          created_at?: string;
        };
        Update: {
          label?: string;
          kind?: string;
          x?: number;
          y?: number;
          is_revealed?: boolean;
          entry_id?: string | null;
        };
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
      characters: {
        Row: {
          id: string;
          campaign_id: string;
          owner_id: string;
          name: string;
          ancestry: string | null;
          heritage: string | null;
          background: string | null;
          class: string | null;
          level: number;
          key_ability: string | null;
          portrait_url: string | null;
          abilities: Json;
          defenses: Json;
          data: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          owner_id: string;
          name: string;
          ancestry?: string | null;
          heritage?: string | null;
          background?: string | null;
          class?: string | null;
          level?: number;
          key_ability?: string | null;
          portrait_url?: string | null;
          abilities?: Json;
          defenses?: Json;
          data?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["characters"]["Insert"]>;
        Relationships: [];
      };
      sessions: {
        Row: {
          id: string;
          campaign_id: string;
          title: string;
          session_date: string | null;
          content: Json;
          is_secret: boolean;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          title: string;
          session_date?: string | null;
          content?: Json;
          is_secret?: boolean;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["sessions"]["Insert"]>;
        Relationships: [];
      };
      quests: {
        Row: {
          id: string;
          campaign_id: string;
          title: string;
          content: Json;
          status: QuestStatus;
          is_secret: boolean;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          title: string;
          content?: Json;
          status?: QuestStatus;
          is_secret?: boolean;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["quests"]["Insert"]>;
        Relationships: [];
      };
      encounters: {
        Row: {
          id: string;
          campaign_id: string;
          name: string;
          party_size: number;
          party_level: number;
          target_threat: string;
          combatants: Json;
          notes: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          name: string;
          party_size?: number;
          party_level?: number;
          target_threat?: string;
          combatants?: Json;
          notes?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["encounters"]["Insert"]>;
        Relationships: [];
      };
      roll_tables: {
        Row: {
          id: string;
          campaign_id: string;
          name: string;
          description: string | null;
          folder: string | null;
          tags: string[];
          entries: Json;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          name: string;
          description?: string | null;
          folder?: string | null;
          tags?: string[];
          entries?: Json;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["roll_tables"]["Insert"]>;
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
      quest_status: QuestStatus;
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
export type CampaignMap = Database["public"]["Tables"]["maps"]["Row"];
export type MapPin = Database["public"]["Tables"]["map_pins"]["Row"];
export type WorldEntry = Database["public"]["Tables"]["world_entries"]["Row"];
export type Character = Database["public"]["Tables"]["characters"]["Row"];
export type Session = Database["public"]["Tables"]["sessions"]["Row"];
export type Quest = Database["public"]["Tables"]["quests"]["Row"];
export type Encounter = Database["public"]["Tables"]["encounters"]["Row"];
export type RollTable = Database["public"]["Tables"]["roll_tables"]["Row"];
