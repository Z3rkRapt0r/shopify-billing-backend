import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createShopifyClient } from '@/lib/shopify';
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

          // Se ha indirizzo italiano, crea/aggiorna billing profile
          const primaryAddress = customer.addresses?.[0];
          if (primaryAddress && primaryAddress.country_code === 'IT') {
            const billingProfileData = {
              companyName: primaryAddress.company || undefined,
              addressLine1: primaryAddress.address1,
              addressLine2: primaryAddress.address2,
              city: primaryAddress.city,
              province: primaryAddress.province,
              postalCode: primaryAddress.zip,
              countryCode: primaryAddress.country_code,
              isBusiness: !!primaryAddress.company,
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