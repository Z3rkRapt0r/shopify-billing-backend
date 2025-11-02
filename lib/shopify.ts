import crypto from 'crypto';
import { shopifyCustomerWebhookSchema, shopifyOrderWebhookSchema, ShopifyCustomerWebhook, ShopifyOrderWebhook } from './validators';

// Configurazione Shopify
const SHOPIFY_API_VERSION = '2024-01';

// Verifica HMAC per webhook Shopify
export function verifyShopifyWebhook(body: string, shopifyHmac: string): boolean {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    console.error('SHOPIFY_API_SECRET non configurato');
    return false;
  }

  const computedHmac = crypto
    .createHmac('sha256', secret)
    .update(body, 'utf8')
    .digest('base64');

  return crypto.timingSafeEqual(Buffer.from(shopifyHmac), Buffer.from(computedHmac));
}

// Client per Admin API di Shopify
export class ShopifyAdminClient {
  private shopDomain: string;
  private accessToken: string;

  constructor(shopDomain: string, accessToken: string) {
    this.shopDomain = shopDomain;
    this.accessToken = accessToken;
  }

  private async makeRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `https://${this.shopDomain}/admin/api/${SHOPIFY_API_VERSION}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  // Ottenere clienti (paginato)
  async getCustomers(params: { limit?: number; since_id?: string } = {}) {
    const searchParams = new URLSearchParams();
    if (params.limit) searchParams.append('limit', params.limit.toString());
    if (params.since_id) searchParams.append('since_id', params.since_id);

    const endpoint = `/customers.json?${searchParams.toString()}`;
    return this.makeRequest(endpoint);
  }

  // Ottenere un cliente specifico
  async getCustomer(customerId: string) {
    return this.makeRequest(`/customers/${customerId}.json`);
  }

  // Ottenere metafields di un cliente
  async getCustomerMetafields(customerId: string) {
    return this.makeRequest(`/customers/${customerId}/metafields.json`);
  }

  // Ottenere ordini (paginato)
  async getOrders(params: { limit?: number; since_id?: string; status?: string } = {}) {
    const searchParams = new URLSearchParams();
    if (params.limit) searchParams.append('limit', params.limit.toString());
    if (params.since_id) searchParams.append('since_id', params.since_id);
    if (params.status) searchParams.append('status', params.status);

    const endpoint = `/orders.json?${searchParams.toString()}`;
    return this.makeRequest(endpoint);
  }

  // Ottenere un ordine specifico
  async getOrder(orderId: string) {
    return this.makeRequest(`/orders/${orderId}.json`);
  }

  // Creare o aggiornare metafield per un cliente
  async updateCustomerMetafield(customerId: string, namespace: string, key: string, value: string, type: string = 'single_line_text_field') {
    const endpoint = `/customers/${customerId}/metafields.json`;
    
    return this.makeRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify({
        metafield: {
          namespace,
          key,
          value,
          type,
        },
      }),
    });
  }
}

// Factory per creare client Shopify
export function createShopifyClient(): ShopifyAdminClient {
  const shopDomain = process.env.SHOPIFY_SHOP;
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!shopDomain || !accessToken) {
    throw new Error('SHOPIFY_SHOP e SHOPIFY_ACCESS_TOKEN devono essere configurati');
  }

  return new ShopifyAdminClient(shopDomain, accessToken);
}

// Parser per webhook customer
export function parseCustomerWebhook(body: any): ShopifyCustomerWebhook {
  try {
    return shopifyCustomerWebhookSchema.parse(body);
  } catch (error) {
    console.error('Errore nel parsing webhook customer:', error);
    throw new Error('Webhook customer non valido');
  }
}

// Parser per webhook order
export function parseOrderWebhook(body: any): ShopifyOrderWebhook {
  try {
    return shopifyOrderWebhookSchema.parse(body);
  } catch (error) {
    console.error('Errore nel parsing webhook order:', error);
    throw new Error('Webhook order non valido');
  }
}

// Validazione Customer Account API token
export async function verifyCustomerToken(token: string): Promise<any> {
  try {
    // Verifica del token JWT con Customer Account API di Shopify
    const response = await fetch(`https://${process.env.SHOPIFY_SHOP}/api/customer/current`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Token non valido');
    }

    return response.json();
  } catch (error) {
    console.error('Errore verifica token customer:', error);
    throw new Error('Token customer non valido');
  }
}

