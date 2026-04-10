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
      log_fornecedores: {
        Row: {
          ativo: boolean
          categoria: string | null
          cnpj: string | null
          contato: string | null
          created_at: string
          email: string | null
          id: string
          nome_fantasia: string | null
          observacoes: string | null
          razao_social: string
          telefone: string | null
        }
        Insert: {
          ativo?: boolean
          categoria?: string | null
          cnpj?: string | null
          contato?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nome_fantasia?: string | null
          observacoes?: string | null
          razao_social: string
          telefone?: string | null
        }
        Update: {
          ativo?: boolean
          categoria?: string | null
          cnpj?: string | null
          contato?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nome_fantasia?: string | null
          observacoes?: string | null
          razao_social?: string
          telefone?: string | null
        }
        Relationships: []
      }
      log_movimentacoes: {
        Row: {
          codigo_item: string | null
          created_at: string
          data_movimentacao: string
          descricao: string
          destino: string | null
          id: string
          observacoes: string | null
          origem: string | null
          quantidade: number
          responsavel_id: string | null
          tipo: string
        }
        Insert: {
          codigo_item?: string | null
          created_at?: string
          data_movimentacao?: string
          descricao: string
          destino?: string | null
          id?: string
          observacoes?: string | null
          origem?: string | null
          quantidade?: number
          responsavel_id?: string | null
          tipo: string
        }
        Update: {
          codigo_item?: string | null
          created_at?: string
          data_movimentacao?: string
          descricao?: string
          destino?: string | null
          id?: string
          observacoes?: string | null
          origem?: string | null
          quantidade?: number
          responsavel_id?: string | null
          tipo?: string
        }
        Relationships: []
      }
      log_notas_fiscais: {
        Row: {
          chave_acesso: string | null
          created_at: string
          created_by: string | null
          data_emissao: string
          fornecedor_id: string | null
          id: string
          numero: string
          observacoes: string | null
          pedido_id: string | null
          serie: string | null
          tipo: string
          valor: number | null
        }
        Insert: {
          chave_acesso?: string | null
          created_at?: string
          created_by?: string | null
          data_emissao?: string
          fornecedor_id?: string | null
          id?: string
          numero: string
          observacoes?: string | null
          pedido_id?: string | null
          serie?: string | null
          tipo?: string
          valor?: number | null
        }
        Update: {
          chave_acesso?: string | null
          created_at?: string
          created_by?: string | null
          data_emissao?: string
          fornecedor_id?: string | null
          id?: string
          numero?: string
          observacoes?: string | null
          pedido_id?: string | null
          serie?: string | null
          tipo?: string
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "log_notas_fiscais_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "log_fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "log_notas_fiscais_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "log_pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      log_pedido_itens: {
        Row: {
          created_at: string
          descricao: string
          id: string
          pedido_id: string
          quantidade: number
          unidade: string
          valor_unitario: number
        }
        Insert: {
          created_at?: string
          descricao: string
          id?: string
          pedido_id: string
          quantidade?: number
          unidade?: string
          valor_unitario?: number
        }
        Update: {
          created_at?: string
          descricao?: string
          id?: string
          pedido_id?: string
          quantidade?: number
          unidade?: string
          valor_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "log_pedido_itens_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "log_pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      log_pedidos: {
        Row: {
          codigo_rastreio: string | null
          created_at: string
          created_by: string | null
          data_pedido: string
          data_prevista: string | null
          descricao: string
          fornecedor_id: string | null
          id: string
          solicitacao_id: string | null
          status: string
          transportadora: string | null
          valor_total: number
        }
        Insert: {
          codigo_rastreio?: string | null
          created_at?: string
          created_by?: string | null
          data_pedido?: string
          data_prevista?: string | null
          descricao: string
          fornecedor_id?: string | null
          id?: string
          solicitacao_id?: string | null
          status?: string
          transportadora?: string | null
          valor_total?: number
        }
        Update: {
          codigo_rastreio?: string | null
          created_at?: string
          created_by?: string | null
          data_pedido?: string
          data_prevista?: string | null
          descricao?: string
          fornecedor_id?: string | null
          id?: string
          solicitacao_id?: string | null
          status?: string
          transportadora?: string | null
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "log_pedidos_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "log_fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "log_pedidos_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "log_solicitacoes_compra"
            referencedColumns: ["id"]
          },
        ]
      }
      log_recebimentos: {
        Row: {
          created_at: string
          id: string
          observacoes: string | null
          pedido_id: string | null
          recebido_por: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          observacoes?: string | null
          pedido_id?: string | null
          recebido_por?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          observacoes?: string | null
          pedido_id?: string | null
          recebido_por?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "log_recebimentos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "log_pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      log_solicitacoes_compra: {
        Row: {
          aprovado_por: string | null
          area: string | null
          created_at: string
          descricao: string | null
          id: string
          justificativa: string | null
          observacoes: string | null
          solicitante_id: string | null
          status: string
          titulo: string
          urgencia: string
          valor_estimado: number | null
        }
        Insert: {
          aprovado_por?: string | null
          area?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          justificativa?: string | null
          observacoes?: string | null
          solicitante_id?: string | null
          status?: string
          titulo: string
          urgencia?: string
          valor_estimado?: number | null
        }
        Update: {
          aprovado_por?: string | null
          area?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          justificativa?: string | null
          observacoes?: string | null
          solicitante_id?: string | null
          status?: string
          titulo?: string
          urgencia?: string
          valor_estimado?: number | null
        }
        Relationships: []
      }
      solicitacoes: {
        Row: {
          area_solicitante: string | null
          categoria: string
          created_at: string
          descricao: string | null
          id: string
          justificativa: string | null
          observacoes: string | null
          responsavel_id: string | null
          solicitante_id: string
          status: string
          titulo: string
          updated_at: string
          urgencia: string
          valor_estimado: number | null
        }
        Insert: {
          area_solicitante?: string | null
          categoria: string
          created_at?: string
          descricao?: string | null
          id?: string
          justificativa?: string | null
          observacoes?: string | null
          responsavel_id?: string | null
          solicitante_id: string
          status?: string
          titulo: string
          updated_at?: string
          urgencia?: string
          valor_estimado?: number | null
        }
        Update: {
          area_solicitante?: string | null
          categoria?: string
          created_at?: string
          descricao?: string | null
          id?: string
          justificativa?: string | null
          observacoes?: string | null
          responsavel_id?: string | null
          solicitante_id?: string
          status?: string
          titulo?: string
          updated_at?: string
          urgencia?: string
          valor_estimado?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
