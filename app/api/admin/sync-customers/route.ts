import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createShopifyClient, extractBillingDataFromMetafields, isBusinessCustomer } from '@/lib/shopify';
import { billingProfileSchema } from '@/lib/validators';

// POST - Sincronizza clienti da Shopify
export async function POST(request: NextRequest) {
  try {
    // Verifica autenticazione admin (semplice per ora)
    const adminPassword = process.env.ADMIN_PASSWORD;
    const authHeader = request.headers.get('authorization');
    
    if (!adminPassword || !authHeader || authHeader !== `Bearer ${adminPassword}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { limit = 50, since_id } = body;

    const shopifyClient = createShopifyClient();
    let syncedCount = 0; // Clienti Business sincronizzati
    let processedCount = 0; // Clienti totali processati
    let skippedCount = 0; // Clienti privati saltati
    let hasMore = true;
    let lastCustomerId = since_id;

    // Funzione helper per delay (evita 429)
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    while (hasMore && processedCount < limit) {
      const response = await shopifyClient.getCustomers({
        limit: Math.min(50, limit - processedCount),
        since_id: lastCustomerId,
      });

      const customers = response.customers || [];
      
      if (customers.length === 0) {
        hasMore = false;
        break;
      }

      for (const customer of customers) {
        try {
          // Delay di 300ms tra le chiamate per evitare 429 (max 3 richieste/secondo)
          await delay(300);
          
          // Recupera metafields del cliente
          const metafieldsResponse = await shopifyClient.getCustomerMetafields(customer.id.toString());
          const metafields = metafieldsResponse.metafields || [];
          
          // Estrai dati di fatturazione dai metafields
          const billingData = extractBillingDataFromMetafields(metafields);
          const isBusiness = isBusinessCustomer(metafields);
          
          // IMPORTANTE: Sincronizza SOLO i clienti Business
          if (!isBusiness) {
            console.log(`⏭️  Skipping private customer: ${customer.email} (no business metafields)`);
            skippedCount++;
            processedCount++;
            lastCustomerId = customer.id.toString();
            continue;
          }

          // Cliente Business - sincronizza
          const user = await prisma.user.upsert({
            where: {
              shopifyCustomerId: customer.id.toString(),
            },
            update: {
              email: customer.email,
              firstName: customer.first_name,
              lastName: customer.last_name,
              countryCode: customer.addresses?.[0]?.country_code,
            },
            create: {
              shopifyCustomerId: customer.id.toString(),
              email: customer.email,
              firstName: customer.first_name,
              lastName: customer.last_name,
              countryCode: customer.addresses?.[0]?.country_code,
            },
          });

          const primaryAddress = customer.addresses?.[0];
          
          // TypeScript safety: billingData è garantito non-null qui
          if (!billingData) {
            console.error(`Unexpected: billingData is null for business customer ${customer.id}`);
            continue;
          }
          
          const billingProfileData = {
            companyName: billingData.ragioneSociale || undefined,
            vatNumber: billingData.partitaIva || undefined,
            taxCode: billingData.codiceFiscale || undefined,
            sdiCode: billingData.codiceSdi || undefined,
            addressLine1: primaryAddress?.address1 || undefined,
            addressLine2: primaryAddress?.address2 || undefined,
            city: primaryAddress?.city || undefined,
            province: primaryAddress?.province || undefined,
            postalCode: primaryAddress?.zip || undefined,
            countryCode: primaryAddress?.country_code || 'IT',
            isBusiness: true,
          };

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
          
          console.log(`✅ Synced business customer: ${customer.email} (${billingData.ragioneSociale || billingData.partitaIva})`);
          syncedCount++;
          processedCount++;
          lastCustomerId = customer.id.toString();
        } catch (error) {
          console.error(`Error syncing customer ${customer.id}:`, error);
          processedCount++;
          lastCustomerId = customer.id.toString();
        }
      }
    }

    console.log(`Processed ${processedCount} customers: ${syncedCount} Business synced, ${skippedCount} private skipped`);
    return NextResponse.json({
      success: true,
      syncedCount, // Clienti Business sincronizzati
      processedCount, // Totale clienti processati
      skippedCount, // Clienti privati saltati
      lastCustomerId,
      hasMore,
    });

  } catch (error) {
    console.error('Error syncing customers:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET - Ottieni stato sincronizzazione
export async function GET(request: NextRequest) {
  try {
    // Verifica autenticazione admin
    const adminPassword = process.env.ADMIN_PASSWORD;
    const authHeader = request.headers.get('authorization');
    
    if (!adminPassword || !authHeader || authHeader !== `Bearer ${adminPassword}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const totalUsers = await prisma.user.count();
    const usersWithBillingProfile = await prisma.billingProfile.count();
    const italianUsers = await prisma.user.count({
      where: { countryCode: 'IT' },
    });
    const businessUsers = await prisma.billingProfile.count({
      where: { isBusiness: true },
    });

    return NextResponse.json({
      totalUsers,
      usersWithBillingProfile,
      italianUsers,
      businessUsers,
    });

  } catch (error) {
    console.error('Error getting sync status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}