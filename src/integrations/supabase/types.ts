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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          created_at: string
          currency: string
          id: string
          name: string
          opening_balance: number
          type: Database["public"]["Enums"]["AccountType"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id: string
          name: string
          opening_balance?: number
          type: Database["public"]["Enums"]["AccountType"]
          updated_at: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          name?: string
          opening_balance?: number
          type?: Database["public"]["Enums"]["AccountType"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          created_at: string
          currency: string
          id: string
          name: string
          quantity: number
          unit_value: number
          user_id: string
          valued_at: string
        }
        Insert: {
          created_at?: string
          currency: string
          id: string
          name: string
          quantity: number
          unit_value: number
          user_id: string
          valued_at: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          name?: string
          quantity?: number
          unit_value?: number
          user_id?: string
          valued_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "assets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          amount: number
          category_id: string
          created_at: string
          currency: string
          id: string
          month: string
          user_id: string
        }
        Insert: {
          amount: number
          category_id: string
          created_at?: string
          currency: string
          id: string
          month: string
          user_id: string
        }
        Update: {
          amount?: number
          category_id?: string
          created_at?: string
          currency?: string
          id?: string
          month?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_category_id_user_id_fkey"
            columns: ["category_id", "user_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "budgets_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "budgets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["CategoryKind"]
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id: string
          kind: Database["public"]["Enums"]["CategoryKind"]
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["CategoryKind"]
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      currencies: {
        Row: {
          code: string
          minor_units: number
        }
        Insert: {
          code: string
          minor_units: number
        }
        Update: {
          code?: string
          minor_units?: number
        }
        Relationships: []
      }
      debts: {
        Row: {
          created_at: string
          currency: string
          due_at: string | null
          id: string
          kind: Database["public"]["Enums"]["DebtKind"]
          name: string
          outstanding: number
          principal: number
          user_id: string
        }
        Insert: {
          created_at?: string
          currency: string
          due_at?: string | null
          id: string
          kind: Database["public"]["Enums"]["DebtKind"]
          name: string
          outstanding: number
          principal: number
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          due_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["DebtKind"]
          name?: string
          outstanding?: number
          principal?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "debts_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "debts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      password_resets: {
        Row: {
          expires_at: string
          token_hash: string
          user_id: string
        }
        Insert: {
          expires_at: string
          token_hash: string
          user_id: string
        }
        Update: {
          expires_at?: string
          token_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "password_resets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_payments: {
        Row: {
          account_id: string
          amount: number
          category_id: string | null
          created_at: string
          currency: string
          frequency: Database["public"]["Enums"]["RecurringFrequency"]
          id: string
          kind: Database["public"]["Enums"]["RecurringKind"]
          name: string
          next_due_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          category_id?: string | null
          created_at?: string
          currency: string
          frequency: Database["public"]["Enums"]["RecurringFrequency"]
          id: string
          kind: Database["public"]["Enums"]["RecurringKind"]
          name: string
          next_due_at: string
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          category_id?: string | null
          created_at?: string
          currency?: string
          frequency?: Database["public"]["Enums"]["RecurringFrequency"]
          id?: string
          kind?: Database["public"]["Enums"]["RecurringKind"]
          name?: string
          next_due_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_payments_account_id_user_id_fkey"
            columns: ["account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "recurring_payments_category_id_user_id_fkey"
            columns: ["category_id", "user_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "recurring_payments_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "recurring_payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_goals: {
        Row: {
          created_at: string
          currency: string
          id: string
          name: string
          saved: number
          target: number
          target_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          currency: string
          id: string
          name: string
          saved?: number
          target: number
          target_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          name?: string
          saved?: number
          target?: number
          target_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "savings_goals_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "savings_goals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          last_seen_at: string
          token_hash: string
          user_agent: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id: string
          last_seen_at?: string
          token_hash: string
          user_agent?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          last_seen_at?: string
          token_hash?: string
          user_agent?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string
          amount: number
          category_id: string | null
          created_at: string
          currency: string
          description: string
          id: string
          kind: Database["public"]["Enums"]["TransactionKind"]
          note: string
          occurred_at: string
          target_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          category_id?: string | null
          created_at?: string
          currency: string
          description?: string
          id: string
          kind: Database["public"]["Enums"]["TransactionKind"]
          note?: string
          occurred_at: string
          target_id?: string | null
          updated_at: string
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          category_id?: string | null
          created_at?: string
          currency?: string
          description?: string
          id?: string
          kind?: Database["public"]["Enums"]["TransactionKind"]
          note?: string
          occurred_at?: string
          target_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_user_id_fkey"
            columns: ["account_id", "user_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "transactions_category_id_user_id_fkey"
            columns: ["category_id", "user_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "transactions_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "transactions_target_id_user_id_fkey"
            columns: ["target_id", "user_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          accepted_terms_at: string
          created_at: string
          email: string
          first_name: string
          id: string
          last_name: string
          password_hash: string
          password_salt: string
          preferred_language: string
          primary_currency: string
          updated_at: string
        }
        Insert: {
          accepted_terms_at: string
          created_at?: string
          email: string
          first_name: string
          id: string
          last_name?: string
          password_hash: string
          password_salt: string
          preferred_language?: string
          primary_currency?: string
          updated_at: string
        }
        Update: {
          accepted_terms_at?: string
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          password_hash?: string
          password_salt?: string
          preferred_language?: string
          primary_currency?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_primary_currency_fkey"
            columns: ["primary_currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      AccountType: "CASH" | "BANK" | "SAVINGS" | "INVESTMENT"
      CategoryKind: "INCOME" | "EXPENSE"
      DebtKind: "OWED" | "OWED_TO_USER"
      RecurringFrequency: "WEEKLY" | "MONTHLY"
      RecurringKind: "INCOME" | "EXPENSE"
      TransactionKind: "INCOME" | "EXPENSE" | "TRANSFER"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      AccountType: ["CASH", "BANK", "SAVINGS", "INVESTMENT"],
      CategoryKind: ["INCOME", "EXPENSE"],
      DebtKind: ["OWED", "OWED_TO_USER"],
      RecurringFrequency: ["WEEKLY", "MONTHLY"],
      RecurringKind: ["INCOME", "EXPENSE"],
      TransactionKind: ["INCOME", "EXPENSE", "TRANSFER"],
    },
  },
} as const
