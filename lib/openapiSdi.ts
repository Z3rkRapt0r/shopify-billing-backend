import { prisma } from './prisma';

// Interfacce per OpenAPI SDI
export interface SupplierData {
  vatNumber: string;
  taxCode: string;
  companyName: string;
  address: {
    addressLine1: string;
    addressLine2?: string;
    city: string;
    province: string;
    postalCode: string;
    countryCode: string;
  };
}

export interface CustomerData {
  vatNumber?: string;
  taxCode?: string;
  companyName?: string;
  firstName?: string;
  lastName?: string;
  address: {
    addressLine1: string;
    addressLine2?: string;
    city: string;
    province: string;
    postalCode: string;
    countryCode: string;
  };
  pec?: string;
  sdiCode?: string;
}

export interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
  totalAmount: number;
}

export interface InvoiceData {
  number: string;
  date: Date;
  supplier: SupplierData;
  customer: CustomerData;
  items: InvoiceItem[];
  totalAmount: number;
  totalVat: number;
  paymentMethod?: string;
  paymentDueDate?: Date;
}

export interface CreditNoteData extends Omit<InvoiceData, 'number'> {
  invoiceNumber: string;
  reason: string;
}

// Client OpenAPI SDI
export class OpenAPISDIClient {
  private baseUrl: string;
  private token: string;

  constructor() {
    this.baseUrl = process.env.OPENAPI_SDI_BASE_URL || 'https://api.openapi.it/sdi';
    this.token = process.env.OPENAPI_SDI_TOKEN || '';

    if (!this.token) {
      console.warn('OPENAPI_SDI_TOKEN non configurato, verrà utilizzato un mock');
    }
  }

  private async makeRequest(endpoint: string, data: any): Promise<any> {
    // Mock mode se token non configurato
    if (!this.token) {
      console.log('Mock mode OpenAPI SDI:', endpoint, data);
      return {
        id: `MOCK-${Date.now()}`,
        date: new Date().toISOString(),
        status: 'issued',
      };
    }

    const url = `${this.baseUrl}${endpoint}`;
    
    try {
      console.log(`📡 Chiamata OpenAPI SDI: ${endpoint}`);
      console.log(`   URL: ${url}`);
      console.log(`   Token configurato: ${this.token ? 'Sì (' + this.token.substring(0, 20) + '...)' : 'NO'}`);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ OpenAPI SDI Error: ${response.status} ${response.statusText}`);
        console.error(`   Response body: ${errorText.substring(0, 500)}`);
        throw new Error(`OpenAPI SDI error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      console.log(`✅ OpenAPI SDI Success: ${JSON.stringify(result).substring(0, 200)}...`);
      return result;
    } catch (error) {
      console.error('Errore chiamata OpenAPI SDI:', error);
      throw error;
    }
  }

  // Emetti fattura elettronica
  async issueInvoice(invoiceData: InvoiceData): Promise<{ id: string; date: string }> {
    const payload = {
      supplier: {
        vat_number: invoiceData.supplier.vatNumber,
        tax_code: invoiceData.supplier.taxCode,
        company_name: invoiceData.supplier.companyName,
        address: invoiceData.supplier.address,
      },
      customer: {
        vat_number: invoiceData.customer.vatNumber,
        tax_code: invoiceData.customer.taxCode,
        company_name: invoiceData.customer.companyName,
        first_name: invoiceData.customer.firstName,
        last_name: invoiceData.customer.lastName,
        address: invoiceData.customer.address,
        pec: invoiceData.customer.pec,
        sdi_code: invoiceData.customer.sdiCode,
      },
      invoice: {
        number: invoiceData.number,
        date: invoiceData.date.toISOString().split('T')[0],
        items: invoiceData.items.map(item => ({
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          vat_rate: item.vatRate,
          total_amount: item.totalAmount,
        })),
        total_amount: invoiceData.totalAmount,
        total_vat: invoiceData.totalVat,
        payment_method: invoiceData.paymentMethod,
        payment_due_date: invoiceData.paymentDueDate?.toISOString().split('T')[0],
      },
    };

    const result = await this.makeRequest('/supplier-invoice', payload);
    return {
      id: result.id,
      date: result.date || new Date().toISOString(),
    };
  }

