import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createShopifyClient } from '@/lib/shopify';

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

    // Recupera metafields da Shopify
    const shopifyClient = createShopifyClient();
    let shopifyMetafields = [];
    
    try {
      const metafieldsResponse = await shopifyClient.getCustomerMetafields(shopifyCustomerId);
      shopifyMetafields = metafieldsResponse.metafields || [];
    } catch (error) {
      console.error('Error fetching Shopify metafields:', error);
      // Non blocchiamo la risposta se Shopify fallisce
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
        billingProfile: user.billingProfile,
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

