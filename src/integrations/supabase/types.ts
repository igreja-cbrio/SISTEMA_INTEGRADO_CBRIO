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
      areas: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          setor_id: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          setor_id?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          setor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "areas_setor_id_fkey"
            columns: ["setor_id"]
            isOneToOne: false
            referencedRelation: "setores"
            referencedColumns: ["id"]
          },
        ]
      }
      cargos: {
        Row: {
          created_at: string
          id: string
          nivel_padrao_escrita: number
          nivel_padrao_leitura: number
          nome: string
        }
        Insert: {
          created_at?: string
          id?: string
          nivel_padrao_escrita?: number
          nivel_padrao_leitura?: number
          nome: string
        }
        Update: {
          created_at?: string
          id?: string
          nivel_padrao_escrita?: number
          nivel_padrao_leitura?: number
          nome?: string
        }
        Relationships: []
      }
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
      modulos: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      permissoes_modulo: {
        Row: {
          id: string
          modulo_id: string
          nivel_escrita: number
          nivel_leitura: number
          usuario_id: string
        }
        Insert: {
          id?: string
          modulo_id: string
          nivel_escrita?: number
          nivel_leitura?: number
          usuario_id: string
        }
        Update: {
          id?: string
          modulo_id?: string
          nivel_escrita?: number
          nivel_leitura?: number
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "permissoes_modulo_modulo_id_fkey"
            columns: ["modulo_id"]
            isOneToOne: false
            referencedRelation: "modulos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permissoes_modulo_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          area: string | null
          avatar_url: string | null
          created_at: string
          email: string | null
          id: string
          name: string | null
          role: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          area?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id: string
          name?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          area?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      rh_documentos: {
        Row: {
          created_at: string
          descricao: string | null
          funcionario_id: string
          id: string
          tipo: string
          url: string | null
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          funcionario_id: string
          id?: string
          tipo: string
          url?: string | null
        }
        Update: {
          created_at?: string
          descricao?: string | null
          funcionario_id?: string
          id?: string
          tipo?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rh_documentos_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "rh_funcionarios"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_ferias_licencas: {
        Row: {
          created_at: string
          data_fim: string
          data_inicio: string
          funcionario_id: string
          id: string
          observacoes: string | null
          status: string
          tipo: string
        }
        Insert: {
          created_at?: string
          data_fim: string
          data_inicio: string
          funcionario_id: string
          id?: string
          observacoes?: string | null
          status?: string
          tipo?: string
        }
        Update: {
          created_at?: string
          data_fim?: string
          data_inicio?: string
          funcionario_id?: string
          id?: string
          observacoes?: string | null
          status?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_ferias_licencas_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "rh_funcionarios"
            referencedColumns: ["id"]
          },
        ]
      }
      rh_funcionarios: {
        Row: {
          area: string | null
          cargo: string | null
          cpf: string | null
          created_at: string
          data_admissao: string | null
          data_demissao: string | null
          email: string | null
          id: string
          nome: string
          observacoes: string | null
          salario: number | null
          status: string
          telefone: string | null
          tipo_contrato: string | null
        }
        Insert: {
          area?: string | null
          cargo?: string | null
          cpf?: string | null
          created_at?: string
          data_admissao?: string | null
          data_demissao?: string | null
          email?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          salario?: number | null
          status?: string
          telefone?: string | null
          tipo_contrato?: string | null
        }
        Update: {
          area?: string | null
          cargo?: string | null
          cpf?: string | null
          created_at?: string
          data_admissao?: string | null
          data_demissao?: string | null
          email?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          salario?: number | null
          status?: string
          telefone?: string | null
          tipo_contrato?: string | null
        }
        Relationships: []
      }
      rh_treinamentos: {
        Row: {
          carga_horaria: number | null
          created_at: string
          data_fim: string | null
          data_inicio: string | null
          descricao: string | null
          id: string
          status: string
          titulo: string
        }
        Insert: {
          carga_horaria?: number | null
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          descricao?: string | null
          id?: string
          status?: string
          titulo: string
        }
        Update: {
          carga_horaria?: number | null
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          descricao?: string | null
          id?: string
          status?: string
          titulo?: string
        }
        Relationships: []
      }
      rh_treinamentos_funcionarios: {
        Row: {
          funcionario_id: string
          id: string
          nota: number | null
          status: string
          treinamento_id: string
        }
        Insert: {
          funcionario_id: string
          id?: string
          nota?: number | null
          status?: string
          treinamento_id: string
        }
        Update: {
          funcionario_id?: string
          id?: string
          nota?: number | null
          status?: string
          treinamento_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rh_treinamentos_funcionarios_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "rh_funcionarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rh_treinamentos_funcionarios_treinamento_id_fkey"
            columns: ["treinamento_id"]
            isOneToOne: false
            referencedRelation: "rh_treinamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      setores: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
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
      usuario_areas: {
        Row: {
          area_id: string
          id: string
          is_principal: boolean
          usuario_id: string
        }
        Insert: {
          area_id: string
          id?: string
          is_principal?: boolean
          usuario_id: string
        }
        Update: {
          area_id?: string
          id?: string
          is_principal?: boolean
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuario_areas_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuario_areas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios: {
        Row: {
          ativo: boolean
          cargo_id: string | null
          created_at: string
          email: string
          id: string
        }
        Insert: {
          ativo?: boolean
          cargo_id?: string | null
          created_at?: string
          email: string
          id?: string
        }
        Update: {
          ativo?: boolean
          cargo_id?: string | null
          created_at?: string
          email?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_cargo_id_fkey"
            columns: ["cargo_id"]
            isOneToOne: false
            referencedRelation: "cargos"
            referencedColumns: ["id"]
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