  // Emetti nota di credito
  async issueCreditNote(creditNoteData: CreditNoteData): Promise<{ id: string; date: string }> {
    const payload = {
      supplier: {
        vat_number: creditNoteData.supplier.vatNumber,
        tax_code: creditNoteData.supplier.taxCode,
        company_name: creditNoteData.supplier.companyName,
        address: creditNoteData.supplier.address,
      },
      customer: {
        vat_number: creditNoteData.customer.vatNumber,
        tax_code: creditNoteData.customer.taxCode,
        company_name: creditNoteData.customer.companyName,
        first_name: creditNoteData.customer.firstName,
        last_name: creditNoteData.customer.lastName,
        address: creditNoteData.customer.address,
        pec: creditNoteData.customer.pec,
        sdi_code: creditNoteData.customer.sdiCode,
      },
      credit_note: {
        invoice_number: creditNoteData.invoiceNumber,
        reason: creditNoteData.reason,
        date: creditNoteData.date.toISOString().split('T')[0],
        items: creditNoteData.items.map(item => ({
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          vat_rate: item.vatRate,
          total_amount: item.totalAmount,
        })),
        total_amount: creditNoteData.totalAmount,
        total_vat: creditNoteData.totalVat,
        payment_method: creditNoteData.paymentMethod,
        payment_due_date: creditNoteData.paymentDueDate?.toISOString().split('T')[0],
      },
    };

    const result = await this.makeRequest('/credit-note', payload);
    return {
      id: result.id,
      date: result.date || new Date().toISOString(),
    };
  }
}

// Factory per creare client OpenAPI SDI
export function createOpenAPIClient(): OpenAPISDIClient {
  return new OpenAPISDIClient();
}

// Funzioni helper per costruire dati fattura dal database
export async function buildInvoiceData(orderId: string): Promise<InvoiceData | null> {
  const order = await prisma.orderSnapshot.findUnique({
    where: { shopifyOrderId: orderId },
    include: {
      user: {
        include: {
          billingProfile: true,
        },
      },
    },
  });

  if (!order) {
    return null;
  }

  const supplierData: SupplierData = {
    vatNumber: process.env.SUPPLIER_VAT_NUMBER || '',
    taxCode: process.env.SUPPLIER_TAX_CODE || '',
    companyName: 'La Tua Azienda SRL', // Da configurare
    address: {
      addressLine1: 'Via del Fornitore 1',
      city: 'Milano',
      province: 'MI',
      postalCode: '20121',
      countryCode: 'IT',
    },
  };

  const customerData: CustomerData = {
    companyName: order.user.billingProfile?.companyName || `${order.user.firstName} ${order.user.lastName}`,
    firstName: order.user.firstName || undefined,
    lastName: order.user.lastName || undefined,
    vatNumber: order.user.billingProfile?.vatNumber || undefined,
    taxCode: order.user.billingProfile?.taxCode || undefined,
    pec: order.user.billingProfile?.pec || undefined,
    sdiCode: order.user.billingProfile?.sdiCode || undefined,
    address: {
      addressLine1: order.user.billingProfile?.addressLine1 || 'Indirizzo non specificato',
      addressLine2: order.user.billingProfile?.addressLine2 || undefined,
      city: order.user.billingProfile?.city || 'Città non specificata',
      province: order.user.billingProfile?.province || '',
      postalCode: order.user.billingProfile?.postalCode || '00000',
      countryCode: order.user.billingProfile?.countryCode || order.user.countryCode || 'IT',
    },
  };

  // Items semplificati - in un caso reale andrebbero presi da Shopify
  const items: InvoiceItem[] = [
    {
      description: `Ordine ${order.orderNumber}`,
      quantity: 1,
      unitPrice: Number(order.totalPrice) || 0,
      vatRate: 22, // IVA standard italiana
      totalAmount: Number(order.totalPrice) || 0,
    },
  ];

  const totalAmount = items.reduce((sum, item) => sum + item.totalAmount, 0);
  const totalVat = items.reduce((sum, item) => sum + (item.totalAmount * item.vatRate / 100), 0);

  return {
    number: `INV-${order.orderNumber}-${Date.now()}`,
    date: new Date(),
    supplier: supplierData,
    customer: customerData,
    items,
    totalAmount,
    totalVat,
    paymentMethod: 'MP05', // Bonifico bancario
    paymentDueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 giorni
  };
}

// Funzione helper per costruire dati nota di credito
export async function buildCreditNoteData(orderId: string, reason: string): Promise<CreditNoteData | null> {
  const invoiceData = await buildInvoiceData(orderId);
  if (!invoiceData) {
    return null;
  }

  return {
    ...invoiceData,
    invoiceNumber: invoiceData.number,
    reason,
  };
}