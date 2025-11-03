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
    const baseUrl = process.env.OPENAPI_SDI_BASE_URL || 'https://test.sdi.openapi.it';
    // Assicurati che l'URL abbia il protocollo
    this.baseUrl = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;
    this.token = process.env.OPENAPI_SDI_TOKEN || '';

    console.log(`🔧 OpenAPI SDI Configurato: baseUrl=${this.baseUrl}, token=${this.token ? 'Configurato' : 'NO'}`);

    if (!this.token) {
      console.warn('⚠️  OPENAPI_SDI_TOKEN non configurato - Modalità MOCK attiva');
      console.warn('   Per usare API reale, configura OPENAPI_SDI_TOKEN su Vercel');
    } else {
      console.log('✅ OPENAPI_SDI_TOKEN configurato - Modalità PRODUCTION');
    }
  }

  private async makeRequest(endpoint: string, data: any): Promise<any> {
    // Mock mode se token non configurato
    if (!this.token) {
      console.log('🎭 MOCK MODE OpenAPI SDI attivo');
      console.log(`   Endpoint: ${endpoint}`);
      console.log(`   Data: ${JSON.stringify(data).substring(0, 200)}...`);
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
      console.log(`   Payload:`, JSON.stringify(data, null, 2).substring(0, 1000));
      
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

  private async makeRequestXML(endpoint: string, xmlData: string): Promise<any> {
    // Mock mode se token non configurato
    if (!this.token) {
      console.log('🎭 MOCK MODE OpenAPI SDI attivo (XML)');
      console.log(`   Endpoint: ${endpoint}`);
      console.log(`   XML: ${xmlData.substring(0, 200)}...`);
      return {
        data: { uuid: `MOCK-${Date.now()}` },
        date: new Date().toISOString(),
        status: 'issued',
      };
    }

    const url = `${this.baseUrl}${endpoint}`;
    
    try {
      console.log(`📡 Chiamata OpenAPI SDI (XML): ${endpoint}`);
      console.log(`   URL: ${url}`);
      console.log(`   Token configurato: ${this.token ? 'Sì (' + this.token.substring(0, 20) + '...)' : 'NO'}`);
      console.log(`   XML length: ${xmlData.length} bytes`);
      console.log(`   XML preview: ${xmlData.substring(0, 500)}...`);
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/xml',
        },
        body: xmlData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ OpenAPI SDI Error: ${response.status} ${response.statusText}`);
        console.error(`   Response body: ${errorText.substring(0, 500)}`);
        throw new Error(`OpenAPI SDI error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      console.log(`✅ OpenAPI SDI Success (XML): ${JSON.stringify(result).substring(0, 200)}...`);
      return result;
    } catch (error) {
      console.error('Errore chiamata OpenAPI SDI (XML):', error);
      throw error;
    }
  }

  // Genera XML fattura elettronica PA
  private generateFatturaXML(invoiceData: InvoiceData): string {
    const progressivoInvio = `INV-${Date.now()}`;
    const dataFattura = invoiceData.date.toISOString().split('T')[0];
    const supplierVatCode = invoiceData.supplier.vatNumber.replace(/\D/g, '');
    const customerVatCode = invoiceData.customer.vatNumber?.replace(/\D/g, '') || '';
    
    // Escape XML per descrizioni e testi
    const escapeXML = (str: string) => {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    };

    // Genera righe dettaglio
    let dettaglioLinee = '';
    let totaleImponibile = 0;
    let totaleImposta = 0;

    invoiceData.items.forEach((item, index) => {
      const imponibile = item.totalAmount / (1 + item.vatRate / 100);
      const imposta = item.totalAmount - imponibile;
      totaleImponibile += imponibile;
      totaleImposta += imposta;

      dettaglioLinee += `
            <DettaglioLinee>
                <NumeroLinea>${index + 1}</NumeroLinea>
                <Descrizione>${escapeXML(item.description)}</Descrizione>
                <Quantita>${item.quantity.toFixed(2)}</Quantita>
                <PrezzoUnitario>${item.unitPrice.toFixed(2)}</PrezzoUnitario>
                <PrezzoTotale>${imponibile.toFixed(2)}</PrezzoTotale>
                <AliquotaIVA>${item.vatRate.toFixed(2)}</AliquotaIVA>
            </DettaglioLinee>`;
    });

    // Raggruppa IVA per aliquote
    const ivaGroups: { [key: number]: { imponibile: number; imposta: number } } = {};
    invoiceData.items.forEach(item => {
      const imponibile = item.totalAmount / (1 + item.vatRate / 100);
      const imposta = item.totalAmount - imponibile;
      if (!ivaGroups[item.vatRate]) {
        ivaGroups[item.vatRate] = { imponibile: 0, imposta: 0 };
      }
      ivaGroups[item.vatRate].imponibile += imponibile;
      ivaGroups[item.vatRate].imposta += imposta;
    });

    let datiRiepilogo = '';
    Object.keys(ivaGroups).forEach(aliquota => {
      const key = Number(aliquota);
      datiRiepilogo += `
            <DatiRiepilogo>
                <AliquotaIVA>${aliquota}</AliquotaIVA>
                <ImponibileImporto>${ivaGroups[key].imponibile.toFixed(2)}</ImponibileImporto>
                <Imposta>${ivaGroups[key].imposta.toFixed(2)}</Imposta>
            </DatiRiepilogo>`;
    });

    // Nome cliente
    const nomeCliente = invoiceData.customer.companyName || 
                       `${invoiceData.customer.firstName} ${invoiceData.customer.lastName}`.trim();

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPA12" 
    xmlns:ds="http://www.w3.org/2000/09/xmldsig#" 
    xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" 
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" 
    xsi:schemaLocation="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2 http://www.fatturapa.gov.it/export/fatturazione/sdi/fatturapa/v1.2/Schema_del_file_xml_FatturaPA_versione_1.2.xsd">
    <FatturaElettronicaHeader>
        <DatiTrasmissione>
            <IdTrasmittente>
                <IdPaese>IT</IdPaese>
                <IdCodice>${supplierVatCode}</IdCodice>
            </IdTrasmittente>
            <ProgressivoInvio>${progressivoInvio}</ProgressivoInvio>
            <FormatoTrasmissione>FPR12</FormatoTrasmissione>
            <CodiceDestinatario>${invoiceData.customer.sdiCode || '0000000'}</CodiceDestinatario>${invoiceData.customer.pec ? `\n            <PECDestinatario>${escapeXML(invoiceData.customer.pec)}</PECDestinatario>` : ''}
        </DatiTrasmissione>
        <CedentePrestatore>
            <DatiAnagrafici>
                <IdFiscaleIVA>
                    <IdPaese>IT</IdPaese>
                    <IdCodice>${supplierVatCode}</IdCodice>
                </IdFiscaleIVA>
                ${invoiceData.supplier.taxCode ? `<CodiceFiscale>${invoiceData.supplier.taxCode}</CodiceFiscale>` : ''}
                <Anagrafica>
                    <Denominazione>${escapeXML(invoiceData.supplier.companyName)}</Denominazione>
                </Anagrafica>
                <RegimeFiscale>RF01</RegimeFiscale>
            </DatiAnagrafici>
            <Sede>
                <Indirizzo>${escapeXML(invoiceData.supplier.address.addressLine1)}</Indirizzo>
                <CAP>${invoiceData.supplier.address.postalCode}</CAP>
                <Comune>${escapeXML(invoiceData.supplier.address.city)}</Comune>
                <Provincia>${invoiceData.supplier.address.province}</Provincia>
                <Nazione>IT</Nazione>
            </Sede>
        </CedentePrestatore>
        <CessionarioCommittente>
            <DatiAnagrafici>
                ${customerVatCode ? `<IdFiscaleIVA>
                    <IdPaese>IT</IdPaese>
                    <IdCodice>${customerVatCode}</IdCodice>
                </IdFiscaleIVA>` : ''}
                ${invoiceData.customer.taxCode ? `<CodiceFiscale>${invoiceData.customer.taxCode}</CodiceFiscale>` : ''}
                <Anagrafica>
                    <Denominazione>${escapeXML(nomeCliente)}</Denominazione>
                </Anagrafica>
            </DatiAnagrafici>
            <Sede>
                <Indirizzo>${escapeXML(invoiceData.customer.address.addressLine1)}</Indirizzo>
                <CAP>${invoiceData.customer.address.postalCode}</CAP>
                <Comune>${escapeXML(invoiceData.customer.address.city)}</Comune>
                <Provincia>${invoiceData.customer.address.province}</Provincia>
                <Nazione>IT</Nazione>
            </Sede>
        </CessionarioCommittente>
    </FatturaElettronicaHeader>
    <FatturaElettronicaBody>
        <DatiGenerali>
            <DatiGeneraliDocumento>
                <TipoDocumento>TD01</TipoDocumento>
                <Divisa>EUR</Divisa>
                <Data>${dataFattura}</Data>
                <Numero>${escapeXML(invoiceData.number)}</Numero>
            </DatiGeneraliDocumento>
        </DatiGenerali>
        <DatiBeniServizi>
            ${dettaglioLinee}
            ${datiRiepilogo}
        </DatiBeniServizi>
    </FatturaElettronicaBody>
</p:FatturaElettronica>`;

    return xml;
  }

  // Emetti fattura elettronica
  async issueInvoice(invoiceData: InvoiceData): Promise<{ id: string; date: string }> {
    const xmlPayload = this.generateFatturaXML(invoiceData);

    const result = await this.makeRequestXML('/invoices', xmlPayload);
    return {
      id: result.data.uuid || result.id,
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
    vatNumber: (process.env.SUPPLIER_VAT_NUMBER || '').replace(/\n/g, '').trim(),
    taxCode: (process.env.SUPPLIER_TAX_CODE || '').replace(/\n/g, '').trim(),
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