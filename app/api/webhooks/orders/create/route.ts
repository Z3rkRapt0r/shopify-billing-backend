import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyShopifyWebhook, parseOrderWebhook } from '@/lib/shopify';
import { orderSnapshotSchema } from '@/lib/validators';

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
    const webhookData = parseOrderWebhook(JSON.parse(body));
    
    // Trova l'utente nel nostro database
    const user = await prisma.user.findUnique({
      where: {
        shopifyCustomerId: webhookData.customer.id,
      },
      include: {
        billingProfile: true,
      },
    });

    if (!user) {
      console.warn(`User not found for Shopify customer ID: ${webhookData.customer.id}`);
      // Creiamo l'utente base se non esiste
      const newUser = await prisma.user.create({
        data: {
          shopifyCustomerId: webhookData.customer.id,
          email: webhookData.customer.email,
          firstName: webhookData.customer.first_name,
          lastName: webhookData.customer.last_name,
        },
      });

      // Crea l'ordine senza profilo fatturazione
      const orderData = {
        userId: newUser.id,
        shopifyOrderId: webhookData.id,
        orderNumber: webhookData.order_number,
        currency: webhookData.currency,
        totalPrice: webhookData.total_price,
        shopifyCreatedAt: webhookData.created_at,
        hasVatProfile: false,
        invoiceStatus: 'PENDING' as const,
      };

      const validatedOrderData = orderSnapshotSchema.parse(orderData);
      await prisma.orderSnapshot.create({
        data: validatedOrderData,
      });

      console.log(`Order ${webhookData.id} created for new user`);
      return NextResponse.json({ success: true });
    }

    // Determina lo stato della fattura in base al paese del cliente
    const billingCountryCode = webhookData.billing_address?.country_code || user.countryCode;
    let invoiceStatus: 'PENDING' | 'FOREIGN' = 'PENDING';
    
    if (billingCountryCode && billingCountryCode !== 'IT') {
      invoiceStatus = 'FOREIGN';
    }

    // Verifica se l'utente ha un profilo fatturazione valido per l'Italia
    const hasVatProfile = user.billingProfile && 
                         user.billingProfile.isBusiness && 
                         billingCountryCode === 'IT' &&
                         (user.billingProfile.vatNumber || user.billingProfile.taxCode);

    // Crea l'ordine
    const orderData = {
      userId: user.id,
      shopifyOrderId: webhookData.id,
      orderNumber: webhookData.order_number,
      currency: webhookData.currency,
      totalPrice: webhookData.total_price,
      shopifyCreatedAt: webhookData.created_at,
      hasVatProfile,
      invoiceStatus,
    };

    const validatedOrderData = orderSnapshotSchema.parse(orderData);
    
    await prisma.orderSnapshot.upsert({
      where: {
        shopifyOrderId: webhookData.id,
      },
      update: validatedOrderData,
      create: validatedOrderData,
    });

    // Se l'ordine è per un cliente italiano con profilo VAT valido, aggiungilo alla coda
    if (hasVatProfile && invoiceStatus === 'PENDING') {
      await prisma.queueJob.create({
        data: {
          type: 'invoice',
          payload: {
            shopifyOrderId: webhookData.id,
          },
          status: 'PENDING',
          scheduledAt: new Date(),
        },
      });
    }

    console.log(`Order ${webhookData.id} processed successfully. Status: ${invoiceStatus}, Has VAT: ${hasVatProfile}`);
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error processing order webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}