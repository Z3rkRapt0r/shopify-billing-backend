import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyShopifyWebhook, parseCustomerWebhook, createShopifyClient, extractBillingDataFromMetafields, isBusinessCustomer } from '@/lib/shopify';
import { billingProfileSchema } from '@/lib/validators';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const shopifyHmac = request.headers.get('x-shopify-hmac-sha256');

    // Verifica HMAC
    if (!shopifyHmac || !verifyShopifyWebhook(body, shopifyHmac)) {
      console.error('Webhook HMAC verification failed');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse webhook data
    const webhookData = parseCustomerWebhook(JSON.parse(body));
    
    // Recupera metafields del cliente da Shopify
    const shopifyClient = createShopifyClient();
    const metafieldsResponse = await shopifyClient.getCustomerMetafields(webhookData.id);
    const metafields = metafieldsResponse.metafields || [];
    
    // Estrai dati di fatturazione dai metafields
    const billingData = extractBillingDataFromMetafields(metafields);
    let isBusiness = isBusinessCustomer(metafields);
    
    // 🔍 FALLBACK: Se non ha metafields Business, controlla il campo "company" standard
    const primaryAddress = webhookData.addresses?.[0] as any;
    const hasCompany = primaryAddress?.company && primaryAddress.company.trim().length > 0;
    
    if (!isBusiness && hasCompany) {
      console.log(`🏢 Webhook Update: Cliente con Company field: ${webhookData.email} → "${primaryAddress.company}"`);
      isBusiness = true;
    }
    
    // Upsert utente nel nostro database
    const user = await prisma.user.upsert({
      where: {
        shopifyCustomerId: webhookData.id,
      },
      update: {
        email: webhookData.email,
        firstName: webhookData.first_name,
        lastName: webhookData.last_name,
        countryCode: webhookData.addresses?.[0]?.country_code,
      },
      create: {
        shopifyCustomerId: webhookData.id,
        email: webhookData.email,
        firstName: webhookData.first_name,
        lastName: webhookData.last_name,
        countryCode: webhookData.addresses?.[0]?.country_code,
      },
    });

    // Se il cliente è Business (ha metafields compilati o company field), crea/aggiorna billing profile
    if (isBusiness) {
      const companyName = billingData?.ragioneSociale || primaryAddress?.company || undefined;
      
      const billingProfileData = {
        companyName: companyName,
        vatNumber: billingData?.partitaIva || undefined,
        taxCode: billingData?.codiceFiscale || undefined,
        sdiCode: billingData?.codiceSdi || undefined,
        addressLine1: primaryAddress?.address1 || undefined,
        addressLine2: primaryAddress?.address2 || undefined,
        city: primaryAddress?.city || undefined,
        province: primaryAddress?.province || undefined,
        postalCode: primaryAddress?.zip || undefined,
        countryCode: primaryAddress?.country_code || 'IT',
        isBusiness: true,
      };

      // Validazione con Zod
      const validatedData = billingProfileSchema.parse(billingProfileData);

      await prisma.billingProfile.upsert({
        where: {
          userId: user.id,
        },
        update: validatedData,
        create: {
          userId: user.id,
          ...validatedData,
        },
      });
      
      console.log(`✅ Business customer ${webhookData.id} (${companyName || 'no company name'}) updated`);
    } else {
      // Se non è più Business, rimuovi il billing profile
      await prisma.billingProfile.deleteMany({
        where: { userId: user.id },
      });
      console.log(`ℹ️  Regular customer ${webhookData.id} updated (billing profile removed)`);
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error processing customer update webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}