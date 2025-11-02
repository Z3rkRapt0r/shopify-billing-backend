import { z } from 'zod';

// Validator per Billing Profile
export const billingProfileSchema = z.object({
  companyName: z.string().nullable().optional(),
  vatNumber: z.string().nullable().optional().refine((val) => {
    if (!val) return true; // optional
    // Validazione P.IVA italiana: 11 cifre, inizia con IT opzionale
    const vatRegex = /^(IT)?[0-9]{11}$/;
    return vatRegex.test(val.replace(/\s/g, ''));
  }, {
    message: 'P.IVA non valida. Deve contenere 11 cifre (opzionalmente precedute da IT)',
  }),
  taxCode: z.string().nullable().optional().refine((val) => {
    if (!val) return true; // optional
    // Validazione Codice Fiscale italiano: 16 caratteri alfanumerici
    const cfRegex = /^[A-Z0-9]{16}$/;
    return cfRegex.test(val.toUpperCase().replace(/\s/g, ''));
  }, {
    message: 'Codice Fiscale non valido. Deve contenere 16 caratteri alfanumerici',
  }),
  pec: z.string().email('PEC non valida').nullable().optional().or(z.literal('')),
  sdiCode: z.string().nullable().optional().refine((val) => {
    if (!val) return true; // optional
    // Codice Destinatario: 7 caratteri o 0000000 per eccezione
    return val.length === 7;
  }, {
    message: 'Codice Destinatario non valido. Deve contenere 7 caratteri',
  }),
  addressLine1: z.string().nullable().optional(),
  addressLine2: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  province: z.string().nullable().optional(),
  postalCode: z.string().nullable().optional(),
  countryCode: z.string().nullable().optional(),
  isBusiness: z.boolean().default(false),
});

// Validator per User
export const userSchema = z.object({
  shopifyCustomerId: z.string(),
  email: z.string().email('Email non valida'),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  countryCode: z.string().nullable().optional(),
});

// Validator per Order Snapshot
export const orderSnapshotSchema = z.object({
  userId: z.string(),
  shopifyOrderId: z.string(),
  orderNumber: z.string().nullable().optional(),
  currency: z.string().nullable().optional(),
  totalPrice: z.number().nullable().optional(),
  shopifyCreatedAt: z.date().nullable().optional(),
  hasVatProfile: z.boolean().default(false),
  invoiceStatus: z.enum(['PENDING', 'ISSUED', 'ERROR', 'FOREIGN']).default('PENDING'),
  invoiceId: z.string().nullable().optional(),
  invoiceDate: z.date().nullable().optional(),
  lastError: z.string().nullable().optional(),
});

// Validator per Credit Note
export const creditNoteSchema = z.object({
  orderId: z.string(),
  reason: z.string().nullable().optional(),
  totalAmount: z.number().nullable().optional(),
  sdiCreditId: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
});

// Validator per Queue Job
export const queueJobSchema = z.object({
  type: z.string(),
  payload: z.any(), // JSON payload
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']).default('PENDING'),
  attempts: z.number().default(0),
  maxAttempts: z.number().default(3),
  lastError: z.string().nullable().optional(),
  scheduledAt: z.date().default(new Date()),
});

// Validator per webhook Shopify
export const shopifyCustomerWebhookSchema = z.object({
  id: z.number().transform(String), // Convert to string for our DB
  email: z.string().email(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  addresses: z.array(z.object({
    country_code: z.string().optional(),
    province: z.string().optional(),
    city: z.string().optional(),
    address1: z.string().optional(),
    address2: z.string().optional(),
    zip: z.string().optional(),
  })).optional(),
});

export const shopifyOrderWebhookSchema = z.object({
  id: z.number().transform(String),
  order_number: z.number().transform(String),
  customer: z.object({
    id: z.number().transform(String),
    email: z.string().email(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
  }),
  currency: z.string().optional(),
  total_price: z.string().transform(Number),
  created_at: z.string().transform(dateStr => new Date(dateStr)),
  billing_address: z.object({
    country_code: z.string().optional(),
    province: z.string().optional(),
    city: z.string().optional(),
    address1: z.string().optional(),
    address2: z.string().optional(),
    zip: z.string().optional(),
  }).optional(),
});

// Validator per API requests
export const markBusinessSchema = z.object({
  shopifyCustomerId: z.string(),
  isBusiness: z.boolean(),
  vatNumber: z.string().nullable().optional(),
  taxCode: z.string().nullable().optional(),
  pec: z.string().email().nullable().optional(),
  sdiCode: z.string().nullable().optional(),
});

export const issueInvoiceSchema = z.object({
  shopifyOrderId: z.string(),
});

export const issueCreditNoteSchema = z.object({
  shopifyOrderId: z.string(),
  reason: z.string(),
});

export const syncCustomersSchema = z.object({
  limit: z.number().nullable().optional().default(50),
  since_id: z.string().nullable().optional(),
});

// Types
export type BillingProfileInput = z.infer<typeof billingProfileSchema>;
export type UserInput = z.infer<typeof userSchema>;
export type OrderSnapshotInput = z.infer<typeof orderSnapshotSchema>;
export type CreditNoteInput = z.infer<typeof creditNoteSchema>;
export type QueueJobInput = z.infer<typeof queueJobSchema>;
export type ShopifyCustomerWebhook = z.infer<typeof shopifyCustomerWebhookSchema>;
export type ShopifyOrderWebhook = z.infer<typeof shopifyOrderWebhookSchema>;
export type MarkBusinessInput = z.infer<typeof markBusinessSchema>;
export type IssueInvoiceInput = z.infer<typeof issueInvoiceSchema>;
export type IssueCreditNoteInput = z.infer<typeof issueCreditNoteSchema>;
export type SyncCustomersInput = z.infer<typeof syncCustomersSchema>;