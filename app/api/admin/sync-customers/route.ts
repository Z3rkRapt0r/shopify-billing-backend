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
    let syncedCount = 0;
    let hasMore = true;
    let lastCustomerId = since_id;

    while (hasMore && syncedCount < limit) {
      const response = await shopifyClient.getCustomers({
        limit: Math.min(50, limit - syncedCount),
        since_id: lastCustomerId,
      });

      const customers = response.customers || [];
      
      if (customers.length === 0) {
        hasMore = false;
        break;
      }

      for (const customer of customers) {
        try {
          // Recupera metafields del cliente
          const metafieldsResponse = await shopifyClient.getCustomerMetafields(customer.id.toString());
          const metafields = metafieldsResponse.metafields || [];
          
          // Estrai dati di fatturazione dai metafields
          const billingData = extractBillingDataFromMetafields(metafields);
          const isBusiness = isBusinessCustomer(metafields);
          
          // Upsert utente
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

          // Se il cliente è Business (ha metafields compilati), crea/aggiorna billing profile
          if (isBusiness && billingData) {
            const primaryAddress = customer.addresses?.[0];
            
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
          } else {
            console.log(`ℹ️  Synced regular customer: ${customer.email}`);
          }

          syncedCount++;
          lastCustomerId = customer.id.toString();
        } catch (error) {
          console.error(`Error syncing customer ${customer.id}:`, error);
        }
      }
    }

    console.log(`Synced ${syncedCount} customers from Shopify`);
    return NextResponse.json({
      success: true,
      syncedCount,
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