// Estrai customer ID dal token JWT (senza verifica completa)
export function extractCustomerIdFromToken(token: string): string | null {
  try {
    // Il token JWT di Shopify Customer Account API contiene il customer ID nel payload
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    return payload.sub || payload.customer_id || null;
  } catch (error) {
    console.error('Errore estrazione customer ID dal token:', error);
    return null;
  }
}

// Funzione per generare URL di autenticazione Customer Account API
export function generateCustomerAuthUrl(redirectUri: string): string {
  const shopDomain = process.env.SHOPIFY_SHOP;
  const clientId = process.env.SHOPIFY_API_KEY;
  
  if (!shopDomain || !clientId) {
    throw new Error('SHOPIFY_SHOP e SHOPIFY_API_KEY devono essere configurati');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: 'customer-read',
  });

  return `https://${shopDomain}/identity/oauth/authorize?${params.toString()}`;
}

// Interfaccia per i metafields di fatturazione
export interface BillingMetafields {
  fatturaAutomaticamente?: boolean;
  clienteUE?: boolean;
  codiceSdi?: string;
  codiceFiscale?: string;
  partitaIva?: string;
  ragioneSociale?: string;
}

// Funzione per estrarre dati di fatturazione dai metafields di Shopify
export function extractBillingDataFromMetafields(metafields: any[]): BillingMetafields | null {
  if (!metafields || metafields.length === 0) {
    return null;
  }

  const billingData: BillingMetafields = {};
  let hasAnyField = false;

  // 🔍 DEBUG: Log tutti i metafields per capire la struttura
  console.log(`🔍 Metafields ricevuti (${metafields.length}):`, JSON.stringify(metafields, null, 2));

  for (const metafield of metafields) {
    // Supporta sia "custom" che altri namespace
    const key = metafield.key.toLowerCase().replace(/_/g, '');
    
    console.log(`  🔑 Key: "${key}", Value: "${metafield.value}", Type: "${metafield.type}"`);
    
    switch (key) {
      case 'fatturaautomaticamente':
      case 'fatturaautomatica':
      case 'autofattura':
        billingData.fatturaAutomaticamente = metafield.value === 'true' || metafield.value === true;
        hasAnyField = true;
        break;
      
      case 'clienteue':
      case 'clienteunione':
      case 'clienteeuropa':
        billingData.clienteUE = metafield.value === 'true' || metafield.value === true;
        hasAnyField = true;
        break;
      
      case 'codicesdi':
      case 'sdi':
      case 'codicedestinario':
        billingData.codiceSdi = metafield.value?.toString() || undefined;
        hasAnyField = true;
        break;
      
      case 'codicefiscale':
      case 'cf':
      case 'taxcode':
        billingData.codiceFiscale = metafield.value?.toString() || undefined;
        hasAnyField = true;
        break;
      
      case 'partitaiva':
      case 'piva':
      case 'vatnumber':
        billingData.partitaIva = metafield.value?.toString() || undefined;
        hasAnyField = true;
        break;
      
      case 'ragionesociale':
      case 'companyname':
      case 'azienda':
        billingData.ragioneSociale = metafield.value?.toString() || undefined;
        hasAnyField = true;
        break;
    }
  }

  // Se almeno un campo è presente, il cliente è Business
  return hasAnyField ? billingData : null;
}

// Funzione per verificare se un cliente è Business basandosi sui metafields
export function isBusinessCustomer(metafields: any[]): boolean {
  const billingData = extractBillingDataFromMetafields(metafields);
  
  if (!billingData) {
    return false;
  }

  // Un cliente è Business se ha almeno Partita IVA o Ragione Sociale
  return !!(billingData.partitaIva || billingData.ragioneSociale);
}