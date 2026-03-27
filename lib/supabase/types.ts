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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          admin_id: string
          created_at: string | null
          id: string
          ip_address: unknown
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string | null
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string | null
          id?: string
          ip_address?: unknown
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string | null
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string | null
          id?: string
          ip_address?: unknown
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      back_in_stock_alerts: {
        Row: {
          created_at: string | null
          email: string
          id: string
          notified_at: string | null
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          notified_at?: string | null
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          notified_at?: string | null
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "back_in_stock_alerts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "map_compliance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "back_in_stock_alerts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "back_in_stock_alerts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "back_in_stock_alerts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          id: string
          is_featured: boolean | null
          logo_url: string | null
          name: string
          slug: string
          sort_order: number | null
        }
        Insert: {
          id?: string
          is_featured?: boolean | null
          logo_url?: string | null
          name: string
          slug: string
          sort_order?: number | null
        }
        Update: {
          id?: string
          is_featured?: boolean | null
          logo_url?: string | null
          name?: string
          slug?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      cart_items: {
        Row: {
          added_at: string | null
          cart_id: string
          fitment_vehicle_id: string | null
          id: string
          price_at_add: number
          product_id: string
          qty: number
        }
        Insert: {
          added_at?: string | null
          cart_id: string
          fitment_vehicle_id?: string | null
          id?: string
          price_at_add: number
          product_id: string
          qty?: number
        }
        Update: {
          added_at?: string | null
          cart_id?: string
          fitment_vehicle_id?: string | null
          id?: string
          price_at_add?: number
          product_id?: string
          qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_fitment_vehicle_id_fkey"
            columns: ["fitment_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "map_compliance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          abandonment_emails_sent: number | null
          coupon_code: string | null
          coupon_discount: number | null
          created_at: string | null
          guest_email: string | null
          id: string
          last_abandonment_email_at: string | null
          last_activity_at: string | null
          points_to_redeem: number | null
          session_id: string | null
          shipping: number | null
          status: string
          subtotal: number | null
          tax: number | null
          total: number | null
          user_id: string | null
        }
        Insert: {
          abandonment_emails_sent?: number | null
          coupon_code?: string | null
          coupon_discount?: number | null
          created_at?: string | null
          guest_email?: string | null
          id?: string
          last_abandonment_email_at?: string | null
          last_activity_at?: string | null
          points_to_redeem?: number | null
          session_id?: string | null
          shipping?: number | null
          status?: string
          subtotal?: number | null
          tax?: number | null
          total?: number | null
          user_id?: string | null
        }
        Update: {
          abandonment_emails_sent?: number | null
          coupon_code?: string | null
          coupon_discount?: number | null
          created_at?: string | null
          guest_email?: string | null
          id?: string
          last_abandonment_email_at?: string | null
          last_activity_at?: string | null
          points_to_redeem?: number | null
          session_id?: string | null
          shipping?: number | null
          status?: string
          subtotal?: number | null
          tax?: number | null
          total?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "carts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          name: string
          parent_id: string | null
          slug: string
          sort_order: number | null
        }
        Insert: {
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number | null
        }
        Update: {
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_pricing: {
        Row: {
          id: string
          jpcycles_check_failed: boolean | null
          jpcycles_checked_at: string | null
          jpcycles_in_stock: boolean | null
          jpcycles_price: number | null
          jpcycles_url: string | null
          last_checked_at: string | null
          lowest_competitor_price: number | null
          product_id: string
          recommendation: string | null
          recommended_price: number | null
          revzilla_check_failed: boolean | null
          revzilla_checked_at: string | null
          revzilla_in_stock: boolean | null
          revzilla_price: number | null
          revzilla_url: string | null
        }
        Insert: {
          id?: string
          jpcycles_check_failed?: boolean | null
          jpcycles_checked_at?: string | null
          jpcycles_in_stock?: boolean | null
          jpcycles_price?: number | null
          jpcycles_url?: string | null
          last_checked_at?: string | null
          lowest_competitor_price?: number | null
          product_id: string
          recommendation?: string | null
          recommended_price?: number | null
          revzilla_check_failed?: boolean | null
          revzilla_checked_at?: string | null
          revzilla_in_stock?: boolean | null
          revzilla_price?: number | null
          revzilla_url?: string | null
        }
        Update: {
          id?: string
          jpcycles_check_failed?: boolean | null
          jpcycles_checked_at?: string | null
          jpcycles_in_stock?: boolean | null
          jpcycles_price?: number | null
          jpcycles_url?: string | null
          last_checked_at?: string | null
          lowest_competitor_price?: number | null
          product_id?: string
          recommendation?: string | null
          recommended_price?: number | null
          revzilla_check_failed?: boolean | null
          revzilla_checked_at?: string | null
          revzilla_in_stock?: boolean | null
          revzilla_price?: number | null
          revzilla_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitor_pricing_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "map_compliance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "competitor_pricing_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "product_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_pricing_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          created_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          max_uses: number | null
          min_order_total: number | null
          respect_map: boolean | null
          times_used: number | null
          type: string
          valid_from: string | null
          value: number
        }
        Insert: {
          code: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          min_order_total?: number | null
          respect_map?: boolean | null
          times_used?: number | null
          type: string
          valid_from?: string | null
          value: number
        }
        Update: {
          code?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          min_order_total?: number | null
          respect_map?: boolean | null
          times_used?: number | null
          type?: string
          valid_from?: string | null
          value?: number
        }
        Relationships: []
      }
      fitment: {
        Row: {
          id: string
          notes: string | null
          product_id: string
          vehicle_id: string
        }
        Insert: {
          id?: string
          notes?: string | null
          product_id: string
          vehicle_id: string
        }
        Update: {
          id?: string
          notes?: string | null
          product_id?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fitment_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "map_compliance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "fitment_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fitment_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fitment_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      map_alerts: {
        Row: {
          auto_fixed: boolean
          created_at: string | null
          id: string
          is_violation: boolean
          new_map: number | null
          our_price: number | null
          previous_map: number | null
          product_id: string
          product_name: string | null
          resolved_at: string | null
          vendor_id: string
        }
        Insert: {
          auto_fixed?: boolean
          created_at?: string | null
          id?: string
          is_violation?: boolean
          new_map?: number | null
          our_price?: number | null
          previous_map?: number | null
          product_id: string
          product_name?: string | null
          resolved_at?: string | null
          vendor_id: string
        }
        Update: {
          auto_fixed?: boolean
          created_at?: string | null
          id?: string
          is_violation?: boolean
          new_map?: number | null
          our_price?: number | null
          previous_map?: number | null
          product_id?: string
          product_name?: string | null
          resolved_at?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "map_alerts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "map_compliance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "map_alerts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_alerts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_alerts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      map_audit_log: {
        Row: {
          brand_name: string
          checked_at: string
          corrected_at: string | null
          corrected_by: string | null
          delta: number
          id: string
          map_floor: number
          notes: string | null
          our_price: number
          previous_price: number | null
          product_id: string | null
          product_name: string
          sku: string
          status: string
          trigger: string
          vendor: string | null
        }
        Insert: {
          brand_name: string
          checked_at?: string
          corrected_at?: string | null
          corrected_by?: string | null
          delta: number
          id?: string
          map_floor: number
          notes?: string | null
          our_price: number
          previous_price?: number | null
          product_id?: string | null
          product_name: string
          sku: string
          status: string
          trigger: string
          vendor?: string | null
        }
        Update: {
          brand_name?: string
          checked_at?: string
          corrected_at?: string | null
          corrected_by?: string | null
          delta?: number
          id?: string
          map_floor?: number
          notes?: string | null
          our_price?: number
          previous_price?: number | null
          product_id?: string | null
          product_name?: string
          sku?: string
          status?: string
          trigger?: string
          vendor?: string | null
        }
        Relationships: []
      }
      map_pricing: {
        Row: {
          created_at: string | null
          effective_date: string
          expires_date: string | null
          id: string
          map_price: number
          notes: string | null
          product_id: string
          source: string | null
          vendor_id: string
        }
        Insert: {
          created_at?: string | null
          effective_date?: string
          expires_date?: string | null
          id?: string
          map_price: number
          notes?: string | null
          product_id: string
          source?: string | null
          vendor_id: string
        }
        Update: {
          created_at?: string | null
          effective_date?: string
          expires_date?: string | null
          id?: string
          map_price?: number
          notes?: string | null
          product_id?: string
          source?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "map_pricing_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "map_compliance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "map_pricing_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_pricing_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_pricing_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string | null
          id: string
          name: string | null
          order_id: string | null
          price: number | null
          product_id: string | null
          quantity: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name?: string | null
          order_id?: string | null
          price?: number | null
          product_id?: string | null
          quantity?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string | null
          order_id?: string | null
          price?: number | null
          product_id?: string | null
          quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_line_items: {
        Row: {
          brand: string | null
          id: string
          image_url: string | null
          name: string
          order_id: string
          part_number: string
          product_id: string | null
          qty: number
          sku: string
          total_cost: number
          total_price: number
          unit_cost: number
          unit_price: number
          vendor_id: string | null
        }
        Insert: {
          brand?: string | null
          id?: string
          image_url?: string | null
          name: string
          order_id: string
          part_number: string
          product_id?: string | null
          qty: number
          sku: string
          total_cost: number
          total_price: number
          unit_cost: number
          unit_price: number
          vendor_id?: string | null
        }
        Update: {
          brand?: string | null
          id?: string
          image_url?: string | null
          name?: string
          order_id?: string
          part_number?: string
          product_id?: string | null
          qty?: number
          sku?: string
          total_cost?: number
          total_price?: number
          unit_cost?: number
          unit_price?: number
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_line_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_line_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "map_compliance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "order_line_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_line_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_line_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      order_timeline: {
        Row: {
          actor: string
          actor_id: string | null
          created_at: string | null
          detail: string | null
          event: string
          id: string
          order_id: string
        }
        Insert: {
          actor: string
          actor_id?: string | null
          created_at?: string | null
          detail?: string | null
          event: string
          id?: string
          order_id: string
        }
        Update: {
          actor?: string
          actor_id?: string | null
          created_at?: string | null
          detail?: string | null
          event?: string
          id?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_timeline_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          billing_address: Json | null
          cart_id: string | null
          coupon_code: string | null
          created_at: string | null
          customer_email: string | null
          customer_name: string | null
          customer_note: string | null
          customer_phone: string | null
          discount: number
          id: string
          internal_note: string | null
          order_number: string
          payment_method_last4: string | null
          points_earned: number
          points_earned_at: string | null
          points_redeemed: number
          points_redeemed_value: number
          shipping: number
          shipping_address: Json | null
          status: string
          stripe_charge_id: string | null
          stripe_payment_intent_id: string | null
          subtotal: number
          tax: number
          total: number
          tracking_number: string | null
          updated_at: string | null
          user_id: string | null
          wps_carrier: string | null
          wps_error_message: string | null
          wps_estimated_ship_date: string | null
          wps_order_id: string | null
          wps_po_submitted_at: string | null
          wps_status: string | null
          wps_tracking_number: string | null
        }
        Insert: {
          billing_address?: Json | null
          cart_id?: string | null
          coupon_code?: string | null
          created_at?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_note?: string | null
          customer_phone?: string | null
          discount?: number
          id?: string
          internal_note?: string | null
          order_number?: string
          payment_method_last4?: string | null
          points_earned?: number
          points_earned_at?: string | null
          points_redeemed?: number
          points_redeemed_value?: number
          shipping?: number
          shipping_address?: Json | null
          status?: string
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          subtotal: number
          tax?: number
          total: number
          tracking_number?: string | null
          updated_at?: string | null
          user_id?: string | null
          wps_carrier?: string | null
          wps_error_message?: string | null
          wps_estimated_ship_date?: string | null
          wps_order_id?: string | null
          wps_po_submitted_at?: string | null
          wps_status?: string | null
          wps_tracking_number?: string | null
        }
        Update: {
          billing_address?: Json | null
          cart_id?: string | null
          coupon_code?: string | null
          created_at?: string | null
          customer_email?: string | null
          customer_name?: string | null
          customer_note?: string | null
          customer_phone?: string | null
          discount?: number
          id?: string
          internal_note?: string | null
          order_number?: string
          payment_method_last4?: string | null
          points_earned?: number
          points_earned_at?: string | null
          points_redeemed?: number
          points_redeemed_value?: number
          shipping?: number
          shipping_address?: Json | null
          status?: string
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          subtotal?: number
          tax?: number
          total?: number
          tracking_number?: string | null
          updated_at?: string | null
          user_id?: string | null
          wps_carrier?: string | null
          wps_error_message?: string | null
          wps_estimated_ship_date?: string | null
          wps_order_id?: string | null
          wps_po_submitted_at?: string | null
          wps_status?: string | null
          wps_tracking_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      points_config: {
        Row: {
          birthday_points: number
          earn_rate_per_dollar: number
          expiration_months: number
          garage_add_points: number
          id: boolean
          max_redemption_pct: number
          min_redemption_points: number
          redeem_rate: number
          referral_points: number
          review_points: number
          updated_at: string | null
        }
        Insert: {
          birthday_points?: number
          earn_rate_per_dollar?: number
          expiration_months?: number
          garage_add_points?: number
          id?: boolean
          max_redemption_pct?: number
          min_redemption_points?: number
          redeem_rate?: number
          referral_points?: number
          review_points?: number
          updated_at?: string | null
        }
        Update: {
          birthday_points?: number
          earn_rate_per_dollar?: number
          expiration_months?: number
          garage_add_points?: number
          id?: boolean
          max_redemption_pct?: number
          min_redemption_points?: number
          redeem_rate?: number
          referral_points?: number
          review_points?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      points_ledger: {
        Row: {
          admin_user_id: string | null
          amount: number
          balance_after: number
          created_at: string | null
          expires_at: string | null
          id: string
          order_id: string | null
          product_id: string | null
          reason: string | null
          type: string
          user_id: string
        }
        Insert: {
          admin_user_id?: string | null
          amount: number
          balance_after: number
          created_at?: string | null
          expires_at?: string | null
          id?: string
          order_id?: string | null
          product_id?: string | null
          reason?: string | null
          type: string
          user_id: string
        }
        Update: {
          admin_user_id?: string | null
          amount?: number
          balance_after?: number
          created_at?: string | null
          expires_at?: string | null
          id?: string
          order_id?: string | null
          product_id?: string | null
          reason?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "points_ledger_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_ledger_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "map_compliance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "points_ledger_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_ledger_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_attributes: {
        Row: {
          id: string
          name: string
          product_id: string
          value: string
        }
        Insert: {
          id?: string
          name: string
          product_id: string
          value: string
        }
        Update: {
          id?: string
          name?: string
          product_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_attributes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "map_compliance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_attributes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_attributes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_codes: {
        Row: {
          code: string
          description: string
        }
        Insert: {
          code: string
          description: string
        }
        Update: {
          code?: string
          description?: string
        }
        Relationships: []
      }
      product_images: {
        Row: {
          alt_text: string | null
          id: string
          is_primary: boolean | null
          product_id: string
          sort_order: number | null
          url: string
        }
        Insert: {
          alt_text?: string | null
          id?: string
          is_primary?: boolean | null
          product_id: string
          sort_order?: number | null
          url: string
        }
        Update: {
          alt_text?: string | null
          id?: string
          is_primary?: boolean | null
          product_id?: string
          sort_order?: number | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "map_compliance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_reviews: {
        Row: {
          body: string | null
          created_at: string | null
          id: string
          order_id: string | null
          points_awarded: boolean | null
          product_id: string
          rating: number
          status: string | null
          title: string | null
          user_id: string
          verified_purchase: boolean | null
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          id?: string
          order_id?: string | null
          points_awarded?: boolean | null
          product_id: string
          rating: number
          status?: string | null
          title?: string | null
          user_id: string
          verified_purchase?: boolean | null
        }
        Update: {
          body?: string | null
          created_at?: string | null
          id?: string
          order_id?: string | null
          points_awarded?: boolean | null
          product_id?: string
          rating?: number
          status?: string | null
          title?: string | null
          user_id?: string
          verified_purchase?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "map_compliance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand_id: string | null
          brand_name: string | null
          category_id: string | null
          category_name: string | null
          commodity_code: string | null
          compare_at_price: number | null
          condition: string
          country_of_origin: string | null
          created_at: string | null
          dealer_cost: number | null
          description: string | null
          fitment_count: number | null
          hazardous_code: string | null
          height_in: number | null
          id: string
          images: string[] | null
          in_stock: boolean
          is_closeout: boolean | null
          is_drag_specialties: boolean | null
          is_map: boolean | null
          is_new: boolean | null
          is_universal: boolean | null
          last_synced_at: string | null
          length_in: number | null
          map_floor: number
          map_price: number | null
          meta_description: string | null
          meta_title: string | null
          msrp: number | null
          name: string
          nc_qty: number | null
          nv_qty: number | null
          ny_qty: number | null
          our_price: number
          part_add_date: string | null
          part_number: string
          preferred_vendor_id: string | null
          product_code: string | null
          search_vector: unknown
          short_description: string | null
          sku: string
          slug: string
          status: string
          stock_quantity: number | null
          total_qty: number | null
          truck_only: boolean | null
          tx_qty: number | null
          upc: string | null
          upc_code: string | null
          updated_at: string | null
          vendor_id: string | null
          vendor_sku: string | null
          weight_lbs: number | null
          wi_qty: number | null
          width_in: number | null
          wps_item_id: number | null
          wps_product_id: number | null
        }
        Insert: {
          brand_id?: string | null
          brand_name?: string | null
          category_id?: string | null
          category_name?: string | null
          commodity_code?: string | null
          compare_at_price?: number | null
          condition?: string
          country_of_origin?: string | null
          created_at?: string | null
          dealer_cost?: number | null
          description?: string | null
          fitment_count?: number | null
          hazardous_code?: string | null
          height_in?: number | null
          id?: string
          images?: string[] | null
          in_stock?: boolean
          is_closeout?: boolean | null
          is_drag_specialties?: boolean | null
          is_map?: boolean | null
          is_new?: boolean | null
          is_universal?: boolean | null
          last_synced_at?: string | null
          length_in?: number | null
          map_floor?: number
          map_price?: number | null
          meta_description?: string | null
          meta_title?: string | null
          msrp?: number | null
          name: string
          nc_qty?: number | null
          nv_qty?: number | null
          ny_qty?: number | null
          our_price: number
          part_add_date?: string | null
          part_number: string
          preferred_vendor_id?: string | null
          product_code?: string | null
          search_vector?: unknown
          short_description?: string | null
          sku: string
          slug: string
          status?: string
          stock_quantity?: number | null
          total_qty?: number | null
          truck_only?: boolean | null
          tx_qty?: number | null
          upc?: string | null
          upc_code?: string | null
          updated_at?: string | null
          vendor_id?: string | null
          vendor_sku?: string | null
          weight_lbs?: number | null
          wi_qty?: number | null
          width_in?: number | null
          wps_item_id?: number | null
          wps_product_id?: number | null
        }
        Update: {
          brand_id?: string | null
          brand_name?: string | null
          category_id?: string | null
          category_name?: string | null
          commodity_code?: string | null
          compare_at_price?: number | null
          condition?: string
          country_of_origin?: string | null
          created_at?: string | null
          dealer_cost?: number | null
          description?: string | null
          fitment_count?: number | null
          hazardous_code?: string | null
          height_in?: number | null
          id?: string
          images?: string[] | null
          in_stock?: boolean
          is_closeout?: boolean | null
          is_drag_specialties?: boolean | null
          is_map?: boolean | null
          is_new?: boolean | null
          is_universal?: boolean | null
          last_synced_at?: string | null
          length_in?: number | null
          map_floor?: number
          map_price?: number | null
          meta_description?: string | null
          meta_title?: string | null
          msrp?: number | null
          name?: string
          nc_qty?: number | null
          nv_qty?: number | null
          ny_qty?: number | null
          our_price?: number
          part_add_date?: string | null
          part_number?: string
          preferred_vendor_id?: string | null
          product_code?: string | null
          search_vector?: unknown
          short_description?: string | null
          sku?: string
          slug?: string
          status?: string
          stock_quantity?: number | null
          total_qty?: number | null
          truck_only?: boolean | null
          tx_qty?: number | null
          upc?: string | null
          upc_code?: string | null
          updated_at?: string | null
          vendor_id?: string | null
          vendor_sku?: string | null
          weight_lbs?: number | null
          wi_qty?: number | null
          width_in?: number | null
          wps_item_id?: number | null
          wps_product_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_preferred_vendor_id_fkey"
            columns: ["preferred_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_product_code_fkey"
            columns: ["product_code"]
            isOneToOne: false
            referencedRelation: "product_codes"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "products_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_log: {
        Row: {
          completed_at: string
          discontinued: number
          duration_ms: number
          error_message: string | null
          errors: number
          id: string
          skipped: number
          status: string
          total_parts: number
          upserted: number
          vendor: string
        }
        Insert: {
          completed_at?: string
          discontinued?: number
          duration_ms?: number
          error_message?: string | null
          errors?: number
          id?: string
          skipped?: number
          status: string
          total_parts?: number
          upserted?: number
          vendor: string
        }
        Update: {
          completed_at?: string
          discontinued?: number
          duration_ms?: number
          error_message?: string | null
          errors?: number
          id?: string
          skipped?: number
          status?: string
          total_parts?: number
          upserted?: number
          vendor?: string
        }
        Relationships: []
      }
      user_addresses: {
        Row: {
          address1: string
          address2: string | null
          city: string
          company: string | null
          country: string
          created_at: string | null
          first_name: string
          id: string
          is_default: boolean | null
          label: string | null
          last_name: string
          phone: string | null
          state: string
          user_id: string
          zip: string
        }
        Insert: {
          address1: string
          address2?: string | null
          city: string
          company?: string | null
          country?: string
          created_at?: string | null
          first_name: string
          id?: string
          is_default?: boolean | null
          label?: string | null
          last_name: string
          phone?: string | null
          state: string
          user_id: string
          zip: string
        }
        Update: {
          address1?: string
          address2?: string | null
          city?: string
          company?: string | null
          country?: string
          created_at?: string | null
          first_name?: string
          id?: string
          is_default?: boolean | null
          label?: string | null
          last_name?: string
          phone?: string | null
          state?: string
          user_id?: string
          zip?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_addresses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_garage: {
        Row: {
          added_at: string | null
          color: string | null
          id: string
          is_primary: boolean | null
          mileage: number | null
          nickname: string | null
          user_id: string
          vehicle_id: string
        }
        Insert: {
          added_at?: string | null
          color?: string | null
          id?: string
          is_primary?: boolean | null
          mileage?: number | null
          nickname?: string | null
          user_id: string
          vehicle_id: string
        }
        Update: {
          added_at?: string | null
          color?: string | null
          id?: string
          is_primary?: boolean | null
          mileage?: number | null
          nickname?: string | null
          user_id?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_garage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_garage_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          birth_month_day: string | null
          birthday_points_year: number | null
          created_at: string | null
          email: string
          first_name: string | null
          id: string
          last_login_at: string | null
          last_name: string | null
          last_order_at: string | null
          lifetime_points_earned: number
          lifetime_spend: number
          marketing_email_opt_in: boolean | null
          order_count: number
          phone: string | null
          points_balance: number
          referral_code: string
          referred_by_id: string | null
          role: string
          sms_opt_in: boolean | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          birth_month_day?: string | null
          birthday_points_year?: number | null
          created_at?: string | null
          email: string
          first_name?: string | null
          id: string
          last_login_at?: string | null
          last_name?: string | null
          last_order_at?: string | null
          lifetime_points_earned?: number
          lifetime_spend?: number
          marketing_email_opt_in?: boolean | null
          order_count?: number
          phone?: string | null
          points_balance?: number
          referral_code?: string
          referred_by_id?: string | null
          role?: string
          sms_opt_in?: boolean | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          birth_month_day?: string | null
          birthday_points_year?: number | null
          created_at?: string | null
          email?: string
          first_name?: string | null
          id?: string
          last_login_at?: string | null
          last_name?: string | null
          last_order_at?: string | null
          lifetime_points_earned?: number
          lifetime_spend?: number
          marketing_email_opt_in?: boolean | null
          order_count?: number
          phone?: string | null
          points_balance?: number
          referral_code?: string
          referred_by_id?: string | null
          role?: string
          sms_opt_in?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_referred_by_id_fkey"
            columns: ["referred_by_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          aces_id: string | null
          created_at: string | null
          displacement: number | null
          engine_type: string | null
          id: string
          make: string
          model: string
          submodel: string | null
          type: string
          year: number
        }
        Insert: {
          aces_id?: string | null
          created_at?: string | null
          displacement?: number | null
          engine_type?: string | null
          id?: string
          make: string
          model: string
          submodel?: string | null
          type?: string
          year: number
        }
        Update: {
          aces_id?: string | null
          created_at?: string | null
          displacement?: number | null
          engine_type?: string | null
          id?: string
          make?: string
          model?: string
          submodel?: string | null
          type?: string
          year?: number
        }
        Relationships: []
      }
      vendor_orders: {
        Row: {
          carrier: string | null
          confirmed_at: string | null
          created_at: string | null
          delivered_at: string | null
          id: string
          order_id: string
          raw_response: Json | null
          shipped_at: string | null
          status: string
          submitted_at: string | null
          tracking_numbers: string[] | null
          updated_at: string | null
          vendor_id: string
          vendor_notes: string | null
          vendor_order_number: string | null
        }
        Insert: {
          carrier?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          id?: string
          order_id: string
          raw_response?: Json | null
          shipped_at?: string | null
          status?: string
          submitted_at?: string | null
          tracking_numbers?: string[] | null
          updated_at?: string | null
          vendor_id: string
          vendor_notes?: string | null
          vendor_order_number?: string | null
        }
        Update: {
          carrier?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          id?: string
          order_id?: string
          raw_response?: Json | null
          shipped_at?: string | null
          status?: string
          submitted_at?: string | null
          tracking_numbers?: string[] | null
          updated_at?: string | null
          vendor_id?: string
          vendor_notes?: string | null
          vendor_order_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_products: {
        Row: {
          cost: number
          id: string
          in_stock: boolean | null
          last_synced_at: string | null
          lead_time_days: number | null
          map_price: number
          msrp: number | null
          product_id: string
          stock_qty: number | null
          vendor_id: string
          vendor_sku: string
        }
        Insert: {
          cost: number
          id?: string
          in_stock?: boolean | null
          last_synced_at?: string | null
          lead_time_days?: number | null
          map_price?: number
          msrp?: number | null
          product_id: string
          stock_qty?: number | null
          vendor_id: string
          vendor_sku: string
        }
        Update: {
          cost?: number
          id?: string
          in_stock?: boolean | null
          last_synced_at?: string | null
          lead_time_days?: number | null
          map_price?: number
          msrp?: number | null
          product_id?: string
          stock_qty?: number | null
          vendor_id?: string
          vendor_sku?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "map_compliance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "vendor_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_products_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          account_number: string | null
          active: boolean | null
          active_skus: number | null
          api_base_url: string | null
          avg_ship_time_days: number | null
          created_at: string | null
          default_markup_pct: number
          fill_rate: number | null
          free_shipping_on_map: boolean | null
          ftp_host: string | null
          ftp_path: string | null
          id: string
          integration_method: string
          last_inventory_sync_at: string | null
          last_map_sync_at: string | null
          last_product_sync_at: string | null
          last_sync_error: string | null
          last_sync_status: string | null
          logo_url: string | null
          min_margin_pct: number
          name: string
          rep_email: string | null
          rep_name: string | null
          rep_phone: string | null
          slug: string
          sync_frequency_hours: number | null
          total_skus: number | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          account_number?: string | null
          active?: boolean | null
          active_skus?: number | null
          api_base_url?: string | null
          avg_ship_time_days?: number | null
          created_at?: string | null
          default_markup_pct?: number
          fill_rate?: number | null
          free_shipping_on_map?: boolean | null
          ftp_host?: string | null
          ftp_path?: string | null
          id?: string
          integration_method: string
          last_inventory_sync_at?: string | null
          last_map_sync_at?: string | null
          last_product_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          logo_url?: string | null
          min_margin_pct?: number
          name: string
          rep_email?: string | null
          rep_name?: string | null
          rep_phone?: string | null
          slug: string
          sync_frequency_hours?: number | null
          total_skus?: number | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          account_number?: string | null
          active?: boolean | null
          active_skus?: number | null
          api_base_url?: string | null
          avg_ship_time_days?: number | null
          created_at?: string | null
          default_markup_pct?: number
          fill_rate?: number | null
          free_shipping_on_map?: boolean | null
          ftp_host?: string | null
          ftp_path?: string | null
          id?: string
          integration_method?: string
          last_inventory_sync_at?: string | null
          last_map_sync_at?: string | null
          last_product_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          logo_url?: string | null
          min_margin_pct?: number
          name?: string
          rep_email?: string | null
          rep_name?: string | null
          rep_phone?: string | null
          slug?: string
          sync_frequency_hours?: number | null
          total_skus?: number | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      wishlists: {
        Row: {
          added_at: string | null
          product_id: string
          user_id: string
        }
        Insert: {
          added_at?: string | null
          product_id: string
          user_id: string
        }
        Update: {
          added_at?: string | null
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlists_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "map_compliance"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "wishlists_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlists_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlists_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wps_product_associations: {
        Row: {
          assoc_type: string
          items: Json
          product_id: number
          updated_at: string
        }
        Insert: {
          assoc_type: string
          items?: Json
          product_id: number
          updated_at?: string
        }
        Update: {
          assoc_type?: string
          items?: Json
          product_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      wps_products: {
        Row: {
          brand_id: number | null
          id: number
          inserted_at: string
          name: string | null
          raw: Json
          sku: string | null
          slug: string | null
          status: string | null
          updated_at: string
          wps_created_at: string | null
          wps_updated_at: string | null
        }
        Insert: {
          brand_id?: number | null
          id: number
          inserted_at?: string
          name?: string | null
          raw?: Json
          sku?: string | null
          slug?: string | null
          status?: string | null
          updated_at?: string
          wps_created_at?: string | null
          wps_updated_at?: string | null
        }
        Update: {
          brand_id?: number | null
          id?: number
          inserted_at?: string
          name?: string | null
          raw?: Json
          sku?: string | null
          slug?: string | null
          status?: string | null
          updated_at?: string
          wps_created_at?: string | null
          wps_updated_at?: string | null
        }
        Relationships: []
      }
      wps_taxonomy_terms: {
        Row: {
          depth: number | null
          description: string | null
          id: number
          inserted_at: string
          left: number | null
          link: string | null
          link_target_blank: boolean
          name: string
          parent_id: number | null
          raw: Json
          right: number | null
          slug: string
          updated_at: string
          vocabulary_id: number
          wps_created_at: string | null
          wps_updated_at: string | null
        }
        Insert: {
          depth?: number | null
          description?: string | null
          id: number
          inserted_at?: string
          left?: number | null
          link?: string | null
          link_target_blank?: boolean
          name: string
          parent_id?: number | null
          raw?: Json
          right?: number | null
          slug: string
          updated_at?: string
          vocabulary_id: number
          wps_created_at?: string | null
          wps_updated_at?: string | null
        }
        Update: {
          depth?: number | null
          description?: string | null
          id?: number
          inserted_at?: string
          left?: number | null
          link?: string | null
          link_target_blank?: boolean
          name?: string
          parent_id?: number | null
          raw?: Json
          right?: number | null
          slug?: string
          updated_at?: string
          vocabulary_id?: number
          wps_created_at?: string | null
          wps_updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      map_compliance: {
        Row: {
          compliance_status: string | null
          map_floor: number | null
          name: string | null
          our_price: number | null
          product_id: string | null
          sku: string | null
          violation_amount: number | null
        }
        Insert: {
          compliance_status?: never
          map_floor?: number | null
          name?: string | null
          our_price?: number | null
          product_id?: string | null
          sku?: string | null
          violation_amount?: never
        }
        Update: {
          compliance_status?: never
          map_floor?: number | null
          name?: string | null
          our_price?: number | null
          product_id?: string | null
          sku?: string | null
          violation_amount?: never
        }
        Relationships: []
      }
      product_facets_cache: {
        Row: {
          count: number | null
          facet_type: string | null
          facet_value: string | null
        }
        Relationships: []
      }
      product_inventory: {
        Row: {
          best_cost: number | null
          effective_map: number | null
          id: string | null
          in_stock: boolean | null
          map_floor: number | null
          margin_pct: number | null
          name: string | null
          our_price: number | null
          sku: string | null
          total_qty: number | null
          vendor_count: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_points_transaction: {
        Args: {
          p_admin_user_id?: string
          p_amount: number
          p_expires_at?: string
          p_order_id?: string
          p_product_id?: string
          p_reason?: string
          p_type: string
          p_user_id: string
        }
        Returns: Json
      }
      calculate_final_price: {
        Args: {
          p_points_to_redeem?: number
          p_product_id: string
          p_redeem_rate?: number
        }
        Returns: Json
      }
      get_carts_for_abandonment: {
        Args: { p_hours_max: number; p_hours_min: number; p_sequence: number }
        Returns: {
          cart_id: string
          emails_sent: number
          guest_email: string
          last_activity: string
          total: number
          user_id: string
        }[]
      }
      get_effective_map: { Args: { p_product_id: string }; Returns: number }
      get_or_create_user_cart: { Args: { p_user_id: string }; Returns: string }
      get_product_facets: {
        Args: {
          p_brand?: string
          p_category?: string
          p_in_stock?: boolean
          p_max_price?: number
          p_min_price?: number
        }
        Returns: Json
      }
      product_fits_vehicle: {
        Args: { p_product_id: string; p_vehicle_id: string }
        Returns: boolean
      }
      refresh_facets_cache: { Args: never; Returns: undefined }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      unaccent: { Args: { "": string }; Returns: string }
      update_user_order_stats: {
        Args: { p_order_total: number; p_user_id: string }
        Returns: undefined
      }
      upsert_cart_items: {
        Args: { p_cart_id: string; p_items: Json }
        Returns: undefined
      }
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
