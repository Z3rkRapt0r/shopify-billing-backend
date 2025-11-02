import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createShopifyClient, extractBillingDataFromMetafields, isBusinessCustomer } from '@/lib/shopify';

// Force dynamic rendering (usa headers per auth)
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { shopifyCustomerId: string } }
) {
  try {
    // Autenticazione admin
    const adminPassword = process.env.ADMIN_PASSWORD;
    const authHeader = request.headers.get('authorization');
    
    if (!adminPassword || !authHeader || authHeader !== `Bearer ${adminPassword}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { shopifyCustomerId } = params;

    // Recupera utente dal database
    const user = await prisma.user.findUnique({
      where: {
        shopifyCustomerId: shopifyCustomerId,
      },
      include: {
        billingProfile: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Cliente non trovato' },
        { status: 404 }
      );
    }

    // Recupera metafields da Shopify (fonte di verità per dati fatturazione)
    const shopifyClient = createShopifyClient();
    let shopifyMetafields = [];
    let billingProfileFromShopify = null;
    
    try {
      const metafieldsResponse = await shopifyClient.getCustomerMetafields(shopifyCustomerId);
      shopifyMetafields = metafieldsResponse.metafields || [];
      
      // Ricostruisci billing profile DAI METAFIELDS in tempo reale
      const billingData = extractBillingDataFromMetafields(shopifyMetafields);
      const isBusiness = isBusinessCustomer(shopifyMetafields);
      
      if (isBusiness && billingData) {
        // Recupera anche i dati del cliente da Shopify per l'indirizzo
        const customerResponse = await shopifyClient.getCustomer(shopifyCustomerId);
        const primaryAddress = customerResponse.customer?.addresses?.[0] as any;
        
        billingProfileFromShopify = {
          companyName: billingData.ragioneSociale || null,
          vatNumber: billingData.partitaIva || null,
          taxCode: billingData.codiceFiscale || null,
          pec: null,
          sdiCode: billingData.codiceSdi || null,
          addressLine1: primaryAddress?.address1 || null,
          addressLine2: primaryAddress?.address2 || null,
          city: primaryAddress?.city || null,
          province: primaryAddress?.province || null,
          postalCode: primaryAddress?.zip || null,
          countryCode: primaryAddress?.country_code || user.countryCode || null,
          isBusiness: true,
          source: 'shopify_realtime', // Flag per indicare che è aggiornato
        };
        
        console.log(`✅ Billing profile recuperato in tempo reale per ${user.email} (non salvato in DB - si aggiorna quando entri nella pagina clienti)`);
      } else {
        console.log(`ℹ️  Cliente ${user.email} non è Business (metafields mancanti o incompleti)`);
      }
    } catch (error) {
      console.error('Error fetching Shopify metafields:', error);
      // Se fallisce, usiamo il billing profile dal DB
    }

    return NextResponse.json({
      success: true,
      customer: {
        id: user.id,
        shopifyCustomerId: user.shopifyCustomerId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        countryCode: user.countryCode,
        createdAt: user.createdAt,
        // IMPORTANTE: Usa billing profile da Shopify se disponibile, altrimenti dal DB
        billingProfile: billingProfileFromShopify || user.billingProfile,
        billingProfileFromDb: user.billingProfile, // Mantieni anche quello del DB per confronto
        shopifyMetafields: shopifyMetafields.map((m: any) => ({
          id: m.id?.toString() || '',
          namespace: m.namespace || '',
          key: m.key || '',
          value: m.value || '',
          type: m.type || 'string',
        })),
      },
    });

  } catch (error) {
    console.error('Error fetching customer details:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

