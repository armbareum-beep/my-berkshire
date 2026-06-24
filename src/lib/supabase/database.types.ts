export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      krx_index_stats_cache: {
        Row: {
          symbol: string
          per: number | null
          pbr: number | null
          eps: number | null
          dividend_yield: number | null
          listed_count: number | null
          synced_at: string
        }
        Insert: {
          symbol: string
          per?: number | null
          pbr?: number | null
          eps?: number | null
          dividend_yield?: number | null
          listed_count?: number | null
          synced_at?: string
        }
        Update: {
          symbol?: string
          per?: number | null
          pbr?: number | null
          eps?: number | null
          dividend_yield?: number | null
          listed_count?: number | null
          synced_at?: string
        }
        Relationships: []
      }
      kis_security_master: {
        Row: {
          symbol: string
          name_ko: string
          name_en: string | null
          exchange: string | null
          market: string
          asset_type: string | null
          source_date: string | null
          fetched_at: string
        }
        Insert: {
          symbol: string
          name_ko: string
          name_en?: string | null
          exchange?: string | null
          market: string
          asset_type?: string | null
          source_date?: string | null
          fetched_at?: string
        }
        Update: {
          symbol?: string
          name_ko?: string
          name_en?: string | null
          exchange?: string | null
          market?: string
          asset_type?: string | null
          source_date?: string | null
          fetched_at?: string
        }
        Relationships: []
      }
      user_perf_snapshots: {
        Row: {
          id: string
          user_id: string
          holding_id: string
          xirr: number | null
          cumulative_return: number | null
          days: number
          portfolio_krw: number | null
          mode: Database["public"]["Enums"]["holding_mode"]
          investment_krw: number | null
          alpha: number | null
          benchmark_symbol: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          holding_id: string
          xirr?: number | null
          cumulative_return?: number | null
          days: number
          portfolio_krw?: number | null
          mode?: Database["public"]["Enums"]["holding_mode"]
          investment_krw?: number | null
          alpha?: number | null
          benchmark_symbol?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          holding_id?: string
          xirr?: number | null
          cumulative_return?: number | null
          days?: number
          portfolio_krw?: number | null
          mode?: Database["public"]["Enums"]["holding_mode"]
          investment_krw?: number | null
          alpha?: number | null
          benchmark_symbol?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_perf_snapshots_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: true
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
        ]
      }
      etf_ter_cache: {
        Row: {
          fetched_at: string
          name: string
          source_date: string
          symbol: string
          ter: number
        }
        Insert: {
          fetched_at?: string
          name: string
          source_date: string
          symbol: string
          ter: number
        }
        Update: {
          fetched_at?: string
          name?: string
          source_date?: string
          symbol?: string
          ter?: number
        }
        Relationships: []
      }
      calculation_snapshots: {
        Row: {
          as_of_date: string
          computed_at: string
          data: Json
          error_message: string | null
          expires_at: string | null
          holding_id: string
          id: string
          kind: string
          parameters_hash: string
          portfolio_revision: number
          status: string
          user_id: string
        }
        Insert: {
          as_of_date: string
          computed_at?: string
          data: Json
          error_message?: string | null
          expires_at?: string | null
          holding_id: string
          id?: string
          kind: string
          parameters_hash?: string
          portfolio_revision: number
          status?: string
          user_id?: string
        }
        Update: {
          as_of_date?: string
          computed_at?: string
          data?: Json
          error_message?: string | null
          expires_at?: string | null
          holding_id?: string
          id?: string
          kind?: string
          parameters_hash?: string
          portfolio_revision?: number
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calculation_snapshots_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          broker: string | null
          commission_rate: number
          created_at: string
          holding_id: string
          id: string
          name: string
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"]
          broker?: string | null
          commission_rate?: number
          created_at?: string
          holding_id: string
          id?: string
          name?: string
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"]
          broker?: string | null
          commission_rate?: number
          created_at?: string
          holding_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          account_id: string
          created_at: string
          currency: string
          date: string
          deleted_at: string | null
          fee_and_tax: number
          funding_deposit_id: string | null
          fx_rate: number
          id: string
          price_or_amount: number
          quantity: number | null
          reverses_event_id: string | null
          source: string
          symbol: string | null
          to_amount: number | null
          to_currency: string | null
          type: Database["public"]["Enums"]["event_type"]
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          currency?: string
          date: string
          deleted_at?: string | null
          fee_and_tax?: number
          funding_deposit_id?: string | null
          fx_rate?: number
          id?: string
          price_or_amount: number
          quantity?: number | null
          reverses_event_id?: string | null
          source?: string
          symbol?: string | null
          to_amount?: number | null
          to_currency?: string | null
          type: Database["public"]["Enums"]["event_type"]
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          currency?: string
          date?: string
          deleted_at?: string | null
          fee_and_tax?: number
          funding_deposit_id?: string | null
          fx_rate?: number
          id?: string
          price_or_amount?: number
          quantity?: number | null
          reverses_event_id?: string | null
          source?: string
          symbol?: string | null
          to_amount?: number | null
          to_currency?: string | null
          type?: Database["public"]["Enums"]["event_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_reverses_event_id_fkey"
            columns: ["reverses_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_funding_deposit_id_fkey"
            columns: ["funding_deposit_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      fundamentals_cache: {
        Row: {
          data: Json
          fetched_at: string
          fs_div: string
          symbol: string
          year: number
        }
        Insert: {
          data: Json
          fetched_at?: string
          fs_div: string
          symbol: string
          year: number
        }
        Update: {
          data?: Json
          fetched_at?: string
          fs_div?: string
          symbol?: string
          year?: number
        }
        Relationships: []
      }
      holdings: {
        Row: {
          active_plan: Json | null
          category_targets: Json
          completed_years: number[]
          created_at: string
          founded_at: string
          founding_declared: boolean
          id: string
          initial_capital: number
          initial_valuation: number
          mode: Database["public"]["Enums"]["holding_mode"]
          name: string
          portfolio_revision: number
          target_weights: Json
          user_id: string
        }
        Insert: {
          active_plan?: Json | null
          category_targets?: Json
          completed_years?: number[]
          created_at?: string
          founded_at: string
          founding_declared?: boolean
          id?: string
          initial_capital?: number
          initial_valuation?: number
          mode: Database["public"]["Enums"]["holding_mode"]
          name: string
          portfolio_revision?: number
          target_weights?: Json
          user_id?: string
        }
        Update: {
          active_plan?: Json | null
          category_targets?: Json
          completed_years?: number[]
          created_at?: string
          founded_at?: string
          founding_declared?: boolean
          id?: string
          initial_capital?: number
          initial_valuation?: number
          mode?: Database["public"]["Enums"]["holding_mode"]
          name?: string
          portfolio_revision?: number
          target_weights?: Json
          user_id?: string
        }
        Relationships: []
      }
      home_signal_dismissals: {
        Row: {
          created_at: string
          holding_id: string
          id: string
          signal_key: string
        }
        Insert: {
          created_at?: string
          holding_id: string
          id?: string
          signal_key: string
        }
        Update: {
          created_at?: string
          holding_id?: string
          id?: string
          signal_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "home_signal_dismissals_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
        ]
      }
      liabilities: {
        Row: {
          created_at: string
          deleted_at: string | null
          holding_id: string
          id: string
          interest_rate: number
          kind: Database["public"]["Enums"]["liability_kind"]
          name: string
          principal: number
          started_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          holding_id: string
          id?: string
          interest_rate?: number
          kind?: Database["public"]["Enums"]["liability_kind"]
          name: string
          principal?: number
          started_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          holding_id?: string
          id?: string
          interest_rate?: number
          kind?: Database["public"]["Enums"]["liability_kind"]
          name?: string
          principal?: number
          started_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "liabilities_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_assets: {
        Row: {
          acquired_at: string | null
          acquired_price: number | null
          created_at: string
          current_value: number
          deleted_at: string | null
          holding_id: string
          id: string
          kind: Database["public"]["Enums"]["manual_asset_kind"]
          name: string
          note: string | null
          updated_at: string
        }
        Insert: {
          acquired_at?: string | null
          acquired_price?: number | null
          created_at?: string
          current_value?: number
          deleted_at?: string | null
          holding_id: string
          id?: string
          kind?: Database["public"]["Enums"]["manual_asset_kind"]
          name: string
          note?: string | null
          updated_at?: string
        }
        Update: {
          acquired_at?: string | null
          acquired_price?: number | null
          created_at?: string
          current_value?: number
          deleted_at?: string | null
          holding_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["manual_asset_kind"]
          name?: string
          note?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_assets_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_fundamentals: {
        Row: {
          created_at: string
          dna: number | null
          fiscal_year: number
          holding_id: string
          id: string
          maint_capex: number | null
          note: string | null
          symbol: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dna?: number | null
          fiscal_year: number
          holding_id: string
          id?: string
          maint_capex?: number | null
          note?: string | null
          symbol: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dna?: number | null
          fiscal_year?: number
          holding_id?: string
          id?: string
          maint_capex?: number | null
          note?: string | null
          symbol?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_fundamentals_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
        ]
      }
      securities: {
        Row: {
          asset_type: string | null
          country: string | null
          created_at: string
          currency: string
          exchange: string | null
          name: string
          sector: string | null
          symbol: string
          updated_at: string
        }
        Insert: {
          asset_type?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          exchange?: string | null
          name: string
          sector?: string | null
          symbol: string
          updated_at?: string
        }
        Update: {
          asset_type?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          exchange?: string | null
          name?: string
          sector?: string | null
          symbol?: string
          updated_at?: string
        }
        Relationships: []
      }
      valuation_assumptions: {
        Row: {
          created_at: string
          discount_rate: number | null
          growth_rate: number | null
          holding_id: string
          id: string
          symbol: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          discount_rate?: number | null
          growth_rate?: number | null
          holding_id: string
          id?: string
          symbol: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          discount_rate?: number | null
          growth_rate?: number | null
          holding_id?: string
          id?: string
          symbol?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "valuation_assumptions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlist: {
        Row: {
          created_at: string
          holding_id: string
          id: string
          symbol: string
        }
        Insert: {
          created_at?: string
          holding_id: string
          id?: string
          symbol: string
        }
        Update: {
          created_at?: string
          holding_id?: string
          id?: string
          symbol?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      positions: {
        Row: {
          account_id: string | null
          avg_cost: number | null
          holding_id: string | null
          quantity: number | null
          symbol: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      account_type: "GENERAL" | "ISA" | "PENSION" | "OVERSEAS" | "IRP"
      event_type:
        | "BUY"
        | "SELL"
        | "DIVIDEND"
        | "DEPOSIT"
        | "WITHDRAWAL"
        | "EXCHANGE"
      holding_mode: "ledger" | "challenge" | "live"
      liability_kind: "CREDIT" | "MORTGAGE" | "MARGIN" | "OTHER"
      manual_asset_kind:
        | "REAL_ESTATE"
        | "LAND"
        | "COMMERCIAL"
        | "UNLISTED"
        | "COLLECTIBLE"
        | "OTHER"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_type: ["GENERAL", "ISA", "PENSION", "OVERSEAS", "IRP"],
      event_type: [
        "BUY",
        "SELL",
        "DIVIDEND",
        "DEPOSIT",
        "WITHDRAWAL",
        "EXCHANGE",
      ],
      holding_mode: ["ledger", "challenge", "live"],
      liability_kind: ["CREDIT", "MORTGAGE", "MARGIN", "OTHER"],
      manual_asset_kind: [
        "REAL_ESTATE",
        "LAND",
        "COMMERCIAL",
        "UNLISTED",
        "COLLECTIBLE",
        "OTHER",
      ],
    },
  },
} as const
